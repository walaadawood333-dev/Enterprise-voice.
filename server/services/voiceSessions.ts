/**
 * VoiceOrchestrator — CenterAI's real-time execution layer.
 *
 * Responsibilities
 *  • resolve the authenticated organization's agent (never trusted from the client)
 *  • enforce the shared voice session state machine (READY → LISTENING → PROCESSING → SPEAKING …)
 *  • drive the conversation provider (streaming when the transport allows it)
 *  • persist VoiceSession / Message / UsageEvent rows, including measured turn telemetry
 *  • handle barge-in cancellation, resume-after-drop and provider failover without duplicates
 *
 * Nothing here knows about telephony transports: a future PSTN/SIP gateway plugs into the same
 * methods. Raw microphone audio never reaches this process.
 */

import {
  normalizeSessionStatus,
  type AgentLanguage,
  type AgentRow,
  type UsageEventRow,
  type VoiceSessionRow,
} from "../../shared/contracts";
import {
  assertTransition,
  deriveTurnTelemetry,
  telemetryMetadata,
  VOICE_CLOSED,
  voiceProfile,
  type VoiceProviderState,
  type VoiceStateName,
  type VoiceTurnMarkers,
  type VoiceTurnTelemetry,
} from "../../shared/voiceState";
import type {
  AgentRuntimeConfig,
  CreateVoiceSessionResponse,
  VoiceAnalyticsDto,
  VoiceEndResponse,
  VoiceEngineCapabilities,
  VoiceInputResponse,
  VoiceSessionDetail,
  VoiceSessionRecord,
  VoiceStreamFrame,
  VoiceTranscriptMessage,
} from "../../shared/voiceContracts";
import { sanitizeText, ValidationError } from "../../shared/validate";
import type { ConversationRequest } from "../providers/voiceEngine";
import type { Db } from "../db/store";
import { newId } from "../db/store";
import { ApiError, notFound, type Logger } from "../lib/observability";
import {
  DemoConversationProvider,
  OpenAIConversationProvider,
  systemPromptFor,
  type AIConversationProvider,
  type ChatTurn,
  type StreamChunk,
} from "../providers/voiceEngine";
import type { ServerEnv } from "../config/env";
import type { EntitlementEngine } from "./entitlements";
import type { RealtimeSecrets as VoiceSecrets } from "../config/secrets";

const MAX_INPUT = 1200;
const MAX_MESSAGE_STORE = 4000;

interface SessionRuntime {
  state: VoiceStateName;
  startedAtMs: number;
  history: ChatTurn[];
  turnId: string;
  turnSeq: number;
  /** Set when the client barges in or cancels, so generation stops cleanly. */
  abort: AbortController | null;
  lastError: string | null;
  providerState: VoiceProviderState;
  lastTurnTelemetry: VoiceTurnTelemetry | null;
}

const toRecord = (
  row: VoiceSessionRow,
  agentName: string,
  agentStatus: VoiceSessionRecord["agentStatus"],
  runtime?: SessionRuntime
): VoiceSessionRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  agentId: row.agentId,
  agentName,
  agentStatus,
  userId: row.userId,
  language: row.language,
  status: normalizeSessionStatus(row.status),
  testMode: row.testMode ?? false,
  engine: row.engine === "openai" ? "openai" : "demo",
  startedAt: row.startedAt,
  endedAt: row.endedAt,
  durationSeconds: row.durationSeconds,
  messageCount: 0,
  state: runtime?.state ?? "READY",
  providerState: runtime?.providerState ?? "UNAVAILABLE",
});

