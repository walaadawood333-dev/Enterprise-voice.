/**
 * Realtime voice session broker.
 *
 * Responsibilities (all server-side):
 *   1. validate the request, 2. verify the agent belongs to the tenant, 3. check APP_MODE,
 *   4. require OPENAI_API_KEY, 5. mint a SHORT-LIVED ephemeral credential from OpenAI,
 *   6. return only what the browser needs.
 *
 * The provider API key never appears in a return value, a log line, or an error message.
 * Raw microphone audio is never stored — this service brokers authorisation only.
 */

import type { AgentLanguage, RealtimeEndRequest, RealtimeSessionDto } from "../../shared/contracts";
import { sanitizeText } from "../../shared/validate";
import type { ServerEnv } from "../config/env";
import type { RealtimeSecrets } from "../config/secrets";
import { ApiError, configInvalid, providerNotConfigured, type Logger } from "../lib/observability";
import { newId, type Db } from "../db/store";

/** Ephemeral tokens expire on their own; we additionally cap how long we let a browser hold one. */
const REQUEST_TIMEOUT_MS = 8_000;

interface MintedToken {
  value: string;
  expiresAt: string | null;
  /** The session id OpenAI assigned, when the provider returned one. */
  providerSessionId?: string | null;
}

export function createRealtimeService(
  env: ServerEnv,
  db: Db,
  logger: Logger,
  agents: {
    require(
      organizationId: string,
      agentId: string
    ): { id: string; name: string; language: AgentLanguage; systemPrompt: string };
  },
  /** Injected by the adapter that owns credentials — NO_SECRETS everywhere else. */
  secrets: RealtimeSecrets,
  /** Optional orchestrator handle, so session creation stays in one place. */
  orchestrator?: {
    createSession(args: {
      organizationId: string;
      userId: string | null;
      agentId: string;
      language: AgentLanguage;
      testMode?: boolean;
      resume?: boolean;
    }): Promise<{ session: { id: string } }>;
    endSession(args: {
      organizationId: string;
      sessionId: string;
      outcome?: "completed" | "failed" | "stopped";
      reason?: string;
    }): Promise<unknown>;
  }
) {
  const deps = { orchestrator };
  /** Server-side call to OpenAI. Kept private so no route can echo the response verbatim. */
  async function mintEphemeralToken(instructions: string): Promise<MintedToken> {
    // Credential is pulled per request from the injected secret source (null in the browser).
    const apiKey = secrets.openaiKey();
    if (!apiKey) {
      throw new ApiError(
        "PROVIDER_NOT_CONFIGURED",
        "No voice provider credential is available to this runtime."
      );
    }

    const body = JSON.stringify({
      model: env.realtime.model,
      modalities: ["audio", "text"],
      voice: env.realtime.voice,
      instructions,
      // Ephemeral sessions must not outlive the demo window.
      expires_after: { anchor: "token_created_at", seconds: Math.max(120, env.realtime.maxDurationSeconds + 300) },
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const attempt = async (path: string, minimal = false) => {
      const res = await fetch(`${env.openai.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(secrets.orgId() ? { "OpenAI-Organization": secrets.orgId()! } : {}),
          ...(secrets.projectId() ? { "OpenAI-Project": secrets.projectId()! } : {}),
        },
        body: minimal
          ? JSON.stringify({
              model: env.realtime.model,
              modalities: ["audio", "text"],
              voice: env.realtime.voice,
              instructions,
            })
          : body,
        signal: controller.signal,
      });
      return res;
    };

    try {
      // Both shapes are live in OpenAI's docs/SDKs; try the canonical one, then the alias.
      let res = await attempt("/v1/realtime/sessions");
      if (!res.ok && (res.status === 404 || res.status === 405)) res = await attempt("/v1/realtime/client_secrets");
      // A rejected optional field must not break a session: retry once with the minimal body.
      if (!res.ok && res.status === 400) {
        logger.warn("realtime_token_retried_minimal", { status: 400 });
        res = await attempt("/v1/realtime/sessions", true);
      }
      if (!res.ok) {
        // Read the provider error but never echo bodies: map to a safe code.
        logger.warn("realtime_token_rejected", { status: res.status });
        throw new ApiError("REALTIME_UNAVAILABLE", "The voice provider refused to authorize a session.");
      }
      const json = (await res.json()) as Record<string, unknown>;
      const secret = (json.client_secret ?? json.value) as { value?: string } | string | undefined;
      const value = typeof secret === "string" ? secret : secret?.value;
      if (!value || typeof value !== "string") {
        throw new ApiError("REALTIME_UNAVAILABLE", "The voice provider returned no usable session credential.");
      }
      const expires = (json.expires_at as number | string | undefined) ?? undefined;
      const expiresAt =
        typeof expires === "number"
          ? new Date(expires * 1000).toISOString()
          : typeof expires === "string"
            ? expires
            : new Date(Date.now() + (env.realtime.maxDurationSeconds + 300) * 1000).toISOString();

      return {
        value,
        expiresAt,
        providerSessionId: typeof json.id === "string" ? json.id : null,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const aborted = (error as Error)?.name === "AbortError";
      logger.error("realtime_token_request_failed", { reason: aborted ? "timeout" : "network" });
      throw new ApiError(
        "REALTIME_UNAVAILABLE",
        aborted
          ? "The voice provider did not respond in time."
          : "The voice provider could not be reached."
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    /** True only when a browser session may legitimately be authorized. */
    available(): boolean {
      return env.realtime.enabled;
    },

    async create(input: {
      organizationId: string;
      userId: string | null;
      agentId: string;
      language: AgentLanguage;
    }): Promise<RealtimeSessionDto> {
      // 3 + 4. mode / runtime / credential gates, in that order.
      if (env.runtime !== "node") {
        throw new ApiError(
          "RUNTIME_UNSUPPORTED",
          "Realtime sessions can only be authorized by the server process, never in the browser."
        );
      }
      if (!env.realtime.enabled) {
        throw env.appMode === "production"
          ? configInvalid(env.realtime.reason ? [env.realtime.reason] : ["OPENAI_API_KEY"])
          : providerNotConfigured();
      }

      // 2. tenant-scoped agent verification.
      const agent = await agents.require(input.organizationId, input.agentId);

      /*
       * Session rows are created through the orchestrator when it is available, so a WebRTC leg and
       * a buffered turn share one state machine, one resume rule (never a duplicate VoiceSession)
       * and one usage writer. Without it the service still persists its own row — awaited.
       */
      const delegated = await deps.orchestrator?.createSession({
        organizationId: input.organizationId,
        userId: input.userId,
        agentId: agent.id,
        language: input.language,
        testMode: false,
        resume: true,
      });
      const sessionId = delegated?.session.id ?? newId("rtv");

      const instructions = [
        sanitizeText(agent.systemPrompt, 4000),
        languageInstructions(input.language),
      ]
        .filter(Boolean)
        .join("\n\n");

      const minted = await mintEphemeralToken(instructions);

      if (!delegated) {
        await db.sessions.create({
          id: sessionId,
          organizationId: input.organizationId,
          agentId: agent.id,
          userId: input.userId,
          language: input.language,
          mode: "production",
          engine: "openai",
        });
      }
      await db.usage.record({
        organizationId: input.organizationId,
        sessionId,
        eventType: "session_started",
        quantity: 1,
        metadata: {
          agentId: agent.id,
          language: input.language,
          model: env.realtime.model,
          transport: "browser-webrtc",
          source: delegated ? "orchestrator" : "standalone",
        },
      });

      logger.info("realtime_session_started", {
        organizationId: input.organizationId,
        sessionId,
        agentId: agent.id,
        language: input.language,
      });

      // 6. minimum viable payload — no key, no provider bodies, no internal ids.
      return {
        sessionId,
        organizationId: input.organizationId,
        agentId: agent.id,
        language: input.language,
        agentName: agent.name,
        ephemeralKey: minted.value,
        sdpUrl: env.realtime.sdpUrl,
        model: env.realtime.model,
        voice: env.realtime.voice,
        expiresAt: minted.expiresAt,
        maxDurationSeconds: env.realtime.maxDurationSeconds,
      };
    },

    async end(input: RealtimeEndRequest & { organizationId: string }) {
      // Scoped read: a foreign session id reads as missing, never as someone else's row.
      const session = await db.sessions.get(input.sessionId, input.organizationId);
      if (!session) throw new ApiError("NOT_FOUND", "Voice session not found.");
      // Repeated client callbacks must not create duplicate metering events.
      if ((session.status === "completed" || session.status === "failed") && session.endedAt) {
        return {
          sessionId: input.sessionId,
          outcome: session.status,
          durationSeconds: session.durationSeconds ?? 0,
        };
      }
      const closed = await db.sessions.patch(input.sessionId, input.organizationId, {
        status: input.outcome === "failed" ? "failed" : "completed",
        endedAt: new Date().toISOString(),
        durationSeconds:
          typeof input.durationSeconds === "number"
            ? Math.max(0, Math.round(input.durationSeconds))
            : undefined,
      });
      if (!closed) throw new ApiError("SESSION_ERROR", "Unable to close voice session.");

      const duration =
        typeof input.durationSeconds === "number" && Number.isFinite(input.durationSeconds)
          ? Math.max(0, Math.min(3600, Math.round(input.durationSeconds * 10) / 10))
          : Math.max(0, Math.round((Date.now() - new Date(closed.startedAt).getTime()) / 100) / 10);

      await Promise.all([
        db.usage.record({
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          eventType: input.outcome === "failed" ? "session_failed" : "session_ended",
          quantity: 1,
          // Deliberately excludes any audio, transcript text or provider identifiers.
          metadata: {
            outcome: input.outcome,
            durationSeconds: duration,
            language: closed.language,
            agentId: closed.agentId,
            ...(input.reason ? { reason: sanitizeText(input.reason, 80) } : {}),
          },
        }),
        ...(duration > 0
          ? [db.usage.record({
              organizationId: input.organizationId,
              sessionId: input.sessionId,
              eventType: "audio_seconds" as const,
              quantity: duration,
              metadata: { source: "realtime_session_duration", measured: true },
            })]
          : []),
      ]);

      logger.info("realtime_session_ended", {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        outcome: input.outcome,
        durationSeconds: duration,
      });

      return { sessionId: input.sessionId, outcome: input.outcome, durationSeconds: duration };
    },
  };
}

/**
 * Language behaviour. Kept explicit so the agent answers in the language the caller used and
 * never pads Arabic with English (or vice versa).
 */
export function languageInstructions(language: AgentLanguage): string {
  const common =
    "You are the CenterAI demonstration agent. Be professional, concise and natural. " +
    "Never claim to have performed an action you did not perform. Never invent customer data, " +
    "account details, prices, availability or integrations. Say you are a demonstration agent " +
    "when asked what you are. Do not quote performance numbers.";
  if (language === "ar")
    return `${common} Respond only in Modern Standard Arabic suitable for enterprise conversations. Do not insert English words unless the caller uses them first.`;
  if (language === "jo")
    return `${common} Respond only in natural, professional Jordanian Arabic (Amman register). Keep it respectful and businesslike, never slangy, and do not mix in English.`;
  return `${common} Respond in professional international English.`;
}
