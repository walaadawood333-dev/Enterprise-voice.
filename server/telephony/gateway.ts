/**
 * TelephonyGateway — the authoritative service that owns every telephony operation.
 *
 * Responsibilities:
 *   1. Provider selection & mode enforcement (demo vs production)
 *   2. Call creation, lookup and lifecycle transitions (via the state machine)
 *   3. Idempotency: duplicate providerEventId → no duplicate processing
 *   4. Call → VoiceSession mapping: one call maps to at most one VoiceSession,
 *      reconnects and duplicates never create a second session
 *   5. Multi-tenant isolation: every read/write is scoped by organizationId
 *   6. Webhook verification and replay protection
 *   7. Usage tracking for call events
 *
 * Nothing here calls the AI provider directly — that is the Voice Orchestrator's job.
 * The gateway only transports and maps communication events.
 */

import type {
  AgentLanguage,
  CallAnalyticsDto,
  CallDirection,
  CallDto,
  CallEventDto,
  CallEventRow,
  CallRow,
  CallStatus,
} from "../../shared/contracts";
import { CALL_TERMINAL, normalizeCallStatus } from "../../shared/contracts";
import { assertCallTransition, eventToCallStatus, isCallTerminal } from "./callStateMachine";
import type { TelephonyEvent, TelephonyProvider } from "./provider";
import { verifyWebhook, type WebhookContext } from "./webhooks";
import { NullMediaBridge, type MediaBridge } from "./mediaBridge";
import type { Db } from "../db/store";
import { newId } from "../db/store";
import { ApiError, notFound, type Logger } from "../lib/observability";
import type { ServerEnv } from "../config/env";

export interface TelephonyGatewayDeps {
  db: Db;
  env: ServerEnv;
  logger: Logger;
  providers: TelephonyProvider[];
  mediaBridge?: MediaBridge;
}

/**
 * Build the telephony gateway. This is the single entry point for all telephony operations.
 */
