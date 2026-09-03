/**
 * Service layer — the only place business rules live.
 * HTTP adapters stay thin; nothing here knows about Request/Response objects.
 * Every entry point takes an organizationId and passes it to the repository, which is how
 * tenant isolation is enforced rather than assumed.
 */

import {
  AGENT_LANGUAGES,
  AGENT_STATUSES,
  DEMO_AGENT_ID,
  INDUSTRIES,
  normalizeAgentStatus,
  type AgentCreateRequest,
  type AgentDto,
  type AgentUpdateRequest,
  type AgentLanguage,
  type AgentRow,
  type AgentStatusName,
  type AnalyticsSummaryDto,
  type EndSessionDto,
  type IndustryName,
  type UsageSummaryDto,
  type VoiceSessionDto,
  type VoiceSessionRow,
  type VoiceTurnDto,
} from "../../shared/contracts";
import { DEMO_AGENT } from "../../shared/demo";
import { sanitizeText, ValidationError } from "../../shared/validate";
import type { Db } from "../db/store";
import { newId } from "../db/store";
import type { Logger } from "../lib/observability";
import { ApiError, notFound } from "../lib/observability";
import type { VoiceEngine } from "../providers";

/** Baseline behaviour every CenterAI agent inherits; per-agent prompts extend, not replace it. */
const DEFAULT_SYSTEM_PROMPT = DEMO_AGENT.systemPrompt;

const resolveLanguage = (value: string | undefined, errors: Record<string, string>): AgentLanguage => {
  const candidate = (value ?? "en").trim().toLowerCase();
  if (!(AGENT_LANGUAGES as readonly string[]).includes(candidate)) {
    errors.language = `Language must be one of: ${AGENT_LANGUAGES.join(", ")}.`;
    return "en";
  }
  return candidate as AgentLanguage;
};

const resolveIndustry = (value: string | undefined, errors: Record<string, string>): IndustryName => {
  const candidate = sanitizeText(value ?? "Banking", 40);
  const match = (INDUSTRIES as readonly string[]).includes(candidate)
    ? (candidate as IndustryName)
    : undefined;
  if (!match) {
    errors.industry = `Industry must be one of: ${INDUSTRIES.join(", ")}.`;
    return "Banking";
  }
  return match;
};

