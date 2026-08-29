/**
 * CenterAI — shared contracts.
 * Single source of truth for types used by the API server, its adapters and the web client.
 * Keep this module dependency-free: it must be importable from Node, edge runtimes and the browser.
 */

/* ── Multi-tenant primitives ────────────────────────────────────────── */

export const ROLES = ["owner", "admin", "manager", "operator", "viewer"] as const;
export type OrgRole = (typeof ROLES)[number];

/** Legacy spelling kept so older rows/clients still resolve to a real role. */
export const ROLE_ALIASES: Record<string, OrgRole> = {
  agent_operator: "operator",
  owner: "owner",
  admin: "admin",
  manager: "manager",
  operator: "operator",
  viewer: "viewer",
};

export const USER_STATUSES = ["active", "invited", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const INDUSTRIES = [
  "Banking",
  "Finance",
  "Healthcare",
  "Legal",
  "Enterprise Services",
] as const;
export type IndustryName = (typeof INDUSTRIES)[number];

export const AGENT_STATUSES = ["draft", "active", "paused", "archived"] as const;
export type AgentStatusName = (typeof AGENT_STATUSES)[number];

/**
 * Lifecycle semantics, enforced server-side:
 *  draft    → testable only from Studio Test Mode; never takes production traffic
 *  active   → available for sessions
 *  paused   → temporarily unavailable; existing history is kept
 *  archived → preserved but inactive; cannot be used or tested
 */
export const AGENT_STATUS_ALIASES: Record<string, AgentStatusName> = {
  live: "active",
  enabled: "active",
  active: "active",
  draft: "draft",
  paused: "paused",
  archived: "archived",
  disabled: "archived",
};

export const normalizeAgentStatus = (value: unknown): AgentStatusName | undefined =>
  AGENT_STATUS_ALIASES[String(value ?? "").trim().toLowerCase()];

/** Only an active agent may take a normal session. */
export const agentSelectable = (row: Pick<AgentRow, "status">) => row.status === "active";
/** Draft and active agents may run inside Studio Test Mode; paused/archived may not. */
export const agentTestable = (row: Pick<AgentRow, "status">) =>
  row.status === "active" || row.status === "draft";

export const ORG_STATUSES = ["active", "trial", "suspended"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const SESSION_STATUSES = ["created", "active", "completed", "failed"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** Legacy spelling some rows still carry; normalized on read. */
export const normalizeSessionStatus = (value: unknown): SessionStatus => {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "ended" || raw === "done" || raw === "closed") return "completed";
  return (SESSION_STATUSES as readonly string[]).includes(raw)
    ? (raw as SessionStatus)
    : "created";
};

export const MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** The engine writes `assistant`; older rows and some UIs say `agent`. Same meaning. */
export const normalizeMessageRole = (value: unknown): MessageRole => {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "agent" || raw === "assistant") return "assistant";
  return (MESSAGE_ROLES as readonly string[]).includes(raw) ? (raw as MessageRole) : "user";
};

export const USAGE_EVENTS = [
  "voice_session",
  "message",
  "ai_request",
  "characters",
  "audio_seconds",
  "input_messages",
  "output_messages",
  /** Measured per-turn latency, persisted as structured metadata (never audio). */
  "turn_telemetry",
  "provider_fallback",
  /** Realtime lifecycle (no audio payloads are ever stored for these). */
  "session_started",
  "session_ended",
  "session_completed",
  "session_failed",
] as const;
export type UsageEventType = (typeof USAGE_EVENTS)[number];

/** Every organization-owned row carries organizationId. */
export interface OrganizationOwned {
  organizationId: string;
}

/** The tenant root: organizations are not themselves owned by an organization. */
export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserRow extends OrganizationOwned {
  id: string;
  email: string;
  name: string;
  role: OrgRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * The only shape that ever carries a password hash. Never returned by an endpoint —
 * the router maps it to a session DTO and drops the hash immediately.
 */
export interface UserCredential {
  userId: string;
  organizationId: string;
  role: OrgRole;
  status: UserStatus;
  passwordHash: string;
}

export interface AuthSessionDto {
  userId: string;
  organizationId: string;
  email: string;
  name: string;
  role: OrgRole;
  organization: { id: string; name: string; slug: string; status: OrgStatus };
  issuedAt: string;
  expiresAt: string;
  /** Where the identity came from — used by the UI to stay honest about demo vs real. */
  identitySource: "jwt" | "demo-local";
}

export interface AuthResult {
  session: AuthSessionDto;
  /** Present only for the in-browser local transport, which cannot set cookies. */
  bearerToken?: string;
  cookie?: string;
}

export const AGENT_LANGUAGES = ["en", "ar", "jo"] as const;
export type AgentLanguage = (typeof AGENT_LANGUAGES)[number];

export interface AgentRow extends OrganizationOwned {
  id: string;
  name: string;
  description: string;
  language: AgentLanguage;
  /** Voice id is a logical reference (e.g. "layla-service") — never a credential. */
  voice: string;
  systemPrompt: string;
  industry: IndustryName;
  welcomeMessage: string;
  status: AgentStatusName;
  createdAt: string;
  updatedAt: string;
}


export interface VoiceSessionRow extends OrganizationOwned {
  id: string;
  agentId: string;
  userId: string | null;
  language: AgentLanguage;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  /** Seconds; null until the session closes. */
  durationSeconds: number | null;
  mode: EngineMode;
  /** Which conversation engine answered. Optional so older rows still type-check. */
  engine?: "demo" | "openai";
  /** Studio Test Mode: a draft agent exercised by an authenticated operator. */
  testMode?: boolean;
}

export interface MessageRow extends OrganizationOwned {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  /** Provider latency for assistant turns; never a public performance figure. */
  latencyMs?: number | null;
  timestamp: string;
}

export interface UsageEventRow extends OrganizationOwned {
  id: string;
  sessionId: string | null;
  eventType: UsageEventType;
  /** Seconds for audio/duration events, count for event-style metrics. */
  quantity: number;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

/* ── API DTOs ───────────────────────────────────────────────────────── */

export type EngineMode = "demo" | "production";
/** Application mode drives every external-integration decision. Default is demo. */
export type AppMode = "demo" | "production";

export interface HealthResponse {
  /** "degraded" is only ever reported when required production config is missing. */
  status: "ok" | "degraded";
  service: "centerai-api";
  version: string;
  time: string;
  /** Which voice engine this deployment answers with. */
  mode: EngineMode;
  appMode: AppMode;
}

/** Variable *names* are safe to expose; values never are. */
export interface ConfigStatusDto {
  appMode: AppMode;
  ok: boolean;
  /** Missing required variables for the active mode (names only). */
  missing: string[];
  /** Non-blocking notes, e.g. "storage not configured — transcripts stay in memory". */
  notes: string[];
  storage: { driver: string; configured: boolean; required: boolean };
  database: { driver: string; external: boolean };
  auth: { secretSource: "env" | "dev-ephemeral" | "missing"; mode: "disabled" | "demo" | "bearer" };
  crm: { enabled: boolean };
}

export interface CapabilitiesResponse {
  mode: EngineMode;
  appMode: AppMode;
  provider: string;
  simulation: boolean;
  telephony: boolean;
  realtimeAudio: boolean;
  microphone: boolean;
  /** Advisory only — never a guarantee. */
  latencyTargetMs: number | null;
  /** True only when the server can mint a short-lived realtime credential. */
  realtime: boolean;
  realtimeModel: string | null;
}

/** Browser-safe response: contains an ephemeral key, never a provider secret. */
export interface RealtimeSessionDto {
  sessionId: string;
  organizationId: string;
  agentId: string;
  agentName: string;
  language: AgentLanguage;
  /** Short-lived, browser-scoped credential for the realtime transport only. */
  ephemeralKey: string;
  /** SDP exchange endpoint the browser should POST its offer to. */
  sdpUrl: string;
  model: string;
  voice: string;
  expiresAt: string | null;
  /** Hard cap enforced client- and server-side (seconds). */
  maxDurationSeconds: number;
}

export interface RealtimeEndRequest {
  sessionId: string;
  outcome: "completed" | "stopped" | "failed";
  durationSeconds?: number;
  reason?: string;
}

export interface VoiceSessionDto {
  id: string;
  organizationId: string;
  agentId: string;
  agentName: string;
  language: AgentLanguage;
  status: SessionStatus;
  startedAt: string;
  mode: EngineMode;
  /** Number of turns the engine will play for this session. */
  turnCount: number;
}

export interface VoiceTurnDto {
  sessionId: string;
  turnId: string;
  seq: number;
  role: MessageRole;
  text: string;
  /** Phase hint the client maps to its own UI states (no audio involved). */
  phase: "listening" | "thinking" | "speaking";
  engine: EngineMode;
  durationMs: number;
  done: boolean;
}

export interface EndSessionDto {
  sessionId: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  turns: number;
  characters: number;
  mode: EngineMode;
}

/** Real, organization-scoped agent counts for the dashboard. */
export interface AgentSummaryDto {
  organizationId: string;
  total: number;
  active: number;
  draft: number;
  paused: number;
  archived: number;
  source: "agents";
}

export interface AgentDto {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  industry: IndustryName;
  language: AgentLanguage;
  languages: AgentLanguage[];
  voice: string;
  welcomeMessage: string;
  status: AgentStatusName;
  /** Convenience flag: only live agents may authorize new sessions. */
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Wire format: enums arrive as strings and are validated (never trusted) by the service.
 */
export interface AgentCreateRequest {
  name: string;
  description?: string;
  industry?: string;
  language?: string;
  voice?: string;
  systemPrompt?: string;
  welcomeMessage?: string;
  status?: string;
}

/** Every field optional; the service validates whichever ones arrive. */
export type AgentUpdateRequest = Partial<AgentCreateRequest>;

export interface UsageSummaryDto {
  organizationId: string;
  sessionId?: string;
  sessions: number;
  messages: number;
  aiRequests: number;
  characters: number;
  audioSeconds: number;
  byEventType: Record<string, number>;
  events: Array<{
    id: string;
    sessionId: string | null;
    eventType: UsageEventType;
    quantity: number;
    createdAt: string;
  }>;
}

export interface AnalyticsSummaryDto {
  organizationId: string;
  sessions: { total: number; active: number; ended: number };
  messages: number;
  characters: number;
  audioSeconds: number;
  byLanguage: Record<string, number>;
  /** Estimated usage only — billing is deliberately not implemented in this phase. */
  estimated: true;
}

/* ── Errors ─────────────────────────────────────────────────────────── */

export const API_ERROR_CODES = [
  "BAD_REQUEST",
  "VALIDATION_FAILED",
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "ACCOUNT_DISABLED",
  "EMAIL_TAKEN",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "RATE_LIMITED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "SESSION_ERROR",
  "VOICE_SESSION_ERROR",
  "PROVIDER_NOT_CONFIGURED",
  "PROVIDER_NOT_IMPLEMENTED",
  "AUTH_NOT_CONFIGURED",
  "CONFIG_INVALID",
  "RUNTIME_UNSUPPORTED",
  "REALTIME_UNAVAILABLE",
  "SESSION_TIMEOUT",
  "INTERNAL_ERROR",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** The only error shape the browser is ever allowed to see. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field-level details for VALIDATION_FAILED only. */
    fields?: Record<string, string>;
  };
}

/* ── Voice transport contract (client ↔ provider) ───────────────────── */

export type VoiceState =
  | "ready"
  | "listening"
  | "thinking"
  | "speaking"
  | "completed"
  | "stopped"
  | /** transport / microphone / provider failure — UI must return to a safe state */
    "error";

export type VoiceRole = "caller" | "agent";

/** One scripted or generated turn. `ms` is how long the phase lasts. */
export interface DemoTurn {
  role: VoiceRole;
  text: string;
  ms: number;
}

export type VoiceProviderEvent =
  | { type: "state"; state: VoiceState }
  | { type: "line"; id: string; role: VoiceRole; text: string; final?: boolean }
  | { type: "reset" }
  | {
      type: "notice";
      /** Short, human, non-technical copy for the console. Never a stack trace. */
      code:
        | "MIC_DENIED"
        | "MIC_MISSING"
        | "MIC_BUSY"
        | "UNSUPPORTED_BROWSER"
        | "NETWORK"
        | "SESSION_REJECTED"
        | "PROVIDER_UNAVAILABLE"
        | "TIMEOUT"
        | "CLOSED";
      message: string;
      /** True when the provider kept working by falling back to the simulator. */
      recovered: boolean;
    };

export interface VoiceProviderInfo {
  id: string;
  label: string;
  telephony: boolean;
  realtimeAudio: boolean;
  microphone: boolean;
  simulation: boolean;
}

/**
 * The browser-side transport. `DemoVoiceProvider` implements it with timers;
 * `HttpVoiceProvider` implements it against the API below. Nothing else in the UI changes.
 */
export interface VoiceProvider {
  readonly info: VoiceProviderInfo;
  subscribe(listener: (event: VoiceProviderEvent) => void): () => void;
  /**
   * `turns` is the scripted fallback transcript, so a provider can degrade to the
   * simulator without the console ever going blank. `onLevel` receives 0–1 input
   * levels for visualizers (event-driven, no polling, no React state churn).
   */
  start(options: {
    language: string;
    turns: DemoTurn[];
    onLevel?: (level: number) => void;
  }): void;
  stop(): void;
  reset(): void;
  dispose(): void;
}

/* ── Request/response envelope used by every adapter ────────────────── */

export interface ApiRequest {
  method: string;
  /** Path including the /api prefix, without query string. */
  path: string;
  query?: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/**
 * Compile-time tripwire: passing an un-awaited Promise into a response body is a bug that would
 * otherwise serialize as `{}`. Every repository method is async, so every handler must await.
 */
export type NoPromise<T> = T extends Promise<unknown> ? never : T;

export interface RequestContext {
  requestId: string;
  organizationId: string;
  userId: string | null;
  role: OrgRole;
  authMode: "demo" | "bearer";
  /**
   * True only when the request actually carried a token or session cookie. Demo Mode's implicit
   * tenant keeps working for public surfaces, but it is never reported as a signed-in session.
   */
  tokenPresented: boolean;
  at: string;
}

/** Error codes added for the auth phase. */
export const AUTH_ERROR_CODES = [
  "INVALID_CREDENTIALS",
  "EMAIL_TAKEN",
  "ACCOUNT_DISABLED",
  "UNAUTHENTICATED",
  "AUTH_NOT_CONFIGURED",
  "VALIDATION_ERROR",
] as const;

export const DEMO_ORGANIZATION_ID = "org_demo";
export const DEMO_AGENT_ID = "demo-agent";
export const API_VERSION = "0.1.0";
export const SERVICE_NAME = "centerai-api";
