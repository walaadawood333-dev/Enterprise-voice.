/**
 * CenterAI — shared contracts.
 * Single source of truth for types used by the API server, its adapters and the web client.
 * Keep this module dependency-free: it must be importable from Node, edge runtimes and the browser.
 */

/* ── Multi-tenant primitives ────────────────────────────────────────── */

export const ROLES = ["owner", "admin", "manager", "operator", "viewer"] as const;
export type OrgRole = (typeof ROLES)[number];

/** Platform administration roles — Phase 10A */
export const PLATFORM_ROLES = ["super_admin", "platform_admin", "platform_operator"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Combined user role — either platform or organization */
export type UserRole = OrgRole | PlatformRole;

/** Check if a role is a platform admin role */
export function isPlatformRole(role: string): role is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(role);
}

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

/* ── Telephony gateway types ──────────────────────────────────────── */

export const CALL_DIRECTIONS = ["inbound", "outbound"] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

export const CALL_STATUSES = [
  "created",
  "ringing",
  "answered",
  "active",
  "completed",
  "failed",
  "cancelled",
] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const CALL_EVENT_TYPES = [
  "call_created",
  "call_ringing",
  "call_answered",
  "media_connected",
  "call_completed",
  "call_failed",
  "call_cancelled",
] as const;
export type CallEventType = (typeof CALL_EVENT_TYPES)[number];

export const normalizeCallStatus = (value: unknown): CallStatus => {
  const raw = String(value ?? "").toLowerCase();
  return (CALL_STATUSES as readonly string[]).includes(raw) ? (raw as CallStatus) : "created";
};

/** Call terminal states: no further transitions are allowed. */
export const CALL_TERMINAL: readonly CallStatus[] = ["completed", "failed", "cancelled"];