export function createTelephonyGateway(deps: TelephonyGatewayDeps) {
  const { db, env, logger } = deps;
  const mediaBridge = deps.mediaBridge ?? new NullMediaBridge();

  /** Find a registered provider by id. */
  const findProvider = (providerId: string): TelephonyProvider | undefined =>
    deps.providers.find((p) => p.info.id === providerId);

  /** Resolve the provider for a given mode + preference. */
  const resolveProvider = (requestedId?: string): TelephonyProvider => {
    if (requestedId) {
      const provider = findProvider(requestedId);
      if (!provider) {
        throw new ApiError("PROVIDER_NOT_CONFIGURED", `Telephony provider "${requestedId}" is not registered.`);
      }
      // Production mode must never use a simulation provider for live traffic.
      if (env.appMode === "production" && provider.info.simulation) {
        logger.error("demo_provider_rejected_in_production", { provider: requestedId });
        throw new ApiError(
          "PROVIDER_NOT_CONFIGURED",
          "Demo telephony provider cannot be used in production mode. Configure a real PSTN/SIP provider."
        );
      }
      return provider;
    }
    // Default: use the first available provider.
    const available = deps.providers.find((p) => p.available());
    if (!available) {
      throw new ApiError("PROVIDER_NOT_CONFIGURED", "No telephony provider is available.");
    }
    // Same production guard.
    if (env.appMode === "production" && available.info.simulation) {
      throw new ApiError(
        "PROVIDER_NOT_CONFIGURED",
        "No production telephony provider is configured. Demo provider is not acceptable."
      );
    }
    return available;
  };

  /** Tenant-scoped call lookup — another tenant's id reads as missing. */
  const getOwnedCall = async (callId: string, organizationId: string): Promise<CallRow> => {
    const call = await db.calls.get(callId, organizationId);
    if (!call) throw notFound("Call");
    return call;
  };

  const toCallDto = (row: CallRow): CallDto => ({
    id: row.id,
    organizationId: row.organizationId,
    agentId: row.agentId,
    voiceSessionId: row.voiceSessionId,
    provider: row.provider,
    providerCallId: row.providerCallId,
    direction: row.direction,
    status: row.status,
    fromNumber: row.fromNumber,
    toNumber: row.toNumber,
    startedAt: row.startedAt,
    answeredAt: row.answeredAt,
    endedAt: row.endedAt,
    durationSeconds: row.durationSeconds,
  });

  const toCallEventDto = (row: CallEventRow): CallEventDto => ({
    id: row.id,
    callId: row.callId,
    eventType: row.eventType,
    provider: row.provider,
    createdAt: row.createdAt,
  });

  return {
    /** Provider capability summary surfaced via the API. */
    providerInfo() {
      return deps.providers.map((p) => ({
        ...p.info,
        available: p.available(),
      }));
    },

    /** Media bridge status — always "not available" in this phase. */
    mediaStatus() {
      return {
        available: mediaBridge.available(),
        name: mediaBridge.name,
      };
    },

    /**
     * Initiate an outbound call.
     * Validates the agent belongs to the tenant, creates the Call row, and delegates
     * to the provider for the actual dialling (or simulation).
     */
    async initiateCall(input: {
      organizationId: string;
      agentId: string;
      language?: AgentLanguage;
      toNumber: string;
      fromNumber?: string;
      providerId?: string;
    }): Promise<CallDto> {
      const provider = resolveProvider(input.providerId);

      // Verify agent ownership — tenant isolation.
      const agent = await db.agents.get(input.organizationId, input.agentId);
      if (!agent) throw notFound("Agent");

      const callId = newId("cal");
      const language = (input.language ?? agent.language) as AgentLanguage;

      const result = await provider.initiate({
        organizationId: input.organizationId,
        agentId: input.agentId,
        language,
        fromNumber: input.fromNumber ?? null,
        toNumber: input.toNumber,
      });

      const call = await db.calls.create({
        id: callId,
        organizationId: input.organizationId,
        agentId: input.agentId,
        voiceSessionId: null,
        provider: provider.info.id,
        providerCallId: result.providerCallId,
        direction: "outbound",
        status: "created",
        fromNumber: input.fromNumber ?? null,
        toNumber: input.toNumber,
      });

      // Record the creation event.
      await db.callEvents.create({
        id: newId("cev"),
        organizationId: input.organizationId,
        callId,
        eventType: "call_created",
        provider: provider.info.id,
        providerEventId: `init_${callId}`,
        metadata: { direction: "outbound", agentId: input.agentId },
      });

      // Usage: count the outbound call attempt.
      await db.usage.record({
        organizationId: input.organizationId,
        sessionId: null,
        eventType: "voice_session" as any,
        quantity: 1,
        metadata: { source: "telephony", direction: "outbound", callId },
      });

      logger.info("call_initiated", {
        organizationId: input.organizationId,
        callId,
        agentId: input.agentId,
        provider: provider.info.id,
        direction: "outbound",
      });

      return toCallDto(call);
    },

    /**
     * Handle a provider webhook event.
     * This is the critical idempotency point — duplicate events are detected and ignored.
     *
     * Idempotency rules:
     *   1. providerEventId uniqueness: if this exact event was already processed, return the
     *      existing call state without creating duplicate events or sessions.
     *   2. Call terminal states: once COMPLETED/FAILED/CANCELLED, further events are logged
     *      but do not mutate the call status.
     *   3. VoiceSession deduplication: a call maps to at most one VoiceSession. If a session
     *      already exists for this call, it is reused, never duplicated.
     */
    async handleProviderEvent(input: {
      organizationId: string;
      providerId: string;
      event: TelephonyEvent;
      /** Webhook context for signature verification. */
      webhookContext?: WebhookContext;
      /** Override: skip webhook verification (used by internal demo simulation). */
      skipVerification?: boolean;
    }): Promise<{ call: CallDto; event: CallEventDto; duplicate: boolean }> {
      const provider = resolveProvider(input.providerId);
      const { event } = input;

      // Step 1: Webhook verification (unless explicitly skipped for demo).
      if (!input.skipVerification && input.webhookContext) {
        // Check if this providerEventId was already seen (replay detection).
        const existingEventForReplay = await db.callEvents.findByProviderEventId(
          provider.info.id,
          event.providerEventId
        );
        const isReplay = existingEventForReplay != null;

        const verification = verifyWebhook(provider, input.webhookContext, logger, isReplay);
        if (!verification.valid) {
          throw new ApiError("UNAUTHORIZED", verification.reason ?? "Webhook verification failed.");
        }
        if (verification.replay && existingEventForReplay) {
          // Idempotent: return the existing state without creating duplicates.
          logger.info("call_event_replay_idempotent", {
            providerEventId: event.providerEventId,
            callId: existingEventForReplay.callId,
          });
          const existingCall = await db.calls.get(existingEventForReplay.callId, input.organizationId);
          if (!existingCall) {
            // The existing event belongs to a different tenant — treat as not found.
            throw notFound("Call");
          }
          return {
            call: toCallDto(existingCall),
            event: toCallEventDto(existingEventForReplay),
            duplicate: true,
          };
        }
      }

      // Step 2: Idempotency — check if this providerEventId already exists.
      const existingCallEvent = await db.callEvents.findByProviderEventId(
        provider.info.id,
        event.providerEventId
      );
      if (existingCallEvent) {
        const existingCall = await db.calls.get(existingCallEvent.callId, input.organizationId);
        if (existingCall) {
          logger.debug("call_event_already_processed", {
            providerEventId: event.providerEventId,
            callId: existingCall.id,
          });
          return {
            call: toCallDto(existingCall),
            event: toCallEventDto(existingCallEvent),
            duplicate: true,
          };
        }
      }

      // Step 3: Find or create the Call row by providerCallId.
      let call = await db.calls.findByProviderCallId(provider.info.id, event.providerCallId);

      if (!call) {
        // New call — create it.
        const callId = newId("cal");
        const direction: CallDirection = (event.metadata.direction as CallDirection) ?? "inbound";

        call = await db.calls.create({
          id: callId,
          organizationId: input.organizationId,
          agentId: null,  // Assigned later when an agent is mapped
          voiceSessionId: null,
          provider: provider.info.id,
          providerCallId: event.providerCallId,
          direction,
          status: "created",
          fromNumber: event.fromNumber,
          toNumber: event.toNumber,
        });

        logger.info("call_created_from_webhook", {
          organizationId: input.organizationId,
          callId,
          provider: provider.info.id,
          providerCallId: event.providerCallId,
          direction,
        });
      } else {
        // Existing call — verify tenant isolation.
        if (call.organizationId !== input.organizationId) {
          // Cross-tenant access attempt: treat as not found.
          throw notFound("Call");
        }
      }

      // Step 4: Validate and apply the state transition.
      const targetStatus = eventToCallStatus(event.eventType);
      const currentStatus = call.status;

      if (isCallTerminal(currentStatus)) {
        // Terminal state: log but do not mutate. This prevents duplicate completions.
        logger.info("call_terminal_state_no_transition", {
          callId: call.id,
          currentStatus,
          attemptedStatus: targetStatus,
        });
      } else {
        try {
          assertCallTransition(currentStatus, targetStatus);
          // Valid transition — apply it.
          const patch: Partial<CallRow> = { status: targetStatus };
          if (targetStatus === "answered" && !call.answeredAt) {
            patch.answeredAt = new Date().toISOString();
          }
          if (CALL_TERMINAL.includes(targetStatus)) {
            patch.endedAt = new Date().toISOString();
            // Calculate duration if we have answeredAt.
            if (call.answeredAt) {
              const startMs = new Date(call.answeredAt).getTime();
              const endMs = Date.now();
              patch.durationSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
            }
          }
          call = (await db.calls.update(call.id, input.organizationId, patch)) ?? call;
        } catch (transitionError) {
          // Invalid transition — log and return current state without error.
          logger.warn("call_invalid_transition_skipped", {
            callId: call.id,
            from: currentStatus,
            to: targetStatus,
            eventType: event.eventType,
          });
        }
      }

      // Step 5: Record the CallEvent (always, even for terminal-state events, for audit trail).
      // The providerEventId uniqueness constraint in the DB ensures no duplicates.
      const callEvent = await db.callEvents.create({
        id: newId("cev"),
        organizationId: input.organizationId,
        callId: call.id,
        eventType: event.eventType,
        provider: provider.info.id,
        providerEventId: event.providerEventId,
        metadata: {
          ...Object.fromEntries(
            Object.entries(event.metadata).filter(([_, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null)
          ),
          fromNumber: event.fromNumber,
          toNumber: event.toNumber,
        },
      });

      // Step 6: VoiceSession mapping.
      // When a call reaches ANSWERED or ACTIVE, ensure a VoiceSession exists.
      // This is the ONE CALL → ONE VOICESESSION guarantee.
      // After all the mutations above, call is guaranteed non-null.
      const currentCall: CallRow = call!;
      if (
        (targetStatus === "answered" || targetStatus === "active") &&
        !currentCall.voiceSessionId &&
        currentCall.agentId
      ) {
        // Check if a session already exists for this call (reconnect scenario).
        const existingSessions = await db.sessions.listByOrg(input.organizationId);
        const existingForCall = existingSessions.find(
          (s) => s.id === currentCall.voiceSessionId
        );

        if (!existingForCall && currentCall.agentId) {
          // Create the VoiceSession for this call.
          const agent = await db.agents.get(input.organizationId, currentCall.agentId);
          if (agent) {
            const sessionId = newId("vsn");
            await db.sessions.create({
              id: sessionId,
              organizationId: input.organizationId,
              agentId: currentCall.agentId,
              userId: null,
              language: agent.language,
              mode: provider.info.simulation ? "demo" : "production",
              engine: "demo",
            });

            // Link the call to the session.
            call = (await db.calls.update(currentCall.id, input.organizationId, {
              voiceSessionId: sessionId,
            })) ?? currentCall;

            logger.info("call_voice_session_mapped", {
              callId: currentCall.id,
              voiceSessionId: sessionId,
              agentId: currentCall.agentId,
            });
          }
        }
      }

      // Step 7: Usage tracking.
      await db.usage.record({
        organizationId: input.organizationId,
        sessionId: call.voiceSessionId,
        eventType: "voice_session" as any,
        quantity: 1,
        metadata: {
          source: "telephony",
          callId: call.id,
          eventType: event.eventType,
          provider: provider.info.id,
        },
      });

      logger.info("call_event_processed", {
        organizationId: input.organizationId,
        callId: call.id,
        eventType: event.eventType,
        status: call.status,
        provider: provider.info.id,
      });

      return {
        call: toCallDto(call),
        event: toCallEventDto(callEvent),
        duplicate: false,
      };
    },

    /**
     * Assign an agent to an existing call.
     * Validates that the agent belongs to the same organization.
     */
    async assignAgent(input: {
      organizationId: string;
      callId: string;
      agentId: string;
    }): Promise<CallDto> {
      const call = await getOwnedCall(input.callId, input.organizationId);

      if (isCallTerminal(call.status)) {
        throw new ApiError("SESSION_ERROR", "Cannot assign an agent to a terminal call.");
      }

      // Verify agent ownership.
      const agent = await db.agents.get(input.organizationId, input.agentId);
      if (!agent) throw notFound("Agent");

      const updated = await db.calls.update(call.id, input.organizationId, {
        agentId: input.agentId,
      });

      logger.info("call_agent_assigned", {
        organizationId: input.organizationId,
        callId: call.id,
        agentId: input.agentId,
      });

      return toCallDto(updated ?? call);
    },

    /**
     * End a call (hangup).
     * Validates ownership and applies the state machine transition.
     */
    async endCall(input: {
      organizationId: string;
      callId: string;
      reason?: string;
    }): Promise<CallDto> {
      const call = await getOwnedCall(input.callId, input.organizationId);

      if (isCallTerminal(call.status)) {
        // Already terminal — return as-is (idempotent).
        return toCallDto(call);
      }

      // Transition to completed.
      const updated = await db.calls.update(call.id, input.organizationId, {
        status: "completed",
        endedAt: new Date().toISOString(),
        ...(call.answeredAt
          ? {
              durationSeconds: Math.max(
                0,
                Math.round((Date.now() - new Date(call.answeredAt).getTime()) / 1000)
              ),
            }
          : {}),
      });

      // Record the completion event.
      await db.callEvents.create({
        id: newId("cev"),
        organizationId: input.organizationId,
        callId: call.id,
        eventType: "call_completed",
        provider: call.provider,
        providerEventId: `end_${call.id}_${Date.now()}`,
        metadata: {
          reason: input.reason ?? "manual_hangup",
          source: "api",
        },
      });

      // End the linked VoiceSession if one exists.
      if (call.voiceSessionId) {
        await db.sessions.patch(call.voiceSessionId, input.organizationId, {
          status: "completed",
          endedAt: new Date().toISOString(),
        });
      }

      logger.info("call_ended", {
        organizationId: input.organizationId,
        callId: call.id,
        reason: input.reason,
      });

      return toCallDto(updated ?? call);
    },

    /**
     * List calls for an organization. Tenant-scoped.
     */
    async listCalls(organizationId: string): Promise<CallDto[]> {
      const calls = await db.calls.listByOrg(organizationId);
      return calls.map(toCallDto);
    },

    /**
     * Get a single call with full details. Tenant-scoped.
     */
    async getCall(input: { organizationId: string; callId: string }): Promise<CallDto & { events: CallEventDto[] }> {
      const call = await getOwnedCall(input.callId, input.organizationId);
      const events = await db.callEvents.listByCall(input.callId);
      return {
        ...toCallDto(call),
        events: events.map(toCallEventDto),
      };
    },

    /**
     * List events for a call. Tenant-scoped.
     */
    async listCallEvents(input: { organizationId: string; callId: string }): Promise<CallEventDto[]> {
      await getOwnedCall(input.callId, input.organizationId);
      const events = await db.callEvents.listByCall(input.callId);
      return events.map(toCallEventDto);
    },

    /**
     * Call analytics computed from real database rows only.
     * Never uses fabricated or estimated values.
     */
    async analytics(organizationId: string): Promise<CallAnalyticsDto> {
      const calls = await db.calls.listByOrg(organizationId);

      const byProvider: Record<string, number> = {};
      const byDay = new Map<string, { date: string; total: number; answered: number; failed: number }>();

      let totalDuration = 0;
      let answeredCount = 0;
      let durationCallCount = 0;

      for (const call of calls) {
        byProvider[call.provider] = (byProvider[call.provider] ?? 0) + 1;

        if (["answered", "active", "completed"].includes(call.status)) {
          answeredCount += 1;
        }

        if (call.durationSeconds != null) {
          totalDuration += call.durationSeconds;
          durationCallCount += 1;
        }

        const day = call.startedAt.slice(0, 10);
        const bucket = byDay.get(day) ?? { date: day, total: 0, answered: 0, failed: 0 };
        bucket.total += 1;
        if (["answered", "active", "completed"].includes(call.status)) bucket.answered += 1;
        if (call.status === "failed") bucket.failed += 1;
        byDay.set(day, bucket);
      }

      return {
        organizationId,
        total: calls.length,
        inbound: calls.filter((c) => c.direction === "inbound").length,
        outbound: calls.filter((c) => c.direction === "outbound").length,
        answered: answeredCount,
        failed: calls.filter((c) => c.status === "failed").length,
        completed: calls.filter((c) => c.status === "completed").length,
        cancelled: calls.filter((c) => c.status === "cancelled").length,
        active: calls.filter((c) => ["created", "ringing", "answered", "active"].includes(c.status)).length,
        averageDurationSeconds: durationCallCount > 0 ? Math.round(totalDuration / durationCallCount) : null,
        byProvider,
        byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
        empty: calls.length === 0,
      };
    },

    /**
     * Demo helper: simulate a full inbound call lifecycle.
     * Only available in APP_MODE=demo. Returns the final call state after all events.
     */
    async simulateInboundCall(input: {
      organizationId: string;
      agentId: string;
      fromNumber?: string;
      toNumber?: string;
      failAt?: "ringing" | "answered" | "active";
    }): Promise<CallDto & { events: CallEventDto[] }> {
      if (env.appMode !== "demo") {
        throw new ApiError("FORBIDDEN", "Call simulation is only available in demo mode.");
      }

      const demoProvider = resolveProvider("demo") as import("./demo").DemoTelephonyProvider;

      // Verify agent ownership.
      const agent = await db.agents.get(input.organizationId, input.agentId);
      if (!agent) throw notFound("Agent");

      const events = demoProvider.generateInboundCallEvents({
        organizationId: input.organizationId,
        agentId: input.agentId,
        language: agent.language,
        fromNumber: input.fromNumber,
        toNumber: input.toNumber,
        failAt: input.failAt,
      });

      let lastResult: Awaited<ReturnType<typeof this.handleProviderEvent>> | null = null;

      for (const event of events) {
        // First event creates the call; assign the agent on the first event.
        lastResult = await this.handleProviderEvent({
          organizationId: input.organizationId,
          providerId: "demo",
          event,
          skipVerification: true,
        });

        // Assign agent on the first event (call_created).
        if (event.eventType === "call_created" && lastResult.call.agentId === null) {
          await this.assignAgent({
            organizationId: input.organizationId,
            callId: lastResult.call.id,
            agentId: input.agentId,
          });
        }
      }

      if (!lastResult) {
        throw new ApiError("INTERNAL_ERROR", "Simulation produced no events.");
      }

      // Return the final call with all events.
      return this.getCall({
        organizationId: input.organizationId,
        callId: lastResult.call.id,
      });
    },

    /**
     * Demo helper: simulate a full outbound call lifecycle.
     */
    async simulateOutboundCall(input: {
      organizationId: string;
      agentId: string;
      fromNumber?: string;
      toNumber?: string;
    }): Promise<CallDto & { events: CallEventDto[] }> {
      if (env.appMode !== "demo") {
        throw new ApiError("FORBIDDEN", "Call simulation is only available in demo mode.");
      }

      // Verify agent ownership.
      const agent = await db.agents.get(input.organizationId, input.agentId);
      if (!agent) throw notFound("Agent");

      const demoProvider = resolveProvider("demo") as import("./demo").DemoTelephonyProvider;

      const events = demoProvider.generateOutboundCallEvents({
        fromNumber: input.fromNumber,
        toNumber: input.toNumber,
      });

      let lastResult: Awaited<ReturnType<typeof this.handleProviderEvent>> | null = null;

      for (const event of events) {
        lastResult = await this.handleProviderEvent({
          organizationId: input.organizationId,
          providerId: "demo",
          event,
          skipVerification: true,
        });

        if (event.eventType === "call_created" && lastResult.call.agentId === null) {
          await this.assignAgent({
            organizationId: input.organizationId,
            callId: lastResult.call.id,
            agentId: input.agentId,
          });
        }
      }

      if (!lastResult) {
        throw new ApiError("INTERNAL_ERROR", "Simulation produced no events.");
      }

      return this.getCall({
        organizationId: input.organizationId,
        callId: lastResult.call.id,
      });
    },
  };
}

export type TelephonyGateway = ReturnType<typeof createTelephonyGateway>;