const toAgentDto = (row: AgentRow): AgentDto => ({
  id: row.id,
  organizationId: row.organizationId,
  name: row.name,
  description: row.description,
  industry: row.industry,
  language: row.language,
  languages: [...AGENT_LANGUAGES],
  voice: row.voice,
  welcomeMessage: row.welcomeMessage,
  status: row.status,
  enabled: row.status === "active",
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export function createAgentService(db: Db) {
  return {
    async list(organizationId: string): Promise<AgentDto[]> {
      return (await db.agents.listByOrg(organizationId)).map(toAgentDto);
    },

    async get(organizationId: string, agentId: string): Promise<AgentDto> {
      const row = await db.agents.get(organizationId, agentId);
      if (!row) throw notFound("Agent");
      return toAgentDto(row);
    },

    /** Used when a session is opened: only a live agent of this tenant may take it. */
    async require(organizationId: string, agentId: string): Promise<AgentRow> {
      const agent = await db.agents.get(organizationId, agentId);
      if (!agent) throw notFound("Agent");
      if (agent.status !== "active") {
        throw new ApiError(
          "FORBIDDEN",
          `Agent is ${agent.status}; only a live agent can take new sessions.`
        );
      }
      return agent;
    },

    async create(organizationId: string, input: AgentCreateRequest): Promise<AgentDto> {
      const errors: Record<string, string> = {};
      const name = sanitizeText(input.name, 120);
      if (name.length < 2) errors.name = "Agent name is required (2+ characters).";
      const existing = await db.agents.listByOrg(organizationId);
      if (existing.some((a) => a.name.toLowerCase() === name.toLowerCase()))
        errors.name = "An agent with this name already exists in the workspace.";
      const language = resolveLanguage(input.language, errors);
      const industry = resolveIndustry(input.industry, errors);
      const welcome = sanitizeText(input.welcomeMessage ?? "", 600);
      if (welcome.length > 0 && welcome.length < 12)
        errors.welcomeMessage = "Write a fuller opening line (12+ characters) or leave it empty.";
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);

      return toAgentDto(
        await db.agents.create({
          id: newId("agt"),
          organizationId,
          name,
          description: sanitizeText(input.description ?? "", 500),
          industry,
          language,
          voice: sanitizeText(input.voice ?? "layla-service", 40),
          systemPrompt: sanitizeText(input.systemPrompt || DEFAULT_SYSTEM_PROMPT, 4000),
          welcomeMessage: welcome,
          status: normalizeAgentStatus(input.status) ?? "draft",
        })
      );
    },

    async update(organizationId: string, agentId: string, input: AgentUpdateRequest): Promise<AgentDto> {
      const current = await db.agents.get(organizationId, agentId);
      if (!current) throw notFound("Agent");

      const errors: Record<string, string> = {};
      const patch: Partial<AgentRow> = {};

      if (input.name !== undefined) {
        const name = sanitizeText(input.name, 120);
        if (name.length < 2) errors.name = "Agent name is required (2+ characters).";
        else if (
          (await db.agents.listByOrg(organizationId)).some(
            (a) => a.id !== agentId && a.name.toLowerCase() === name.toLowerCase()
          )
        )
          errors.name = "Another agent in this workspace already uses that name.";
        patch.name = name;
      }
      if (input.language !== undefined) patch.language = resolveLanguage(input.language, errors);
      if (input.industry !== undefined) patch.industry = resolveIndustry(input.industry, errors);
      if (input.description !== undefined) patch.description = sanitizeText(input.description, 500);
      if (input.voice !== undefined) patch.voice = sanitizeText(input.voice, 40);
      if (input.systemPrompt !== undefined) patch.systemPrompt = sanitizeText(input.systemPrompt, 4000);
      if (input.welcomeMessage !== undefined) {
        const welcome = sanitizeText(input.welcomeMessage, 600);
        if (welcome.length > 0 && welcome.length < 12)
          errors.welcomeMessage = "Write a fuller opening line (12+ characters) or leave it empty.";
        patch.welcomeMessage = welcome;
      }
      if (input.status !== undefined) {
        const nextStatus = normalizeAgentStatus(input.status);
        if (!nextStatus)
          errors.status = `Status must be one of: ${AGENT_STATUSES.join(", ")}.`;
        else patch.status = nextStatus as AgentStatusName;
      }

      if (Object.keys(errors).length > 0) throw new ValidationError(errors);
      const row = await db.agents.update(organizationId, agentId, patch);
      if (!row) throw notFound("Agent");
      return toAgentDto(row);
    },

    async remove(organizationId: string, agentId: string): Promise<{ id: string; deleted: true }> {
      const agent = await db.agents.get(organizationId, agentId);
      if (!agent) throw notFound("Agent");
      const sessions = await db.sessions.listByOrg(organizationId);
      if (sessions.some((session) => session.agentId === agentId && session.status === "active")) {
        throw new ApiError(
          "FORBIDDEN",
          "This agent has a session in progress. End the session before deleting the agent."
        );
      }
      if (!(await db.agents.remove(organizationId, agentId))) throw notFound("Agent");
      return { id: agentId, deleted: true };
    },

    async setStatus(organizationId: string, agentId: string, status: AgentStatusName): Promise<AgentDto> {
      const row = await db.agents.update(organizationId, agentId, { status });
      if (!row) throw notFound("Agent");
      return toAgentDto(row);
    },

    /** Workspace bootstrap for newly registered tenants. */
    async seedStarterAgent(organizationId: string): Promise<AgentRow | undefined> {
      if ((await db.agents.listByOrg(organizationId)).length > 0) return undefined;
      return db.agents.create({
        id: newId("agt"),
        organizationId,
        name: "CenterAI Enterprise Voice Agent",
        description: "Created with the workspace. Review the prompt, then mark it live.",
        industry: "Banking",
        language: "en",
        voice: "layla-service",
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        welcomeMessage:
          "Welcome to CenterAI. I can help with balance enquiries, card issues and appointment booking.",
        status: "draft",
      });
    },

    defaultAgentId: DEMO_AGENT_ID,
  };
}

/* ── Voice sessions + turn orchestration ───────────────────────────── */

export function createVoiceService(
  db: Db,
  engine: VoiceEngine,
  agents: ReturnType<typeof createAgentService>,
  logger: Logger,
  entitlements: import("./entitlements").EntitlementEngine
) {
  const states = new Map<string, { seq: number; characters: number; startedAt: number }>();

  /** Tenant-scoped session lookup — never returns another organization's row. */
  const getOwned = async (sessionId: string, organizationId: string): Promise<VoiceSessionRow> => {
    const row = await db.sessions.get(sessionId, organizationId);
    if (!row) throw notFound("Voice session");
    return row;
  };

  const asDto = (row: VoiceSessionRow, agentName: string, turnCount: number): VoiceSessionDto => ({
    id: row.id,
    organizationId: row.organizationId,
    agentId: row.agentId,
    agentName,
    language: row.language,
    status: row.status,
    startedAt: row.startedAt,
    mode: row.mode,
    turnCount,
  });

  return {
    async start(input: {
      organizationId: string;
      userId: string | null;
      agentId?: string;
      language: AgentLanguage;
    }): Promise<VoiceSessionDto> {
      await entitlements.assertFeature(input.organizationId, "voice_calls");
      const effectiveLimits = await entitlements.getEffectiveLimits(input.organizationId);
      const monthlySeconds = (await db.usage.listByOrg(input.organizationId))
        .filter((event) => event.eventType === "audio_seconds" && event.createdAt.slice(0, 7) === new Date().toISOString().slice(0, 7))
        .reduce((total, event) => total + event.quantity, 0);
      if (monthlySeconds / 60 >= effectiveLimits.maxMonthlyMinutes) {
        throw new ApiError("FORBIDDEN", "The monthly voice minute limit has been reached.");
      }
      const agentId = input.agentId || agents.defaultAgentId;
      const agent = await agents.require(input.organizationId, agentId);
      const sessionId = newId("vsn");

      const { scenario } = engine.createSession({
        sessionId,
        organizationId: input.organizationId,
        agentId,
        language: input.language,
      });

      const row = await db.sessions.create({
        id: sessionId,
        organizationId: input.organizationId,
        agentId,
        userId: input.userId,
        language: input.language,
        mode: engine.mode,
      });

      await db.usage.record({
        organizationId: input.organizationId,
        sessionId,
        eventType: "voice_session",
        quantity: 1,
        metadata: { mode: engine.mode, language: input.language },
      });

      states.set(sessionId, { seq: 0, characters: 0, startedAt: Date.now() });
      logger.info("voice_session_started", {
        organizationId: input.organizationId,
        sessionId,
        agentId,
        language: input.language,
        mode: engine.mode,
      });

      // One API turn = one caller line + one agent answer.
      return asDto(row, agent.name, Math.max(1, Math.ceil(scenario.turns.length / 2)));
    },

    async message(input: {
      organizationId: string;
      sessionId: string;
      utterance?: string;
    }): Promise<VoiceTurnDto> {
      await entitlements.assertFeature(input.organizationId, "voice_calls");
      const session = await getOwned(input.sessionId, input.organizationId);
      const agent = await db.agents.get(session.organizationId, session.agentId);
      if (!agent) throw notFound("Agent");
      const state = states.get(session.id) ?? { seq: 0, characters: 0, startedAt: Date.now() };

      const spoken = engine.transcribe({
        sessionId: session.id,
        utterance: sanitizeText(input.utterance ?? "", 2000) || undefined,
      });

      const answer =
        spoken.text || !spoken.done
          ? engine.generateResponse({
              sessionId: session.id,
              utterance: spoken.text,
              language: session.language,
              systemPrompt: agent.systemPrompt,
            })
          : { text: "", durationMs: 0, done: true };

      const synth = answer.text
        ? engine.synthesize({
            sessionId: session.id,
            text: answer.text,
            voice: agent.voice,
            language: session.language,
          })
        : { audioRef: null, characters: 0, durationMs: 0 };

      const record = (
        eventType: "ai_request" | "message" | "characters" | "audio_seconds",
        quantity = 1,
        metadata: Record<string, string | number | boolean> = {}
      ) =>
        db.usage.record({
          organizationId: session.organizationId,
          sessionId: session.id,
          eventType,
          quantity,
          metadata,
        });

      await record("ai_request", 1, { engine: engine.name });
      if (spoken.text) {
        await db.messages.append({
          organizationId: session.organizationId,
          sessionId: session.id,
          role: "user",
          content: spoken.text,
        });
        await record("message", 1, { role: "user" });
      }
      if (answer.text) {
        await db.messages.append({
          organizationId: session.organizationId,
          sessionId: session.id,
          role: "assistant",
          content: answer.text,
        });
        await record("message", 1, { role: "assistant" });
        await record("characters", synth.characters);
        if (synth.durationMs > 0) {
          await record("audio_seconds", Math.round((synth.durationMs / 1000) * 10) / 10, {
            estimated: true,
          });
        }
      }

      const seq = state.seq + 1;
      states.set(session.id, {
        seq,
        characters: state.characters + spoken.text.length + answer.text.length,
        startedAt: state.startedAt,
      });

      const done = answer.done === true || (spoken.done && !answer.text);
      if (done) {
        await db.sessions.patch(session.id, session.organizationId, {
          status: "completed",
          endedAt: new Date().toISOString(),
          durationSeconds: Math.max(0, Math.round((Date.now() - state.startedAt) / 1000)),
        });
      }

      logger.debug("voice_turn", {
        organizationId: session.organizationId,
        sessionId: session.id,
        seq,
        engine: engine.name,
        characters: answer.text.length,
      });

      return {
        sessionId: session.id,
        turnId: `${session.id}-${seq}`,
        seq,
        role: "assistant",
        text: answer.text,
        phase: answer.text ? "speaking" : "thinking",
        engine: engine.mode,
        durationMs: answer.durationMs || synth.durationMs,
        done,
      };
    },

    async end(input: { organizationId: string; sessionId: string }): Promise<EndSessionDto> {
      const session = await getOwned(input.sessionId, input.organizationId);
      const state = states.get(session.id) ?? { seq: 0, characters: 0, startedAt: Date.now() };
      const usage = engine.endSession({ sessionId: session.id });
      const endedAt = new Date().toISOString();
      const durationSeconds = Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));
      const row =
        (await db.sessions.patch(session.id, session.organizationId, {
          status: "completed",
          endedAt,
          durationSeconds,
        })) ?? session;

      states.delete(session.id);
      await db.usage.record({
        organizationId: session.organizationId,
        sessionId: session.id,
        eventType: "session_ended",
        quantity: 1,
        metadata: { seconds: durationSeconds },
      });

      logger.info("voice_session_ended", {
        organizationId: session.organizationId,
        sessionId: session.id,
        durationSeconds,
        turns: usage.turns,
      });

      return {
        sessionId: session.id,
        status: row.status,
        startedAt: row.startedAt,
        endedAt,
        durationMs: durationSeconds * 1000,
        turns: usage.turns,
        characters: usage.characters,
        mode: row.mode,
      };
    },

    async list(organizationId: string) {
      const [sessions, agents_] = await Promise.all([
        db.sessions.listByOrg(organizationId),
        db.agents.listByOrg(organizationId),
      ]);
      const nameOf = (agentId: string) =>
        agents_.find((a) => a.id === agentId)?.name ?? agentId;

      return sessions.slice(-50).reverse().map((session) => ({
        id: session.id,
        agentId: session.agentId,
        agentName: nameOf(session.agentId),
        language: session.language,
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationSeconds:
          session.durationSeconds ??
          (session.endedAt
            ? Math.max(
                0,
                Math.round(
                  (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000
                )
              )
            : null),
        turns: session.status === "active" ? 0 : undefined,
        mode: session.mode,
      }));
    },

    async messages(organizationId: string, sessionId: string) {
      await getOwned(sessionId, organizationId);
      return (await db.messages.listBySession(sessionId, organizationId)).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));
    },

    simulation: () => engine.capabilities.simulation,
  };
}