export function createVoiceOrchestrator(input: {
  db: Db;
  env: ServerEnv;
  logger: Logger;
  secrets: VoiceSecrets;
  entitlements: EntitlementEngine;
  provider?: AIConversationProvider;
  /** Adapters that can flush frames incrementally set this true. */
  streamingCapable?: boolean;
}) {
  const { db, env, logger, secrets, entitlements } = input;
  const streamingCapable = input.streamingCapable === true;

  const openAiProvider = new OpenAIConversationProvider({
    apiKey: () => secrets.openaiKey(),
    baseUrl: () => env.openai.baseUrl,
    model: () => env.voiceEngine.model,
    timeoutMs: () => env.voiceEngine.timeoutMs,
    temperature: () => env.voiceEngine.temperature,
    maxHistoryTurns: () => env.voiceEngine.maxHistoryTurns,
  });

  const demoProvider = new DemoConversationProvider();
  const chosen = input.provider ?? null;

  type Pick = { provider: AIConversationProvider; providerState: VoiceProviderState; fallbackReason?: string };

  const pickProvider = (): Pick => {
    if (chosen) return { provider: chosen, providerState: "PRIMARY" };
    const wanted = env.voiceEngine.engine;
    if (wanted === "demo") {
      return { provider: demoProvider, providerState: "PRIMARY" };
    }
    if (openAiProvider.available()) {
      return { provider: openAiProvider, providerState: "PRIMARY" };
    }
    if (wanted === "openai") {
      throw new ApiError(
        "PROVIDER_NOT_CONFIGURED",
        "Real AI mode was requested but no provider credential is available to the server."
      );
    }
    return {
      provider: demoProvider,
      providerState: "FALLBACK",
      fallbackReason:
        env.appMode === "production"
          ? "No AI provider credential is available to this runtime, so the local demo engine answered."
          : "Demo Mode: no AI provider credential configured — the local demo engine answers.",
    };
  };

  const sessions = new Map<string, SessionRuntime>();

  const runtimeFor = (session: VoiceSessionRow): SessionRuntime => {
    let runtime = sessions.get(session.id);
    if (!runtime) {
      // Re-adopted after a restart or a different process: resume from the persisted row.
      runtime = {
        state: session.status === "active" ? "READY" : "READY",
        startedAtMs: new Date(session.startedAt).getTime(),
        history: [],
        turnId: `${session.id}-0`,
        turnSeq: 0,
        abort: null,
        lastError: null,
        providerState: session.engine === "openai" ? "PRIMARY" : "FALLBACK",
        lastTurnTelemetry: null,
      };
      sessions.set(session.id, runtime);
    }
    return runtime;
  };

  const assertVoiceAccess = async (organizationId: string) => {
    await entitlements.assertFeature(organizationId, "voice_calls");
    await entitlements.assertCurrentLimit(organizationId, "maxMonthlyMinutes");
  };

  const loadAgent = async (organizationId: string, agentId: string): Promise<AgentRow> => {
    const agent = await db.agents.get(organizationId, agentId);
    if (!agent) throw notFound("Agent");
    return agent;
  };

  const runtimeConfig = (agent: AgentRow): AgentRuntimeConfig => ({
    id: agent.id,
    organizationId: agent.organizationId,
    name: agent.name,
    description: agent.description,
    industry: agent.industry,
    language: agent.language,
    voice: agent.voice,
    systemPrompt: agent.systemPrompt,
    welcomeMessage: agent.welcomeMessage,
    status: agent.status,
  });

  const usage = (
    organizationId: string,
    sessionId: string | null,
    eventType:
      | "session_started"
      | "session_ended"
      | "session_completed"
      | "session_failed"
      | "input_messages"
      | "output_messages"
      | "characters"
      | "turn_telemetry"
      | "provider_fallback",
    quantity = 1,
    metadata: Record<string, string | number | boolean | null> = {}
  ) => db.usage.record({ organizationId, sessionId, eventType, quantity, metadata });

  const appendMessage = async (args: {
    organizationId: string;
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    latencyMs?: number | null;
  }): Promise<VoiceTranscriptMessage> => {
    const row = await db.messages.append({
      organizationId: args.organizationId,
      sessionId: args.sessionId,
      role: args.role,
      content: sanitizeText(args.content, MAX_MESSAGE_STORE),
      latencyMs: args.latencyMs ?? null,
    });
    return {
      id: row.id,
      sessionId: row.sessionId,
      role: row.role,
      content: row.content,
      createdAt: row.timestamp,
      latencyMs: row.latencyMs ?? null,
    };
  };

  const getScoped = async (sessionId: string, organizationId: string): Promise<VoiceSessionRow> => {
    const row = await db.sessions.get(sessionId, organizationId);
    if (!row) throw notFound("Voice session");
    return row;
  };

  /** Single place that mutates state, so an illegal transition is impossible to sneak past. */
  const transition = (runtime: SessionRuntime, to: VoiceStateName): VoiceStateName => {
    try {
      assertTransition(runtime.state, to);
    } catch {
      throw new ApiError(
        "SESSION_ERROR",
        `This session cannot move from ${runtime.state} to ${to}.`,
        { status: 409 }
      );
    }
    runtime.state = to;
    return to;
  };

  const guardOpen = (session: VoiceSessionRow, runtime: SessionRuntime) => {
    if ((VOICE_CLOSED as readonly string[]).includes(runtime.state)) {
      throw new ApiError("SESSION_ERROR", "This session is closed. Start a new one.", { status: 409 });
    }
    if (session.status === "failed" || session.status === "completed") {
      throw new ApiError("SESSION_ERROR", "This session already ended.", { status: 409 });
    }
  };

  const buildRequest = (args: {
    agent: AgentRow;
    session: VoiceSessionRow;
    runtime: SessionRuntime;
    text: string;
  }): ConversationRequest => ({
    agent: runtimeConfig(args.agent),
    language: args.session.language as AgentLanguage,
    history: args.runtime.history,
    userInput: args.text,
    testMode: args.session.testMode === true,
    systemPrompt: systemPromptFor(runtimeConfig(args.agent), args.session.language as AgentLanguage),
  });

  const recordTurn = async (args: {
    session: VoiceSessionRow;
    runtime: SessionRuntime;
    turnId: string;
    providerName: string;
    providerState: VoiceProviderState;
    llmMs: number | null;
    firstTokenMs: number | null;
    streamed: boolean;
    interrupted: boolean;
  }) => {
    const telemetry = deriveTurnTelemetry({
      sessionId: args.session.id,
      turnId: args.turnId,
      organizationId: args.session.organizationId,
      agentId: args.session.agentId,
      language: args.session.language as AgentLanguage,
      provider: args.providerName,
      providerState: args.providerState,
      // Server-measured timings are merged with whatever the client reported for this turn.
      markers: {
        aiRequestStart: 0,
        ...(args.firstTokenMs != null ? { firstAiResponse: args.firstTokenMs } : {}),
        ...(args.llmMs != null ? { aiResponseComplete: args.llmMs } : {}),
      },
      interrupted: args.interrupted,
      streamed: args.streamed,
    });
    args.runtime.lastTurnTelemetry = telemetry;
    await usage(args.session.organizationId, args.session.id, "turn_telemetry", 1, {
      ...telemetryMetadata(telemetry),
      source: "server",
    });
    return telemetry;
  };

  return {
    capabilities(): VoiceEngineCapabilities & { streamingCapable: boolean } {
      const primaryReady = Boolean(chosen) || openAiProvider.available();
      return {
        configured: primaryReady ? "openai" : "demo",
        openAiReady: primaryReady,
        streaming: streamingCapable && (Boolean(chosen?.generateStream) || openAiProvider.canStream),
        providerState: primaryReady ? "PRIMARY" : env.appMode === "production" ? "UNAVAILABLE" : "FALLBACK",
        telephony: false,
        recording: false,
        storesAudio: false,
        model: primaryReady ? env.voiceEngine.model : null,
        streamingCapable,
      };
    },

    languageProfile(language: AgentLanguage) {
      return voiceProfile(language);
    },

    /** 1 auth → 2 ownership → 3 status gate → 4 resume-or-create → 5 greeting. */
    async createSession(args: {
      organizationId: string;
      userId: string | null;
      agentId: string;
      testMode?: boolean;
      language?: AgentLanguage;
      /** Reuse an open session for the same agent instead of creating a duplicate. */
      resume?: boolean;
    }): Promise<CreateVoiceSessionResponse> {
      await assertVoiceAccess(args.organizationId);
      const agent = await loadAgent(args.organizationId, args.agentId);
      const testModeRequested = args.testMode === true;

      if (agent.status === "archived") {
        throw new ApiError("FORBIDDEN", "This agent is archived and kept for history only. It cannot take sessions.");
      }
      if (agent.status === "paused") {
        throw new ApiError("FORBIDDEN", "This agent is paused. Activate it to start sessions.");
      }
      if (agent.status === "draft" && !testModeRequested) {
        throw new ApiError("FORBIDDEN", "Draft agents run only in Studio Test Mode.");
      }
      const testMode = agent.status === "draft";

      if (args.resume !== false && args.userId) {
        const open = (await db.sessions.listByOrg(args.organizationId)).find(
          (row) =>
            row.agentId === agent.id &&
            row.userId === args.userId &&
            (row.status === "active" || row.status === "created")
        );
        if (open) {
          const runtime = runtimeFor(open);
          const messages = await db.messages.listBySession(open.id, args.organizationId);
          for (const message of messages.slice(-env.voiceEngine.maxHistoryTurns * 2)) {
            runtime.history.push({ role: message.role === "assistant" ? "assistant" : "user", content: message.content });
          }
          const record = toRecord(open, agent.name, agent.status, runtime);
          record.messageCount = messages.length;
          return {
            session: record,
            greeting: {
              id: "replayed",
              sessionId: open.id,
              role: "assistant",
              content: agent.welcomeMessage.trim() || "(session resumed)",
              createdAt: open.startedAt,
            },
            engine: open.engine === "openai" ? "openai" : "demo",
            resumed: true,
          };
        }
      }

      const sessionId = newId("vsn");
      const language = (args.language ?? agent.language) as AgentLanguage;
      const { provider, providerState, fallbackReason } = pickProvider();

      const row = await db.sessions.create({
        id: sessionId,
        organizationId: args.organizationId,
        agentId: agent.id,
        userId: args.userId,
        language,
        mode: provider === demoProvider ? "demo" : "production",
        engine: provider === demoProvider ? "demo" : "openai",
        testMode,
      });

      const runtime: SessionRuntime = {
        state: "READY",
        startedAtMs: Date.now(),
        history: [],
        turnId: `${sessionId}-1`,
        turnSeq: 1,
        abort: null,
        lastError: null,
        providerState,
        lastTurnTelemetry: null,
      };
      sessions.set(sessionId, runtime);

      await usage(args.organizationId, sessionId, "session_started", 1, {
        agentId: agent.id,
        language,
        engine: row.engine ?? "demo",
        testMode,
        sttLang: voiceProfile(language).sttLang,
      });
      if (providerState === "FALLBACK") {
        await usage(args.organizationId, sessionId, "provider_fallback", 1, {
          from: provider.name,
          reason: "no credential for the primary provider",
        });
      }

      const greeting = await appendMessage({
        organizationId: args.organizationId,
        sessionId,
        role: "assistant",
        content:
          agent.welcomeMessage.trim() ||
          (language === "en"
            ? "Welcome to the CenterAI demonstration agent."
            : language === "ar"
              ? "مرحباً، معك وكيل CenterAI التجريبي."
              : "أهلاً، معك وكيل CenterAI التجريبي."),
      });
      await usage(args.organizationId, sessionId, "output_messages", 1, {});

      logger.info("voice_session_created", {
        organizationId: args.organizationId,
        sessionId,
        agentId: agent.id,
        engine: row.engine ?? "demo",
        testMode,
        providerState,
      });

      const record = toRecord(row, agent.name, agent.status, runtime);
      record.messageCount = 1;

      return {
        session: record,
        greeting,
        engine: provider === demoProvider ? "demo" : "openai",
        resumed: false,
        ...(fallbackReason ? { fallbackReason } : {}),
      };
    },

    /** Buffered turn. Same pipeline as streaming, so the UI can fall back without a new session. */
    async processUserInput(args: {
      organizationId: string;
      sessionId: string;
      text: string;
      turnId?: string;
    }): Promise<VoiceInputResponse> {
      await assertVoiceAccess(args.organizationId);
      const session = await getScoped(args.sessionId, args.organizationId);
      const agent = await loadAgent(args.organizationId, session.agentId);
      const runtime = runtimeFor(session);
      guardOpen(session, runtime);

      const text = sanitizeText(args.text, MAX_INPUT);
      if (text.length < 1) throw new ValidationError({ text: "Say or type something first." });

      transition(runtime, "PROCESSING");
      if (session.status === "created") {
        await db.sessions.patch(session.id, args.organizationId, { status: "active" });
      }

      const turnId = args.turnId ?? runtime.turnId;
      const userMessage = await appendMessage({
        organizationId: args.organizationId,
        sessionId: session.id,
        role: "user",
        content: text,
      });
      await usage(args.organizationId, session.id, "input_messages", 1, {});
      runtime.history.push({ role: "user", content: text });

      const { provider, providerState, fallbackReason } = pickProvider();
      const request = buildRequest({ agent, session, runtime, text });
      request.signal = runtime.abort?.signal;

      let reply: { text: string; latencyMs: number };
      let usedProvider = provider;
      let usedState = providerState;
      let note = fallbackReason;
      let llmMs: number | null = null;

      try {
        const started = performance.now();
        const generated = await provider.generate(request);
        llmMs = Math.round(performance.now() - started);
        reply = { text: generated.text, latencyMs: generated.latencyMs };
      } catch (error) {
        if (provider === demoProvider) {
          runtime.lastError = (error as Error)?.message ?? "generation_failed";
          transition(runtime, "READY");
          throw new ApiError("REALTIME_UNAVAILABLE", "The conversation engine could not answer. Try again.");
        }
        logger.warn("provider_turn_fallback", {
          organizationId: args.organizationId,
          sessionId: session.id,
          reason: String((error as Error)?.message ?? "").slice(0, 120),
        });
        usedProvider = demoProvider;
        usedState = "FALLBACK";
        note = "The configured provider failed on this turn, so the local demo engine answered.";
        await usage(args.organizationId, session.id, "provider_fallback", 1, {
          from: provider.name,
          to: demoProvider.name,
        });
        const generated = await demoProvider.generate(request);
        reply = { text: generated.text, latencyMs: generated.latencyMs };
      }

      const assistantMessage = await appendMessage({
        organizationId: args.organizationId,
        sessionId: session.id,
        role: "assistant",
        content: reply.text,
        latencyMs: llmMs,
      });
      await usage(args.organizationId, session.id, "output_messages", 1, {});
      await usage(args.organizationId, session.id, "characters", reply.text.length, {});
      runtime.history.push({ role: "assistant", content: reply.text });
      runtime.turnSeq += 1;
      runtime.turnId = `${session.id}-${runtime.turnSeq}`;
      transition(runtime, "SPEAKING");

      const telemetry = await recordTurn({
        session,
        runtime,
        turnId,
        providerName: usedProvider.name,
        providerState: usedState,
        llmMs,
        firstTokenMs: null,
        streamed: false,
        interrupted: false,
      });

      const fresh = await getScoped(session.id, args.organizationId);
      const record = toRecord(fresh, agent.name, agent.status, runtime);
      record.messageCount = (await db.messages.listBySession(session.id, args.organizationId)).length;

      return {
        userMessage,
        assistantMessage,
        session: record,
        engine: usedProvider === demoProvider ? "demo" : "openai",
        shouldSpeak: true,
        telemetry,
        ...(note ? { fallbackReason: note } : {}),
      };
    },

    /**
     * Streaming turn. Yields safe frames only — provider payloads are never forwarded.
     * Adapters that can flush write these as SSE; the browser transport falls back to buffered.
     */
    async *streamTurn(args: {
      organizationId: string;
      sessionId: string;
      text: string;
      turnId?: string;
    }): AsyncGenerator<VoiceStreamFrame, void, undefined> {
      await assertVoiceAccess(args.organizationId);
      const session = await getScoped(args.sessionId, args.organizationId);
      const agent = await loadAgent(args.organizationId, session.agentId);
      const runtime = runtimeFor(session);
      guardOpen(session, runtime);

      const text = sanitizeText(args.text, MAX_INPUT);
      if (text.length < 1) {
        yield { type: "error", error: "Nothing to send." };
        return;
      }

      const turnId = args.turnId ?? runtime.turnId;
      runtime.abort = new AbortController();
      transition(runtime, "PROCESSING");
      if (session.status === "created") {
        await db.sessions.patch(session.id, args.organizationId, { status: "active" });
      }

      const userMessage = await appendMessage({
        organizationId: args.organizationId,
        sessionId: session.id,
        role: "user",
        content: text,
      });
      await usage(args.organizationId, session.id, "input_messages", 1, {});
      runtime.history.push({ role: "user", content: text });
      yield { type: "state", state: "PROCESSING" };

      const picked = pickProvider();
      let provider = picked.provider;
      let providerState = picked.providerState;
      const fallbackReason = picked.fallbackReason;
      const request = buildRequest({ agent, session, runtime, text });
      request.signal = runtime.abort.signal;

      if (fallbackReason) yield { type: "state", state: "PROCESSING", providerState: "FALLBACK" };

      let acc = "";
      let streamed = false;
      const startedAt = performance.now();
      let firstTokenMs: number | null = null;

      const runStream = async function* (this: void, active: AIConversationProvider) {
        if (!active.generateStream || !streamingCapable) {
          const one = await active.generate(request);
          yield { delta: one.text, firstToken: true } satisfies StreamChunk;
          return;
        }
        for await (const chunk of active.generateStream(request)) yield chunk;
      };

      try {
        for await (const chunk of runStream(provider)) {
          if (runtime.abort?.signal.aborted) break;
          if (firstTokenMs == null) firstTokenMs = Math.round(performance.now() - startedAt);
          acc += chunk.delta;
          streamed = true;
          yield { type: "delta", delta: chunk.delta, turnId, providerState };
        }
      } catch (error) {
        if (provider === demoProvider) {
          yield { type: "error", error: "The conversation engine could not answer. Try again." };
          runtime.lastError = String((error as Error)?.message ?? "").slice(0, 160);
          transition(runtime, "READY");
          return;
        }
        logger.warn("provider_stream_fallback", {
          organizationId: args.organizationId,
          sessionId: session.id,
          reason: String((error as Error)?.message ?? "").slice(0, 120),
        });
        await usage(args.organizationId, session.id, "provider_fallback", 1, { from: provider.name, to: demoProvider.name });
        acc = "";
        const fallback = await demoProvider.generate(request);
        acc = fallback.text;
        yield { type: "delta", delta: acc, turnId, providerState: "FALLBACK" };
        provider = demoProvider;
      }

      const llmMs = Math.round(performance.now() - startedAt);
      const interrupted = runtime.abort?.signal.aborted === true;
      const finalText = acc.trim() || (interrupted ? "(interrupted)" : "");

      const assistantMessage = await appendMessage({
        organizationId: args.organizationId,
        sessionId: session.id,
        role: "assistant",
        content: finalText,
        latencyMs: llmMs,
      });
      await usage(args.organizationId, session.id, "output_messages", 1, {});
      await usage(args.organizationId, session.id, "characters", finalText.length, {});
      runtime.history.push({ role: "assistant", content: finalText });
      runtime.turnSeq += 1;
      runtime.turnId = `${session.id}-${runtime.turnSeq}`;
      runtime.abort = null;
      if (!interrupted) transition(runtime, "SPEAKING");

      const telemetry = await recordTurn({
        session,
        runtime,
        turnId,
        providerName: provider.name,
        providerState: providerState === "PRIMARY" && provider === demoProvider ? "FALLBACK" : providerState,
        llmMs,
        firstTokenMs,
        streamed,
        interrupted,
      });

      const fresh = await getScoped(session.id, args.organizationId);
      const record = toRecord(fresh, agent.name, agent.status, runtime);
      record.messageCount = (await db.messages.listBySession(session.id, args.organizationId)).length;

      yield { type: "meta", turnId, userMessage };
      yield { type: "done", message: assistantMessage, session: record, telemetry, state: runtime.state, providerState };
    },

    /** Barge-in or user stop: cancel generation, stop output, keep the session usable. */
    async cancelTurn(args: {
      organizationId: string;
      sessionId: string;
      reason?: "barge_in" | "user_stop" | "network";
      telemetry?: { markers: VoiceTurnMarkers; turnId?: string };
    }): Promise<{ state: VoiceStateName; cancelled: boolean }> {
      const session = await getScoped(args.sessionId, args.organizationId);
      const runtime = runtimeFor(session);
      const wasActive = runtime.state === "PROCESSING" || runtime.state === "SPEAKING";

      runtime.abort?.abort();
      runtime.abort = null;
      if (wasActive) {
        runtime.state = "INTERRUPTED";
        transition(runtime, "LISTENING");
      }
      if (args.telemetry?.markers && Object.keys(args.telemetry.markers).length > 0) {
        await usage(args.organizationId, session.id, "turn_telemetry", 1, {
          ...telemetryMetadata(
            deriveTurnTelemetry({
              sessionId: session.id,
              turnId: args.telemetry.turnId ?? runtime.turnId,
              organizationId: session.organizationId,
              agentId: session.agentId,
              language: session.language as AgentLanguage,
              provider: "client",
              providerState: runtime.providerState,
              markers: args.telemetry.markers,
              interrupted: true,
              streamed: true,
            })
          ),
          source: "client",
        });
      }
      logger.info("voice_turn_cancelled", {
        organizationId: args.organizationId,
        sessionId: session.id,
        reason: args.reason ?? "user_stop",
      });
      return { state: runtime.state, cancelled: wasActive };
    },

    /** Client-reported markers, recorded as measured. */
    async recordTelemetry(args: {
      organizationId: string;
      sessionId: string;
      turnId: string;
      markers: VoiceTurnMarkers;
      interrupted?: boolean;
      streamed?: boolean;
    }): Promise<VoiceTurnTelemetry> {
      const session = await getScoped(args.sessionId, args.organizationId);
      const runtime = runtimeFor(session);
      const telemetry = deriveTurnTelemetry({
        sessionId: session.id,
        turnId: args.turnId,
        organizationId: session.organizationId,
        agentId: session.agentId,
        language: session.language as AgentLanguage,
        provider: "client",
        providerState: runtime.providerState,
        markers: args.markers,
        interrupted: args.interrupted === true,
        streamed: args.streamed === true,
      });
      await usage(session.organizationId, session.id, "turn_telemetry", telemetry.roundTripMs ?? 0, {
        ...telemetryMetadata(telemetry),
        source: "client",
      });
      return telemetry;
    },

    /** Explicit state change from the client (mic start/stop, reconnect). */
    async setState(args: {
      organizationId: string;
      sessionId: string;
      state: VoiceStateName;
    }): Promise<{ state: VoiceStateName }> {
      const session = await getScoped(args.sessionId, args.organizationId);
      const runtime = runtimeFor(session);
      transition(runtime, args.state);
      return { state: runtime.state };
    },

    async endSession(args: {
      organizationId: string;
      sessionId: string;
      outcome?: "completed" | "failed" | "stopped";
      reason?: string;
    }): Promise<VoiceEndResponse> {
      const session = await getScoped(args.sessionId, args.organizationId);
      const runtime = runtimeFor(session);
      const outcome = args.outcome ?? "completed";
      const durationSeconds = Math.max(0, Math.round((Date.now() - runtime.startedAtMs) / 1000));

      const updated = await db.sessions.patch(session.id, args.organizationId, {
        status: outcome === "failed" ? "failed" : "completed",
        endedAt: new Date().toISOString(),
        durationSeconds,
      });

      const messages = await db.messages.listBySession(session.id, args.organizationId);
      await usage(
        args.organizationId,
        session.id,
        outcome === "failed" ? "session_failed" : "session_completed",
        1,
        {
          durationSeconds,
          messages: messages.length,
          turns: Math.max(0, runtime.turnSeq - 1),
          ...(args.reason ? { reason: sanitizeText(args.reason, 80) } : {}),
        }
      );

      runtime.abort?.abort();
      sessions.delete(session.id);
      logger.info("voice_session_ended", {
        organizationId: args.organizationId,
        sessionId: session.id,
        outcome,
        durationSeconds,
        messages: messages.length,
      });

      const agent = await db.agents.get(args.organizationId, session.agentId);
      const record = toRecord(updated ?? session, agent?.name ?? session.agentId, agent?.status ?? "draft", {
        ...runtime,
        state: outcome === "failed" ? "FAILED" : "COMPLETED",
      });
      record.messageCount = messages.length;

      return { session: record, durationSeconds, messageCount: messages.length };
    },

    async detail(args: { organizationId: string; sessionId: string }): Promise<VoiceSessionDetail> {
      const session = await getScoped(args.sessionId, args.organizationId);
      const [agent, messages, events] = await Promise.all([
        db.agents.get(args.organizationId, session.agentId),
        db.messages.listBySession(session.id, args.organizationId),
        db.usage.listByOrg(args.organizationId, session.id),
      ]);
      const runtime = sessions.get(session.id);
      return {
        ...toRecord(session, agent?.name ?? session.agentId, agent?.status ?? "draft", runtime),
        messageCount: messages.length,
        messages: messages.map((m) => ({
          id: m.id,
          sessionId: m.sessionId,
          role: m.role,
          content: m.content,
          createdAt: m.timestamp,
          latencyMs: m.latencyMs ?? null,
        })),
        telemetry: events
          .filter((event: UsageEventRow) => event.eventType === "turn_telemetry")
          .map((event) => event.metadata as unknown as VoiceTurnTelemetry),
      } as VoiceSessionDetail;
    },

    async list(organizationId: string) {
      const [rows, agents] = await Promise.all([
        db.sessions.listByOrg(organizationId),
        db.agents.listByOrg(organizationId),
      ]);
      return Promise.all(
        rows.map(async (session) => {
          const agent = agents.find((item) => item.id === session.agentId);
          const messages = await db.messages.listBySession(session.id, organizationId);
          const record = toRecord(session, agent?.name ?? session.agentId, agent?.status ?? "draft", sessions.get(session.id));
          record.messageCount = messages.length;
          return record;
        })
      );
    },

    /** Only rows for this organization, and only measured numbers. */
    async analytics(organizationId: string): Promise<VoiceAnalyticsDto> {
      const rows = await db.sessions.listByOrg(organizationId);
      const byLanguage: Record<string, number> = {};
      const byAgent = new Map<string, { agentId: string; agentName: string; sessions: number; messages: number; durationSeconds: number }>();
      const byDay = new Map<string, { date: string; sessions: number; messages: number; durationSeconds: number }>();

      let totalMessages = 0;
      let totalDuration = 0;

      for (const session of rows) {
        const language = session.language as AgentLanguage;
        byLanguage[language] = (byLanguage[language] ?? 0) + 1;
        const messages = await db.messages.listBySession(session.id, organizationId);
        const durationSeconds =
          session.durationSeconds ??
          (session.endedAt
            ? Math.max(0, Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000))
            : 0);
        totalMessages += messages.length;
        totalDuration += durationSeconds;

        const agentRow = await db.agents.get(organizationId, session.agentId);
        const bucket = byAgent.get(session.agentId) ?? {
          agentId: session.agentId,
          agentName: agentRow?.name ?? session.agentId,
          sessions: 0,
          messages: 0,
          durationSeconds: 0,
        };
        bucket.sessions += 1;
        bucket.messages += messages.length;
        bucket.durationSeconds += durationSeconds;
        byAgent.set(session.agentId, bucket);

        const day = session.startedAt.slice(0, 10);
        const dayBucket = byDay.get(day) ?? { date: day, sessions: 0, messages: 0, durationSeconds: 0 };
        dayBucket.sessions += 1;
        dayBucket.messages += messages.length;
        dayBucket.durationSeconds += durationSeconds;
        byDay.set(day, dayBucket);
      }

      const summary = await db.usage.summarize(organizationId);
      const telemetryRows = (await db.usage.listByOrg(organizationId))
        .filter((event) => event.eventType === "turn_telemetry")
        .map((event) => event.metadata);

      const rtt = telemetryRows
        .map((meta) => (typeof meta.rttMs === "number" ? meta.rttMs : null))
        .filter((value): value is number => value != null && value > 0)
        .sort((a, b) => a - b);
      const llm = telemetryRows
        .map((meta) => (typeof meta.llmMs === "number" ? meta.llmMs : null))
        .filter((value): value is number => value != null && value > 0)
        .sort((a, b) => a - b);
      const firstToken = telemetryRows
        .map((meta) => (typeof meta.firstTokenMs === "number" ? meta.firstTokenMs : null))
        .filter((value): value is number => value != null && value > 0)
        .sort((a, b) => a - b);
      const interruptions = telemetryRows.filter((meta) => meta.interrupted === true).length;
      const median = (values: number[]) => (values.length ? values[Math.floor(values.length / 2)] : null);
      const worst = (values: number[]) => (values.length ? values[values.length - 1] : null);

      return {
        organizationId,
        totalSessions: rows.length,
        completedSessions: rows.filter((row) => normalizeSessionStatus(row.status) === "completed").length,
        failedSessions: rows.filter((row) => normalizeSessionStatus(row.status) === "failed").length,
        activeSessions: rows.filter((row) => normalizeSessionStatus(row.status) === "active").length,
        totalDurationSeconds: totalDuration,
        totalMessages,
        inputMessages: summary.byEventType["input_messages"] ?? 0,
        outputMessages: summary.byEventType["output_messages"] ?? 0,
        byLanguage,
        byAgent: [...byAgent.values()].sort((a, b) => b.sessions - a.sessions),
        byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
        empty: rows.length === 0,
        latency: {
          samples: rtt.length,
          medianRoundTripMs: median(rtt),
          maxRoundTripMs: worst(rtt),
          medianLlmMs: median(llm),
          medianFirstTokenMs: median(firstToken),
          interruptions,
          measured: rtt.length + llm.length + firstToken.length > 0,
        },
      };
    },

    promptPreview(agent: AgentRuntimeConfig, language: AgentLanguage) {
      return systemPromptFor(agent, language);
    },
  };
}

export type VoiceOrchestrator = ReturnType<typeof createVoiceOrchestrator>;