export interface CallRow extends OrganizationOwned {
  id: string;
  agentId: string | null;
  voiceSessionId: string | null;
  provider: string;
  providerCallId: string | null;
  direction: CallDirection;
  status: CallStatus;
  fromNumber: string | null;
  toNumber: string | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CallEventRow extends OrganizationOwned {
  id: string;
  callId: string;
  eventType: CallEventType;
  provider: string;
  providerEventId: string | null;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

/** Call DTO exposed via API. */
export interface CallDto {
  id: string;
  organizationId: string;
  agentId: string | null;
  voiceSessionId: string | null;
  provider: string;
  providerCallId: string | null;
  direction: CallDirection;
  status: CallStatus;
  fromNumber: string | null;
  toNumber: string | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
}

export interface CallEventDto {
  id: string;
  callId: string;
  eventType: CallEventType;
  provider: string;
  createdAt: string;
}

/** Call analytics computed from real rows only. */
export interface CallAnalyticsDto {
  organizationId: string;
  total: number;
  inbound: number;
  outbound: number;
  answered: number;
  failed: number;
  completed: number;
  cancelled: number;
  active: number;
  averageDurationSeconds: number | null;
  byProvider: Record<string, number>;
  byDay: Array<{ date: string; total: number; answered: number; failed: number }>;
  empty: boolean;
}

/* ── Telephony Provider Readiness (Phase 8A) ─────────────────────── */

/** Provider registry lifecycle states. */
export const PROVIDER_REGISTRY_STATES = [
  "registered",
  "configured",
  "active",
  "degraded",
  "unavailable",
  "disabled",
] as const;
export type ProviderRegistryState = (typeof PROVIDER_REGISTRY_STATES)[number];

/** Provider certification status (Phase 8B). */
export const PROVIDER_CERTIFICATION_STATUSES = [
  "unavailable",
  "registered",
  "configuration_required",
  "configured",
  "sandbox_ready",
  "certification_pending",
  "certified",
  "production_ready",
  "active",
  "degraded",
  "disabled",
] as const;
export type ProviderCertificationStatus = (typeof PROVIDER_CERTIFICATION_STATUSES)[number];

/** Provider health status. */
export const PROVIDER_HEALTH_STATES = [
  "unknown",
  "healthy",
  "degraded",
  "unavailable",
  "disabled",
] as const;
export type ProviderHealthStatus = (typeof PROVIDER_HEALTH_STATES)[number];

/** Provider transport type — what kind of telephony it speaks. */
export const PROVIDER_TRANSPORT_TYPES = [
  "pstn",
  "sip",
  "webrtc",
  "gsm",
  "simulation",
] as const;
export type ProviderTransportType = (typeof PROVIDER_TRANSPORT_TYPES)[number];

/** Full provider capabilities — each declared explicitly, never assumed. */
export interface TelephonyCapabilities {
  inbound: boolean;
  outbound: boolean;
  pstn: boolean;
  sip: boolean;
  webrtc: boolean;
  mediaStreaming: boolean;
  webhooks: boolean;
  recording: boolean;
  simulation: boolean;
}

/**
 * Provider configuration DTO — safe for the Studio.
 * Never contains secrets. Only references and status flags.
 */
export interface ProviderConfigurationDto {
  providerId: string;
  providerName: string;
  label: string;
  transport: ProviderTransportType;
  simulation: boolean;
  registryState: ProviderRegistryState;
  healthStatus: ProviderHealthStatus;
  capabilities: TelephonyCapabilities;
  credentialsConfigured: boolean;
  webhookConfigured: boolean;
  environment: "demo" | "production";
  lastHealthCheck: string | null;
  enabled: boolean;
  isDefault: boolean;
}

/**
 * Provider selection result — includes the reason the provider was chosen,
 * so operators can diagnose routing decisions in logs.
 */
export interface ProviderSelectionResult {
  providerId: string | null;
  reason:
    | "explicit"
    | "organization_default"
    | "system_default"
    | "no_provider_available"
    | "demo_only"
    | "rejected_in_production";
  selected: boolean;
}

/**
 * Organization telephony provider policy row.
 * Stores configuration references only — never plaintext secrets.
 * Secrets live in environment variables or a future secrets vault.
 */
export interface OrganizationTelephonyProviderRow extends OrganizationOwned {
  id: string;
  provider: string;
  enabled: boolean;
  isDefault: boolean;
  /** Reference to environment variable names, never values. */
  configurationReference: string | null;
  status: ProviderRegistryState;
  createdAt: string;
  updatedAt: string;
}

/** DTO surfaced to the Studio — no secrets, only status. */
export interface OrganizationTelephonyProviderDto {
  id: string;
  organizationId: string;
  provider: string;
  enabled: boolean;
  isDefault: boolean;
  hasConfiguration: boolean;
  status: ProviderRegistryState;
  createdAt: string;
  updatedAt: string;
}

/** Telephony provider summary for the Studio integrations panel. */
export interface TelephonyProviderSummaryDto {
  providers: ProviderConfigurationDto[];
  activeProviderId: string | null;
  environment: "demo" | "production";
  canMakeProductionCalls: boolean;
  selectionPolicy: {
    method: "explicit" | "organization_default" | "system_default" | "none";
    notes: string[];
  };
}

// ─── Phase 10A — Subscription & Entitlement Row Types ─────────────────────

export interface PlanRow {
  id: string;
  name: string;
  /** Legacy derived classification for older workspace screens; not persisted or editable plan data. */
  planType: PlanType;
  status: PlanStatus;
  features: Feature[];
  limits: OrganizationLimits;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionRow {
  id: string;
  organizationId: string;
  planId: string;
  status: SubscriptionStatus;
  effectiveLimits: OrganizationLimits | null;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  startedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Per-tenant feature override. Plan features are the baseline; this row is the explicit grant/revoke. */
export interface OrganizationEntitlementRow {
  id: string;
  organizationId: string;
  feature: Feature;
  enabled: boolean;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationBrandingRow {
  id: string;
  organizationId: string;
  displayName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  theme: "light" | "dark" | "auto";
  createdAt: string;
  updatedAt: string;
}

export type AuditAction =
  // Phase 10A — Subscription & Organization
  | "ORGANIZATION_CREATED"
  | "ORGANIZATION_UPDATED"
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_CHANGED"
  | "PLAN_CREATED"
  | "PLAN_CHANGED"
  | "ENTITLEMENT_CHANGED"
  | "FEATURE_ENABLED"
  | "FEATURE_DISABLED"
  | "LIMIT_CHANGED"
  | "PROVIDER_POLICY_CHANGED"
  | "USER_INVITED"
  | "USER_REMOVED"
  | "ROLE_CHANGED"
  | "BRANDING_UPDATED"
  // Phase 10C — Agent Lifecycle
  | "AGENT_CREATED"
  | "AGENT_UPDATED"
  | "AGENT_DELETED"
  | "AGENT_STATUS_CHANGED"
  // Phase 10C — Campaign Lifecycle
  | "CAMPAIGN_CREATED"
  | "CAMPAIGN_UPDATED"
  | "CAMPAIGN_STATUS_CHANGED"
  // Phase 10C — DNC Management
  | "DNC_RECORD_ADDED"
  | "DNC_RECORD_REMOVED"
  | "DNC_ENFORCEMENT_BLOCKED"
  | "DNC_ENFORCEMENT_CHECKED"
  // Phase 10C — Compliance
  | "COMPLIANCE_POLICY_CREATED"
  | "COMPLIANCE_POLICY_UPDATED"
  | "COMPLIANCE_POLICY_DELETED"
  | "COMPLIANCE_POLICY_ENABLED"
  | "COMPLIANCE_POLICY_DISABLED"
  | "COMPLIANCE_EVALUATION_RUN"
  | "COMPLIANCE_VIOLATION_DETECTED"
  // Phase 10C — Integration
  | "INTEGRATION_CONFIGURED"
  | "INTEGRATION_UPDATED"
  | "INTEGRATION_REMOVED"
  // Phase 10C — Export
  | "REPORT_EXPORTED"
  // Phase 10D — QA Evaluation
  | "QA_TEMPLATE_CREATED"
  | "QA_TEMPLATE_UPDATED"
  | "QA_TEMPLATE_ARCHIVED"
  | "QA_TEMPLATE_DELETED"
  | "QA_EVALUATION_CREATED"
  | "QA_EVALUATION_SUBMITTED"
  | "QA_EVALUATION_VOIDED"
  | "QA_FINDING_CREATED"
  | "QA_FINDING_RESOLVED"
  // Phase 10E — Data Connectors
  | "CONNECTOR_CREATED"
  | "CONNECTOR_UPDATED"
  | "CONNECTOR_DELETED"
  | "CONNECTOR_ENABLED"
  | "CONNECTOR_DISABLED"
  | "CONNECTOR_TESTED"
  | "CONNECTOR_MAPPING_CREATED"
  | "CONNECTOR_MAPPING_UPDATED"
  | "CONNECTOR_MAPPING_DELETED"
  | "CONNECTOR_SYNC_STARTED"
  | "CONNECTOR_SYNC_COMPLETED"
  | "CONNECTOR_SYNC_FAILED"
  // Phase 11 — Contact Center Operations
  | "CALL_ENDED_BY_SUPERVISOR"
  | "ALERT_ACKNOWLEDGED"
  | "ALERT_RESOLVED"
  | "CONTACT_QUEUED"
  | "CONTACT_SKIPPED";

export interface AuditEventRow {
  id: string;
  organizationId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  action: AuditAction;
  metadata: Record<string, string | number | boolean | null>;
  ipAddress: string | null;
  createdAt: string;
}

// ─── Phase 10B — Campaign Row Types ────────────────────────────────────

export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled" | "failed";

export interface CampaignRow extends OrganizationOwned {
  id: string;
  name: string;
  description: string;
  agentId: string | null;
  status: CampaignStatus;
  direction: CallDirection;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  totalContacts: number;
  processedContacts: number;
  completedCalls: number;
  failedCalls: number;
  configuration: Record<string, string | number | boolean | null>;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignDto {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  agentId: string | null;
  agentName: string | null;
  status: CampaignStatus;
  direction: CallDirection;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  totalContacts: number;
  processedContacts: number;
  completedCalls: number;
  failedCalls: number;
  createdAt: string;
  updatedAt: string;
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
  "TELEPHONY_PROVIDER_NOT_CONFIGURED",
  "TELEPHONY_PROVIDER_UNAVAILABLE",
  "TELEPHONY_CAPABILITY_NOT_SUPPORTED",
  "TELEPHONY_CONFIGURATION_INVALID",
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

/** Feature entitlements — Phase 10A & 10C & 11 */
export const FEATURES = [
  "ai_agents",
  "voice_calls",
  "inbound_calls",
  "outbound_calls",
  "campaigns",
  "live_call_monitoring",
  "analytics",
  "advanced_analytics",
  "reporting",
  "data_connectors",
  "knowledge_base",
  "compliance",
  "dnc_management",
  "audit_trail",
  "qa_evaluation",
  "custom_branding",
  "api_access",
  "custom_integrations",
  "contact_center_operations",
] as const;
export type Feature = (typeof FEATURES)[number];

/** Plan types — Phase 10A */
export const PLAN_TYPES = ["starter", "professional", "enterprise", "custom"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

/** Plan publication lifecycle. Archived plans remain valid for existing subscriptions. */
export const PLAN_STATUSES = ["draft", "active", "archived"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** Subscription status — Phase 10A */
export const SUBSCRIPTION_STATUSES = ["active", "trial", "suspended", "cancelled", "past_due"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Organization limits — Phase 10A */
export interface OrganizationLimits {
  maxUsers: number;
  maxAgents: number;
  maxMonthlyMinutes: number;
  maxCampaigns: number;
  maxConnectors: number;
}

/** Plan entitlements — Phase 10A */
export interface PlanEntitlements {
  features: Feature[];
  limits: OrganizationLimits;
}

/** Subscription DTO — Phase 10A */
export interface SubscriptionDto {
  id: string;
  organizationId: string;
  planId: string;
  planName: string;
  planType: PlanType;
  status: SubscriptionStatus;
  entitlements: PlanEntitlements;
  effectiveLimits: OrganizationLimits;
  trialEndsAt: string | null;
  startedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantCommercialSummaryDto {
  subscription: SubscriptionDto | null;
  capabilities: Array<{
    feature: Feature;
    enabled: boolean;
    source: "plan" | "override" | "unavailable";
  }>;
  limits: OrganizationLimits;
  usage: {
    users: number;
    agents: number;
    monthlyMinutes: number;
    campaigns: number;
    connectors: number;
  };
  billing: { status: "not_configured"; provider: null };
}

/** Workspace bootstrap response — Phase 10A */
export interface WorkspaceBootstrapDto {
  user: {
    id: string;
    email: string;
    name: string;
    role: OrgRole;
    isPlatformAdmin: boolean;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    status: OrgStatus;
    branding: OrganizationBrandingDto;
  };
  subscription: SubscriptionDto | null;
  entitlements: Feature[];
  permissions: string[];
  limits: OrganizationLimits;
  enabledModules: string[];
}

/** Organization branding — Phase 10A */
export interface OrganizationBrandingDto {
  displayName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  theme: "light" | "dark" | "auto";
  /** Whether values came from a tenant row or safe organization defaults. */
  source: "tenant" | "fallback";
  assetStorage: {
    mode: "external_url";
    uploads: "not_configured";
  };
  customDomain: {
    status: "not_configured";
    hostname: null;
  };
  /** Pre-auth tenant discovery does not exist without verified custom-domain infrastructure. */
  loginBranding: {
    status: "not_configured";
  };
}

export interface PublicBrandingStatusDto {
  resolution: "not_configured";
  branding: null;
  customDomain: OrganizationBrandingDto["customDomain"];
  loginBranding: OrganizationBrandingDto["loginBranding"];
}

export const DEMO_ORGANIZATION_ID = "org_demo";
export const DEMO_AGENT_ID = "demo-agent";
export const API_VERSION = "0.1.0";
export const SERVICE_NAME = "centerai-api";

// ─── Phase 10C — Compliance Policy Types ──────────────────────────────────

export const COMPLIANCE_CATEGORIES = [
  "CALLING_HOURS",
  "CONTACT_FREQUENCY",
  "DISCLOSURE_REQUIREMENTS",
  "RESTRICTED_CONTACTS",
  "CONSENT_REQUIREMENTS",
  "DATA_RETENTION",
] as const;
export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number];

export const COMPLIANCE_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type ComplianceSeverity = (typeof COMPLIANCE_SEVERITIES)[number];

export interface CompliancePolicyRow extends OrganizationOwned {
  id: string;
  name: string;
  category: ComplianceCategory;
  enabled: boolean;
  severity: ComplianceSeverity;
  /** Structured configuration — no executable logic */
  configuration: Record<string, string | number | boolean | string[] | null>;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export const COMPLIANCE_EVALUATION_STATUSES = ["PASSED", "VIOLATION", "INCONCLUSIVE", "SKIPPED"] as const;
export type ComplianceEvaluationStatus = (typeof COMPLIANCE_EVALUATION_STATUSES)[number];

export interface ComplianceEvaluationRow extends OrganizationOwned {
  id: string;
  policyId: string;
  resourceType: string;
  resourceId: string;
  status: ComplianceEvaluationStatus;
  result: string;
  context: Record<string, string | number | boolean | null>;
  evaluatedAt: string;
}

export interface CompliancePolicyDto {
  id: string;
  organizationId: string;
  name: string;
  category: ComplianceCategory;
  enabled: boolean;
  severity: ComplianceSeverity;
  configuration: Record<string, string | number | boolean | string[] | null>;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceEvaluationDto {
  id: string;
  organizationId: string;
  policyId: string;
  policyName: string;
  category: ComplianceCategory;
  resourceType: string;
  resourceId: string;
  status: ComplianceEvaluationStatus;
  result: string;
  evaluatedAt: string;
}

// ─── Phase 10C — DNC (Do Not Contact) Types ───────────────────────────────

export const DNC_IDENTIFIER_TYPES = ["PHONE_NUMBER", "EMAIL", "CUSTOMER_ID"] as const;
export type DNCIdentifierType = (typeof DNC_IDENTIFIER_TYPES)[number];

export const DNC_STATUSES = ["ACTIVE", "EXPIRED", "REVOKED"] as const;
export type DNCStatus = (typeof DNC_STATUSES)[number];

export const DNC_SOURCES = ["MANUAL", "SYSTEM", "PORTAL", "LEGAL_REQUEST"] as const;
export type DNCSource = (typeof DNC_SOURCES)[number];

export interface DNCRecordRow extends OrganizationOwned {
  id: string;
  identifier: string;
  identifierType: DNCIdentifierType;
  status: DNCStatus;
  reason: string;
  source: DNCSource;
  expiresAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** DNC record safe for list views — identifier masked */
export interface DNCRecordDto {
  id: string;
  organizationId: string;
  /** Masked identifier for display */
  maskedIdentifier: string;
  identifierType: DNCIdentifierType;
  status: DNCStatus;
  reason: string;
  source: DNCSource;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** DNC enforcement result */
export interface DNCEnforcementResult {
  allowed: boolean;
  reason: string | null;
  dncRecordId: string | null;
  checkedAt: string;
}

// ─── Phase 10C — Report Types ─────────────────────────────────────────────

export interface ReportFilter {
  startDate?: string;
  endDate?: string;
  agentId?: string;
  direction?: CallDirection;
  status?: CallStatus;
}

export interface VoiceOperationsReport {
  organizationId: string;
  period: { start: string; end: string };
  summary: {
    totalCalls: number;
    inboundCalls: number;
    outboundCalls: number;
    completedCalls: number;
    failedCalls: number;
    cancelledCalls: number;
    activeCalls: number;
    averageDurationSeconds: number | null;
    totalDurationSeconds: number;
  };
  byDay: Array<{
    date: string;
    total: number;
    inbound: number;
    outbound: number;
    completed: number;
    failed: number;
  }>;
  byAgent: Array<{
    agentId: string;
    agentName: string;
    totalCalls: number;
    completedCalls: number;
    failedCalls: number;
    averageDurationSeconds: number | null;
  }>;
  filters: ReportFilter;
  empty: boolean;
}

export interface AgentPerformanceReport {
  organizationId: string;
  period: { start: string; end: string };
  summary: {
    totalAgents: number;
    activeAgents: number;
    totalSessions: number;
    completedSessions: number;
    failedSessions: number;
    averageCompletionRate: number;
  };
  agents: Array<{
    agentId: string;
    agentName: string;
    status: string;
    totalSessions: number;
    completedSessions: number;
    failedSessions: number;
    completionRate: number;
    averageDurationSeconds: number | null;
  }>;
  filters: ReportFilter;
  empty: boolean;
}

export interface CampaignReport {
  organizationId: string;
  period: { start: string; end: string };
  summary: {
    totalCampaigns: number;
    activeCampaigns: number;
    completedCampaigns: number;
    totalContacts: number;
    processedContacts: number;
    completedCalls: number;
    failedCalls: number;
  };
  campaigns: Array<{
    id: string;
    name: string;
    status: CampaignStatus;
    agentName: string | null;
    totalContacts: number;
    processedContacts: number;
    completedCalls: number;
    failedCalls: number;
    createdAt: string;
  }>;
  filters: ReportFilter;
  empty: boolean;
}

export interface AuditTrailDto {
  id: string;
  organizationId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  action: AuditAction;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

// ─── Phase 10D — QA Evaluation Types ──────────────────────────────────

export const QA_TEMPLATE_STATUSES = ["draft", "active", "archived"] as const;
export type QATemplateStatus = (typeof QA_TEMPLATE_STATUSES)[number];

export const QA_EVALUATION_TYPES = ["human", "rule_based", "ai"] as const;
export type QAEvaluationType = (typeof QA_EVALUATION_TYPES)[number];

export const QA_EVALUATION_STATUSES = ["draft", "in_progress", "completed", "void"] as const;
export type QAEvaluationStatus = (typeof QA_EVALUATION_STATUSES)[number];

export const QA_SCORING_METHODS = ["boolean", "pass_fail", "numeric", "percentage"] as const;
export type QAScoringMethod = (typeof QA_SCORING_METHODS)[number];

export const QA_FINDING_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type QAFindingSeverity = (typeof QA_FINDING_SEVERITIES)[number];

export const QA_FINDING_STATUSES = ["open", "acknowledged", "resolved"] as const;
export type QAFindingStatus = (typeof QA_FINDING_STATUSES)[number];

export interface QAEvaluationTemplateRow extends OrganizationOwned {
  id: string;
  name: string;
  description: string;
  status: QATemplateStatus;
  evaluationType: QAEvaluationType;
  maxScore: number;
  passingScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface QAEvaluationCriterionRow extends OrganizationOwned {
  id: string;
  templateId: string;
  name: string;
  description: string;
  weight: number;
  required: boolean;
  scoringMethod: QAScoringMethod;
  maxScore: number;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface QAEvaluationRow extends OrganizationOwned {
  id: string;
  templateId: string;
  voiceSessionId: string;
  evaluatorId: string | null;
  evaluatorName: string;
  status: QAEvaluationStatus;
  totalScore: number | null;
  passed: boolean | null;
  notes: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QAEvaluationScoreRow extends OrganizationOwned {
  id: string;
  evaluationId: string;
  criterionId: string;
  score: number;
  comments: string;
  createdAt: string;
  updatedAt: string;
}

export interface QAFindingRow extends OrganizationOwned {
  id: string;
  evaluationId: string;
  criterionId: string | null;
  category: string;
  severity: QAFindingSeverity;
  status: QAFindingStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface QAEvaluationTemplateDto {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: QATemplateStatus;
  evaluationType: QAEvaluationType;
  maxScore: number;
  passingScore: number;
  criteriaCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QAEvaluationCriterionDto {
  id: string;
  organizationId: string;
  templateId: string;
  name: string;
  description: string;
  weight: number;
  required: boolean;
  scoringMethod: QAScoringMethod;
  maxScore: number;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface QAEvaluationDto {
  id: string;
  organizationId: string;
  templateId: string;
  templateName: string;
  voiceSessionId: string;
  agentId: string;
  agentName: string;
  evaluatorId: string | null;
  evaluatorName: string;
  status: QAEvaluationStatus;
  totalScore: number | null;
  passed: boolean | null;
  notes: string;
  submittedAt: string | null;
  criteriaScores: Array<{
    criterionId: string;
    criterionName: string;
    score: number;
    maxScore: number;
    weight: number;
    comments: string;
  }>;
  findings: QAFindingDto[];
  createdAt: string;
  updatedAt: string;
}

export interface QAEvaluationScoreDto {
  id: string;
  organizationId: string;
  evaluationId: string;
  criterionId: string;
  criterionName: string;
  score: number;
  maxScore: number;
  weight: number;
  comments: string;
  createdAt: string;
  updatedAt: string;
}

export interface QAFindingDto {
  id: string;
  organizationId: string;
  evaluationId: string;
  criterionId: string | null;
  criterionName: string | null;
  category: string;
  severity: QAFindingSeverity;
  status: QAFindingStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface QAOverviewDto {
  organizationId: string;
  totalEvaluations: number;
  pendingReviews: number;
  completedReviews: number;
  averageQualityScore: number | null;
  passRate: number | null;
  recentEvaluations: QAEvaluationDto[];
  empty: boolean;
}

export interface QAAgentPerformanceDto {
  agentId: string;
  agentName: string;
  evaluations: number;
  averageScore: number | null;
  passRate: number | null;
  completedEvaluations: number;
  failedEvaluations: number;
}

export interface QAEvaluationAnalyticsDto {
  organizationId: string;
  totalEvaluations: number;
  completedEvaluations: number;
  averageScore: number | null;
  passRate: number | null;
  byTemplate: Array<{
    templateId: string;
    templateName: string;
    evaluations: number;
    averageScore: number | null;
  }>;
  byAgent: QAAgentPerformanceDto[];
  recentTrend: Array<{
    date: string;
    evaluations: number;
    averageScore: number | null;
  }>;
}

// ─── Phase 10E — Data Connectors Types ─────────────────────────────────

export type ConnectorType = "CRM" | "CORE_SYSTEM" | "LOAN_MANAGEMENT" | "COLLECTIONS" | "ERP" | "DATABASE" | "CUSTOM_API" | "PAYMENTS";

export type ConnectorStatus = "DRAFT" | "CONFIGURING" | "CONNECTED" | "DISCONNECTED" | "ERROR" | "DISABLED";

export type ConnectorHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";

export type SyncMode = "MANUAL" | "SCHEDULED" | "WEBHOOK" | "EVENT_DRIVEN";

export type SyncJobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type SyncDirection = "INBOUND" | "OUTBOUND" | "BIDIRECTIONAL";

export type DataTransformerType = "TRIM" | "LOWERCASE" | "UPPERCASE" | "PHONE_NORMALIZATION" | "DATE_NORMALIZATION" | "NUMBER_NORMALIZATION";

export type ConnectorActivityType = "CONNECTION_TESTED" | "CONNECTOR_ENABLED" | "CONNECTOR_DISABLED" | "SYNC_STARTED" | "SYNC_COMPLETED" | "SYNC_FAILED" | "MAPPING_CHANGED";

export interface DataConnectorRow extends OrganizationOwned {
  id: string;
  name: string;
  provider: string;
  type: ConnectorType;
  status: ConnectorStatus;
  healthStatus: ConnectorHealthStatus;
  syncMode: SyncMode;
  scheduleCron: string | null;
  credentialReference: string | null;
  configuration: Record<string, any>;
  lastSyncAt: string | null;
  lastTestedAt: string | null;
  lastHealthCheckAt: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DataConnectorFieldMappingRow extends OrganizationOwned {
  id: string;
  connectorId: string;
  sourceField: string;
  targetField: string;
  dataType: string;
  required: boolean;
  transformerType: DataTransformerType | null;
  transformerConfig: Record<string, any>;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DataConnectorSyncJobRow extends OrganizationOwned {
  id: string;
  connectorId: string;
  direction: SyncDirection;
  status: SyncJobStatus;
  startedAt: string | null;
  completedAt: string | null;
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage: string | null;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface DataConnectorActivityRow extends OrganizationOwned {
  id: string;
  connectorId: string;
  activityType: ConnectorActivityType;
  description: string;
  status: string;
  metadata: Record<string, any>;
  actorId: string | null;
  createdAt: string;
}

export interface DataConnectorDto {
  id: string;
  organizationId: string;
  name: string;
  provider: string;
  type: ConnectorType;
  status: ConnectorStatus;
  healthStatus: ConnectorHealthStatus;
  syncMode: SyncMode;
  lastSyncAt: string | null;
  lastTestedAt: string | null;
  enabled: boolean;
  mappingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DataConnectorFieldMappingDto {
  id: string;
  connectorId: string;
  sourceField: string;
  targetField: string;
  dataType: string;
  required: boolean;
  transformerType: DataTransformerType | null;
  displayOrder: number;
}

export interface DataConnectorSyncJobDto {
  id: string;
  connectorId: string;
  direction: SyncDirection;
  status: SyncJobStatus;
  startedAt: string | null;
  completedAt: string | null;
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage: string | null;
}

export interface DataConnectorActivityDto {
  id: string;
  connectorId: string;
  activityType: ConnectorActivityType;
  description: string;
  status: string;
  createdAt: string;
}

export interface ConnectorTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  diagnostics?: Record<string, any>;
}

export interface ConnectorSchemaField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface ConnectorSchema {
  entities: Array<{
    name: string;
    fields: ConnectorSchemaField[];
  }>;
}

// ─── Phase 11 — Contact Center Operations Types ───────────────────────

export const OPERATIONS_SESSION_STATES = ["created", "active", "completed", "failed"] as const;
export type OperationsSessionState = (typeof OPERATIONS_SESSION_STATES)[number];

export const CONTACT_QUEUE_STATUSES = ["PENDING", "QUEUED", "PROCESSING", "COMPLETED", "FAILED", "SKIPPED"] as const;
export type ContactQueueStatus = (typeof CONTACT_QUEUE_STATUSES)[number];

export const CALL_OUTCOMES = ["ANSWERED", "NO_ANSWER", "BUSY", "FAILED", "COMPLETED", "VOICEMAIL", "CANCELLED"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const OPERATIONAL_ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export type OperationalAlertSeverity = (typeof OPERATIONAL_ALERT_SEVERITIES)[number];

export const OPERATIONAL_ALERT_SOURCES = [
  "TELEPHONY_PROVIDER",
  "CONNECTOR",
  "CAMPAIGN",
  "SYSTEM",
  "COMPLIANCE",
] as const;
export type OperationalAlertSource = (typeof OPERATIONAL_ALERT_SOURCES)[number];

export interface CampaignContactRow extends OrganizationOwned {
  id: string;
  campaignId: string;
  /** External customer identifier from connector data */
  customerRef: string | null;
  /** Contact phone number */
  phoneNumber: string;
  /** Display name (may be masked) */
  displayName: string;
  status: ContactQueueStatus;
  callOutcome: CallOutcome | null;
  callId: string | null;
  voiceSessionId: string | null;
  /** When the contact entered the queue */
  queuedAt: string;
  /** When processing started */
  startedAt: string | null;
  /** When processing ended */
  endedAt: string | null;
  /** Number of attempts */
  attempts: number;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignContactDto {
  id: string;
  campaignId: string;
  customerRef: string | null;
  phoneNumber: string;
  displayName: string;
  status: ContactQueueStatus;
  callOutcome: CallOutcome | null;
  callId: string | null;
  voiceSessionId: string | null;
  queuedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  attempts: number;
}

export interface OperationalAlertRow extends OrganizationOwned {
  id: string;
  source: OperationalAlertSource;
  severity: OperationalAlertSeverity;
  code: string;
  message: string;
  /** Resource reference (e.g., provider id, connector id) */
  resourceType: string | null;
  resourceId: string | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalAlertDto {
  id: string;
  organizationId: string;
  source: OperationalAlertSource;
  severity: OperationalAlertSeverity;
  code: string;
  message: string;
  resourceType: string | null;
  resourceId: string | null;
  acknowledged: boolean;
  resolved: boolean;
  createdAt: string;
}

export interface OperationsOverviewDto {
  organizationId: string;
  activeCalls: number;
  callsToday: number;
  inboundCallsToday: number;
  outboundCallsToday: number;
  activeCampaigns: number;
  availableAgents: number;
  averageCallDurationSeconds: number | null;
  completionRate: number | null;
  empty: boolean;
}

export interface LiveCallDto {
  sessionId: string;
  organizationId: string;
  direction: CallDirection | null;
  callId: string | null;
  agentId: string;
  agentName: string;
  status: SessionStatus;
  callStatus: CallStatus | null;
  durationSeconds: number | null;
  startedAt: string;
  provider: string | null;
  campaignId: string | null;
  campaignName: string | null;
}

export interface LiveCallDetailDto {
  sessionId: string;
  organizationId: string;
  direction: CallDirection | null;
  callId: string | null;
  agentId: string;
  agentName: string;
  status: SessionStatus;
  callStatus: CallStatus | null;
  provider: string | null;
  durationSeconds: number | null;
  startedAt: string;
  endedAt: string | null;
  language: AgentLanguage;
  mode: EngineMode;
  campaignId: string | null;
  campaignName: string | null;
  messages: Array<{
    id: string;
    role: MessageRole;
    content: string;
    timestamp: string;
  }>;
  controls: {
    canEnd: boolean;
    canTransfer: boolean;
    canHold: boolean;
    canMute: boolean;
    canBarge: boolean;
    canWhisper: boolean;
  };
}

export interface SupervisorDashboardDto {
  organizationId: string;
  activeCalls: number;
  callsInQueue: number;
  activeCampaigns: number;
  availableAgents: number;
  busyAgents: number;
  offlineAgents: number;
  recentFailures: Array<{
    id: string;
    type: "call" | "campaign" | "session" | "connector";
    message: string;
    timestamp: string;
  }>;
  alerts: OperationalAlertDto[];
  empty: boolean;
}

export interface OperationsActivityDto {
  id: string;
  organizationId: string;
  type: "call_started" | "call_completed" | "call_failed" | "campaign_started" | "campaign_completed" | "connector_error" | "provider_error" | "compliance_violation";
  description: string;
  actorId: string | null;
  actorEmail: string | null;
  resourceId: string | null;
  timestamp: string;
}

export interface CustomerContextDto {
  sessionId: string;
  organizationId: string;
  /** Whether customer data is available via connectors */
  available: boolean;
  /** Dynamically populated from connector mappings */
  fields: Array<{
    label: string;
    value: string | number | boolean | null;
    type: string;
    sensitive: boolean;
  }>;
  /** Source connector information */
  source: {
    connectorId: string | null;
    connectorName: string | null;
    lastSyncedAt: string | null;
  } | null;
}

// ─── Phase 12 — Campaign Execution & Intelligent Dialing Engine ──────────

export type ContactValidationStatus = "VALID" | "INVALID" | "DUPLICATE" | "MISSING_PHONE" | "BLOCKED" | "DNC" | "UNREACHABLE" | "PENDING";

export type PhoneValidationStatus = "VALID" | "INVALID_FORMAT" | "INVALID_COUNTRY" | "UNKNOWN";

export type DialingQueueItemStatus = "QUEUED" | "RESERVED" | "DIALING" | "CONNECTED" | "COMPLETED" | "RETRY" | "FAILED" | "SKIPPED" | "BLOCKED" | "CANCELLED";

export type CallOutcomeType = "ANSWERED" | "NO_ANSWER" | "BUSY" | "FAILED" | "VOICEMAIL" | "WRONG_NUMBER" | "CALLBACK_REQUESTED" | "PROMISE_TO_PAY" | "REFUSED" | "DISPUTE" | "PAYMENT_CONFIRMED" | "DNC_REQUEST" | "LANGUAGE_CHANGE" | "TRANSFERRED" | "COMPLETED";

export type RetryBackoffStrategy = "FIXED" | "LINEAR" | "EXPONENTIAL" | "CUSTOM";

export type CampaignEventType12 = "CAMPAIGN_CREATED" | "CAMPAIGN_STARTED" | "CAMPAIGN_PAUSED" | "CAMPAIGN_RESUMED" | "CAMPAIGN_STOPPED" | "CAMPAIGN_COMPLETED" | "CONTACTS_IMPORTED" | "CONTACTS_VALIDATED" | "CONTACTS_DEDUPLICATED" | "DNC_CHECK_COMPLETED" | "QUEUE_PREPARED" | "RETRY_SCHEDULED" | "CALLBACK_SCHEDULED";

export interface ContactRow extends OrganizationOwned {
  id: string;
  firstName: string | null;
  lastName: string | null;
  rawPhone: string;
  normalizedPhone: string | null;
  email: string | null;
  customerId: string | null;
  externalId: string | null;
  language: string | null;
  timezone: string | null;
  country: string;
  segment: string | null;
  priority: number;
  customFields: Record<string, any>;
  validationStatus: ContactValidationStatus;
  phoneValidation: PhoneValidationStatus;
  countryCode: string | null;
  phoneType: string | null;
  isDnc: boolean;
  dncReason: string | null;
  isDuplicate: boolean;
  duplicateOfId: string | null;
  importedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignContactPhase12Row extends OrganizationOwned {
  id: string;
  campaignId: string;
  contactId: string;
  status: DialingQueueItemStatus;
  priority: number;
  attemptNumber: number;
  maxAttempts: number;
  scheduledAt: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
  expiresAt: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  callId: string | null;
  voiceSessionId: string | null;
  lastOutcome: CallOutcomeType | null;
  lastOutcomeDetail: string | null;
  blocked: boolean;
  blockedReason: string | null;
  isCallback: boolean;
  callbackAt: string | null;
  customData: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface DialAttemptRow extends OrganizationOwned {
  id: string;
  campaignContactId: string;
  attemptNumber: number;
  callId: string | null;
  voiceSessionId: string | null;
  outcome: CallOutcomeType | null;
  outcomeDetail: string | null;
  durationSeconds: number | null;
  provider: string | null;
  providerCallId: string | null;
  startedAt: string;
  connectedAt: string | null;
  endedAt: string | null;
  errorMessage: string | null;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface CampaignEventRow extends OrganizationOwned {
  id: string;
  campaignId: string;
  eventType: CampaignEventType12;
  description: string;
  metadata: Record<string, any>;
  actorId: string | null;
  createdAt: string;
}

export interface RetryPolicyRow extends OrganizationOwned {
  id: string;
  name: string;
  description: string;
  maxAttempts: number;
  backoffStrategy: RetryBackoffStrategy;
  outcomeDelays: Record<string, number>;
  outcomeActions: Record<string, string>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignScheduleRow extends OrganizationOwned {
  id: string;
  campaignId: string | null;
  timezone: string;
  allowedWeekdays: number[];
  allowedStartHour: number;
  allowedEndHour: number;
  holidays: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactImportInput {
  firstName?: string;
  lastName?: string;
  phone: string;
  email?: string;
  customerId?: string;
  externalId?: string;
  language?: string;
  timezone?: string;
  country?: string;
  segment?: string;
  priority?: number;
  customFields?: Record<string, any>;
}

export interface ContactImportResult {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  dnc: number;
  missingPhone: number;
  imported: number;
  rejected: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

export interface PhoneNormalizationResult {
  rawPhone: string;
  normalizedPhone: string | null;
  countryCode: string | null;
  isValid: boolean;
  validationStatus: PhoneValidationStatus;
}

export interface DialingQueueStats {
  queued: number;
  reserved: number;
  dialing: number;
  connected: number;
  completed: number;
  retry: number;
  failed: number;
  skipped: number;
  blocked: number;
  cancelled: number;
}

export interface CampaignExecutionMetrics {
  campaignId: string;
  totalContacts: number;
  eligible: number;
  blocked: number;
  dnc: number;
  invalid: number;
  queued: number;
  dialed: number;
  answered: number;
  connected: number;
  completed: number;
  failed: number;
  noAnswer: number;
  busy: number;
  voicemail: number;
  callbacks: number;
  promiseToPay: number;
  retries: number;
  connectionRate: number;
  answerRate: number;
  completionRate: number;
  retryRate: number;
  averageDurationSeconds: number | null;
}

export interface OutcomeExtraction {
  outcome: CallOutcomeType;
  sentiment: string | null;
  intent: string | null;
  promisedAmount: number | null;
  promisedDate: string | null;
  dispute: boolean;
  callbackTime: string | null;
  customerLanguage: string | null;
  escalationRequired: boolean;
}

// ─── Phase 15 — SaaS Billing & Revenue Operations ─────────────────────

/** Billing interval for plans and invoices */
export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Invoice status lifecycle */
export const INVOICE_STATUSES = [
  "draft",
  "open",
  "paid",
  "void",
  "uncollectible",
  "refunded",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Payment status */
export const PAYMENT_STATUSES = [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Payment method types */
export const PAYMENT_METHOD_TYPES = ["card", "bank_transfer", "wire", "manual"] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

/** Invoice row — server-side billing record */
export interface InvoiceRow extends OrganizationOwned {
  id: string;
  /** Unique invoice number (e.g., INV-2026-0001) */
  invoiceNumber: string;
  /** Subscription that generated this invoice */
  subscriptionId: string;
  /** Billing period start (ISO timestamp) */
  periodStart: string;
  /** Billing period end (ISO timestamp) */
  periodEnd: string;
  /** Invoice status */
  status: InvoiceStatus;
  /** Base plan charge in cents */
  planAmountCents: number;
  /** Overage charges in cents */
  overageAmountCents: number;
  /** Tax amount in cents */
  taxAmountCents: number;
  /** Discount amount in cents */
  discountAmountCents: number;
  /** Total amount in cents */
  totalAmountCents: number;
  /** Amount paid in cents */
  amountPaidCents: number;
  /** Amount remaining in cents */
  amountRemainingCents: number;
  /** Currency (ISO 4217) */
  currency: string;
  /** Due date (ISO timestamp) */
  dueAt: string | null;
  /** Paid date (ISO timestamp) */
  paidAt: string | null;
  /** Voided date (ISO timestamp) */
  voidedAt: string | null;
  /** Usage snapshot at invoice time */
  usageSnapshot: Record<string, number>;
  /** Notes */
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Invoice DTO — safe for API responses */
export interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
  status: InvoiceStatus;
  planAmountCents: number;
  overageAmountCents: number;
  taxAmountCents: number;
  discountAmountCents: number;
  totalAmountCents: number;
  amountPaidCents: number;
  amountRemainingCents: number;
  currency: string;
  dueAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Payment row — server-side payment record */
export interface PaymentRow extends OrganizationOwned {
  id: string;
  invoiceId: string;
  /** Payment amount in cents */
  amountCents: number;
  /** Currency (ISO 4217) */
  currency: string;
  /** Payment status */
  status: PaymentStatus;
  /** Payment method type */
  paymentMethodType: PaymentMethodType;
  /** External payment provider reference (e.g., Stripe payment_intent_id) */
  externalPaymentId: string | null;
  /** Payment provider used */
  paymentProvider: string | null;
  /** Failure reason if status is failed */
  failureReason: string | null;
  /** Refunded date (ISO timestamp) */
  refundedAt: string | null;
  /** Idempotency key for payment provider */
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

/** Payment DTO — safe for API responses */
export interface PaymentDto {
  id: string;
  invoiceId: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  paymentMethodType: PaymentMethodType;
  paymentProvider: string | null;
  failureReason: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Usage aggregation for billing period */
export interface BillingPeriodUsage {
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  /** Usage by event type */
  byEventType: Record<string, number>;
  /** Total sessions */
  totalSessions: number;
  /** Total AI requests */
  totalAiRequests: number;
  /** Total audio seconds */
  totalAudioSeconds: number;
  /** Total characters */
  totalCharacters: number;
  /** Total messages */
  totalMessages: number;
}

/** Overage calculation result */
export interface OverageCalculation {
  /** Total usage */
  totalUsage: number;
  /** Plan limit */
  limit: number;
  /** Overage amount */
  overage: number;
  /** Overage rate in cents per unit */
  overageRateCents: number;
  /** Overage charge in cents */
  overageChargeCents: number;
}

/** Payment provider interface — provider-agnostic abstraction */
export interface PaymentProvider {
  /** Provider identifier */
  readonly id: string;
  /** Provider display name */
  readonly name: string;
  /** Create a payment intent */
  createPaymentIntent(
    amountCents: number,
    currency: string,
    metadata: Record<string, string>
  ): Promise<PaymentIntentResult>;
  /** Capture a payment intent */
  capturePaymentIntent(paymentIntentId: string): Promise<PaymentCaptureResult>;
  /** Refund a payment */
  refundPayment(paymentId: string, amountCents: number): Promise<PaymentRefundResult>;
  /** Verify webhook signature */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
  /** Process webhook event */
  processWebhookEvent(event: any): Promise<WebhookEventResult>;
}

/** Payment intent creation result */
export interface PaymentIntentResult {
  success: boolean;
  paymentIntentId: string | null;
  clientSecret: string | null;
  errorMessage: string | null;
}

/** Payment capture result */
export interface PaymentCaptureResult {
  success: boolean;
  paymentId: string | null;
  errorMessage: string | null;
}

/** Payment refund result */
export interface PaymentRefundResult {
  success: boolean;
  refundId: string | null;
  errorMessage: string | null;
}

/** Webhook event processing result */
export interface WebhookEventResult {
  eventType: string;
  invoiceId: string | null;
  paymentId: string | null;
  success: boolean;
  errorMessage: string | null;
}

/** Billing configuration */
export interface BillingConfig {
  /** Enable automatic invoice generation */
  autoGenerateInvoices: boolean;
  /** Enable automatic payment processing */
  autoProcessPayments: boolean;
  /** Payment provider to use */
  paymentProvider: string | null;
  /** Currency for billing */
  currency: string;
  /** Tax rate (percentage, e.g., 0.08 for 8%) */
  taxRate: number;
  /** Grace period in days after due date */
  gracePeriodDays: number;
}

/** Subscription change request */
export interface SubscriptionChangeRequest {
  /** New plan ID */
  newPlanId: string;
  /** Whether to prorate */
  prorate: boolean;
  /** Effective date (immediate or end of period) */
  effectiveDate: "immediate" | "end_of_period";
}

/** Subscription change result */
export interface SubscriptionChangeResult {
  success: boolean;
  newSubscriptionId: string | null;
  creditAmountCents: number;
  chargeAmountCents: number;
  errorMessage: string | null;
}

/** Invoice generation input */
export interface GenerateInvoiceInput {
  organizationId: string;
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
}

/** Usage limit check result */
export interface UsageLimitCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  remaining: number;
  overage: number;
}

// ─── Phase 17: AI Evaluation Types ─────────────────────────────────────

/**
 * AI Evaluation Provider
 */
export const AI_EVALUATION_PROVIDERS = ["openai", "anthropic", "custom"] as const;
export type AIEvaluationProvider = (typeof AI_EVALUATION_PROVIDERS)[number];

/**
 * AI Evaluation Result
 */
export interface AIEvaluationResult {
  criterionId: string;
  score: number;
  maxScore: number;
  confidence: number; // 0-1 confidence level
  reasoning: string;
  evidence: string[]; // Transcript excerpts or evidence references
  suggestions?: string[];
}

/**
 * AI Evaluation Request
 */
export interface AIEvaluationRequest {
  organizationId: string;
  evaluationId: string;
  templateId: string;
  voiceSessionId: string;
  transcript: Array<{ role: string; content: string; timestamp: string }>;
  criteria: Array<{
    id: string;
    name: string;
    description: string;
    maxScore: number;
    weight: number;
  }>;
}

/**
 * AI Evaluation Response
 */
export interface AIEvaluationResponse {
  success: boolean;
  results: AIEvaluationResult[];
  overallConfidence: number;
  provider: AIEvaluationProvider;
  model?: string;
  latencyMs: number;
  error?: string;
}

/**
 * AI Evaluation Configuration
 */
export interface AIEvaluationConfig {
  provider: AIEvaluationProvider;
  model?: string;
  apiKey?: string;
  apiEndpoint?: string;
  temperature?: number;
  maxTokens?: number;
  enabled: boolean;
}

/**
 * AI Evaluation Metrics
 */
export interface AIEvaluationMetrics {
  totalEvaluations: number;
  averageConfidence: number;
  providerUsage: Record<AIEvaluationProvider, number>;
  averageLatencyMs: number;
  errorRate: number;
}