/* ── Usage + analytics (metering only; billing is a later phase) ────── */

export function createUsageService(db: Db) {
  return {
    async summary(organizationId: string, sessionId?: string | null): Promise<UsageSummaryDto> {
      const [s, events] = await Promise.all([
        db.usage.summarize(organizationId, sessionId ?? undefined),
        db.usage.listByOrg(organizationId, sessionId ?? undefined),
      ]);
      return {
        organizationId,
        ...(sessionId ? { sessionId } : {}),
        sessions: s.sessions,
        messages: s.messages,
        aiRequests: s.aiRequests,
        characters: s.characters,
        audioSeconds: s.audioSeconds,
        byEventType: s.byEventType,
        events: events.slice(-50).map((e) => ({
          id: e.id,
          sessionId: e.sessionId,
          eventType: e.eventType,
          quantity: e.quantity,
          createdAt: e.createdAt,
        })),
      };
    },

    async analytics(organizationId: string): Promise<AnalyticsSummaryDto> {
      const [sessions, summary] = await Promise.all([
        db.sessions.listByOrg(organizationId),
        db.usage.summarize(organizationId),
      ]);
      const byLanguage: Record<string, number> = {};
      for (const session of sessions) {
        byLanguage[session.language] = (byLanguage[session.language] ?? 0) + 1;
      }
      return {
        organizationId,
        sessions: {
          total: sessions.length,
          active: sessions.filter((s) => s.status === "active").length,
          ended: sessions.filter((s) => s.status === "completed").length,
        },
        messages: summary.messages,
        characters: summary.characters,
        audioSeconds: summary.audioSeconds,
        byLanguage,
        estimated: true,
      };
    },
  };
}

// ─── Phase 10A — Entitlement & Workspace Bootstrap Services ──────────────
export { createEntitlementEngine, seedDefaultPlans, DEFAULT_PLANS, ZERO_LIMITS, type EntitlementEngine, type SubscriptionWithPlan } from "./entitlements";
export { createSaasControlPlaneService, type SaasControlPlaneService } from "./saasControlPlane";
export {
  createTenantBrandingService,
  createExternalUrlBrandingAssetStore,
  type TenantBrandingService,
  type BrandingAssetStore,
} from "./tenantBranding";
export { createWorkspaceBootstrapService, type WorkspaceBootstrapService } from "./workspace";

// ─── Phase 10C — Governance Services ─────────────────────────────────────
export { createComplianceService, type ComplianceService } from "./compliance";
export { createDNCService, type DNCService } from "./dnc";
export { createReportService, type ReportService } from "./reports";
export { createAuditService, scrubSecrets, type AuditService } from "./audit";

// ─── Phase 10D — QA Evaluation Service ──────────────────────────────────
export { createQAEvaluationService, type QAEvaluationService } from "./qa";

// ─── Phase 10E — Data Connector Service ─────────────────────────────────
export { createConnectorService, type ConnectorService } from "./connectors";

// ─── Phase 11 — Contact Center Operations Service ───────────────────────
export { createOperationsService, type OperationsService } from "./operations";

// ─── Phase 12 — Campaign Execution Engine ───────────────────────────────
export { createCampaignExecutionService, type CampaignExecutionService } from "./campaignExecution";


// ─── Phase 15 — SaaS Billing & Revenue Operations ──────────────────────
export { createBillingService, type BillingService } from "./billing";

// ─── Phase 17: AI Evaluation ─────────────────────────────────────────────
export {
  createAIEvaluationProvider,
  MockAIEvaluationProvider,
  type AIEvaluationProviderAdapter,
} from "./aiEvaluationProvider";
export {
  createQAEvaluationServiceExtended,
  type QAEvaluationServiceExtended,
} from "./qa";

// ─── Phase 18: Enterprise Reporting & Analytics ──────────────────────────
export { KPIRegistry, createKPIRegistry, type KPIDefinition, type KPICategory, type DataSource } from "./kpiRegistry";
export { AnalyticsService, createAnalyticsService, type KPIResult, type DomainAnalytics, type OrganizationAnalytics, type PlatformAnalytics, type TimeRange, type AnalyticsFilter } from "./analytics";

// ─── Phase 19: Platform Admin Service ──────────────────────────────────────
export { createPlatformAdminService, type PlatformAdminService } from "./platformAdmin";
