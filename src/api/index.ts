/**
 * CenterAI API client.
 *
 * Two interchangeable transports behind one typed surface:
 *   • "http"  — real backend, enabled with VITE_API_BASE_URL
 *   • "local" — the same server route handlers (server/http/router) executed in the browser,
 *               so the product works end-to-end with no deployment and no secrets.
 *
 * Nothing here can read server secrets: the local transport is created with an empty
 * environment source, which is exactly what puts it in demo mode.
 */

import {
  API_VERSION,
  DEMO_AGENT_ID,
  DEMO_ORGANIZATION_ID,
  type AgentDto,
  type AgentLanguage,
  type AgentSummaryDto,
  type AnalyticsSummaryDto,
  type ApiErrorBody,
  type ApiErrorCode,
  type ApiRequest,
  type CapabilitiesResponse,
  type ConnectorControlDto,
  type ConnectorTestResult,
  type TenantConnectorControlCenterDto,
  type TenantUsageFoundationDto,
  type EndSessionDto,
  type HealthResponse,
  type OrganizationBrandingDto,
  type PublicBrandingStatusDto,
  type RealtimeEndRequest,
  type RealtimeSessionDto,
  type RequestContext,
  type TenantCommercialSummaryDto,
  type UsageSummaryDto,
  type VoiceSessionDto,
  type VoiceTurnDto,
  type WorkspaceBootstrapDto,
} from "../../shared/contracts";
import { parseQuery } from "../../shared/validate";
import { createLogger } from "../../server/lib/observability";

/** The full API app, loaded lazily by the local transport only. */
type LocalApp = Awaited<ReturnType<typeof import("../../server/http/router").createApp>>;
import type { AuthSessionDto } from "../../shared/contracts";
import type {
  CreateVoiceSessionRequest,
  CreateVoiceSessionResponse,
  VoiceAnalyticsDto,
  EndVoiceSessionRequest as VoiceEndRequest,
  VoiceEndResponse,
  VoiceEngineCapabilities,
  VoiceInputResponse,
  VoiceSessionDetail,
  VoiceSessionRecord,
} from "../../shared/voiceContracts";

type Env = Record<string, string | undefined>;
const env: Env = (import.meta as unknown as { env?: Env }).env ?? {};

export const API_BASE_URL = (env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
export const API_TIMEOUT_MS = Number(env.VITE_API_TIMEOUT_MS ?? 12_000);
export const CONFIGURED_BACKEND = (env.VITE_VOICE_BACKEND ?? "auto") as "auto" | "demo" | "http";

/**
 * Streaming needs a server that can flush frames. The browser-only local transport cannot, so the
 * client uses buffered turns there and never claims otherwise.
 */
export const streamingSupported =
  typeof window !== "undefined" && typeof window.ReadableStream === "function";

export type ApiFailure = {
  code: ApiErrorCode | "NETWORK_ERROR" | "TIMEOUT";
  message: string;
  fields?: Record<string, string>;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

export interface ApiClient {
  readonly transport: "http" | "local";
  health(signal?: AbortSignal): Promise<ApiResult<HealthResponse>>;
  capabilities(signal?: AbortSignal): Promise<ApiResult<CapabilitiesResponse>>;
  agents(signal?: AbortSignal): Promise<ApiResult<AgentDto[]>>;
  startSession(
    input: { language: AgentLanguage; agentId?: string },
    signal?: AbortSignal
  ): Promise<ApiResult<VoiceSessionDto>>;
  sendTurn(
    input: { sessionId: string; utterance?: string },
    signal?: AbortSignal
  ): Promise<ApiResult<VoiceTurnDto>>;
  endSession(sessionId: string, signal?: AbortSignal): Promise<ApiResult<EndSessionDto>>;
  /** Server-brokered realtime session. Returns an ephemeral key only — never a provider secret. */
  startRealtimeSession(
    input: { agentId: string; language: AgentLanguage },
    signal?: AbortSignal
  ): Promise<ApiResult<RealtimeSessionDto>>;
  endRealtimeSession(input: RealtimeEndRequest): Promise<ApiResult<{ sessionId: string }>>;
  usage(sessionId?: string | null, signal?: AbortSignal): Promise<ApiResult<UsageSummaryDto>>;
  analytics(signal?: AbortSignal): Promise<ApiResult<AnalyticsSummaryDto>>;
  tenantCommercialSummary(signal?: AbortSignal): Promise<ApiResult<TenantCommercialSummaryDto>>;
  usageFoundation(signal?: AbortSignal): Promise<ApiResult<TenantUsageFoundationDto>>;
  workspaceBootstrap(signal?: AbortSignal): Promise<ApiResult<WorkspaceBootstrapDto>>;
  branding(signal?: AbortSignal): Promise<ApiResult<OrganizationBrandingDto>>;
  updateBranding(
    patch: Partial<Pick<OrganizationBrandingDto, "displayName" | "logoUrl" | "faviconUrl" | "primaryColor" | "accentColor" | "theme">>,
    signal?: AbortSignal
  ): Promise<ApiResult<OrganizationBrandingDto>>;
  publicBrandingStatus(signal?: AbortSignal): Promise<ApiResult<PublicBrandingStatusDto>>;
  sessions(signal?: AbortSignal): Promise<ApiResult<unknown[]>>;
  agent(id: string, signal?: AbortSignal): Promise<ApiResult<AgentDto>>;
  createAgent(input: Record<string, unknown>, signal?: AbortSignal): Promise<ApiResult<AgentDto>>;
  updateOrganization(
    patch: { name?: string; status?: "active" | "trial" | "suspended" },
    signal?: AbortSignal
  ): Promise<ApiResult<unknown>>;
  /** Voice Execution Engine — orchestration layer endpoints (never telephony). */
  engineCapabilities(signal?: AbortSignal): Promise<ApiResult<VoiceEngineCapabilities>>;
  agentSummary(signal?: AbortSignal): Promise<ApiResult<AgentSummaryDto>>;
  voiceSessions(signal?: AbortSignal): Promise<ApiResult<VoiceSessionRecord[]>>;
  voiceSession(id: string, signal?: AbortSignal): Promise<ApiResult<VoiceSessionDetail>>;
  createVoiceSession(
    input: CreateVoiceSessionRequest,
    signal?: AbortSignal
  ): Promise<ApiResult<CreateVoiceSessionResponse>>;
  sendVoiceInput(
    sessionId: string,
    text: string,
    signal?: AbortSignal
  ): Promise<ApiResult<VoiceInputResponse>>;
  endVoiceSession(
    sessionId: string,
    input: VoiceEndRequest,
    signal?: AbortSignal
  ): Promise<ApiResult<VoiceEndResponse>>;
  voiceAnalytics(signal?: AbortSignal): Promise<ApiResult<VoiceAnalyticsDto>>;
  /** Barge-in / stop: cancels generation for the current turn without closing the session. */
  cancelVoiceTurn(
    sessionId: string,
    input: { reason?: "barge_in" | "user_stop" | "network"; telemetry?: { turnId?: string; markers?: Record<string, number> } },
    signal?: AbortSignal
  ): Promise<ApiResult<{ state: string; cancelled: boolean }>>;
  reportVoiceTelemetry(
    sessionId: string,
    input: { turnId: string; markers: Record<string, number>; interrupted?: boolean; streamed?: boolean },
    signal?: AbortSignal
  ): Promise<ApiResult<unknown>>;
  setVoiceState(
    sessionId: string,
    state: string,
    signal?: AbortSignal
  ): Promise<ApiResult<{ state: string }>>;
  /** Path the Node adapter serves as SSE; null when the transport cannot stream. */
  voiceStreamUrl(sessionId: string): string | null;
  updateAgent(
    id: string,
    patch: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<ApiResult<AgentDto>>;
  deleteAgent(id: string, signal?: AbortSignal): Promise<ApiResult<{ id: string; deleted: true }>>;
  register(
    input: { name: string; email: string; password: string; organizationName?: string },
    signal?: AbortSignal
  ): Promise<ApiResult<{ session: AuthSessionDto }>>;
  login(
    input: { email: string; password: string },
    signal?: AbortSignal
  ): Promise<ApiResult<{ session: AuthSessionDto }>>;
  logout(signal?: AbortSignal): Promise<ApiResult<{ ok: true }>>;
  me(signal?: AbortSignal): Promise<ApiResult<AuthSessionDto>>;
  connectorControlCenter(signal?: AbortSignal): Promise<ApiResult<TenantConnectorControlCenterDto>>;
  createConnector(
    input: { name: string; provider: string },
    signal?: AbortSignal
  ): Promise<ApiResult<ConnectorControlDto>>;
  updateConnector(
    id: string,
    patch: { name?: string; enabled?: boolean },
    signal?: AbortSignal
  ): Promise<ApiResult<ConnectorControlDto>>;
  configureConnectorCredentials(
    id: string,
    credentials: Record<string, string>,
    signal?: AbortSignal
  ): Promise<ApiResult<{ configured: true }>>;
  testConnector(id: string, signal?: AbortSignal): Promise<ApiResult<ConnectorTestResult>>;
}

/* ── local transport (browser-side execution of the server handlers) ──── */

let localApp: Promise<LocalApp> | null = null;

/**
 * The local transport runs the real route handlers in this tab, with an empty environment — so it
 * is structurally demo mode: no provider key, no Postgres, and a session-only in-memory identity
 * broker (PBKDF2 digests, opaque tokens, expiry). Tokens live in module memory, never in
 * localStorage or sessionStorage.
 */
function getLocalApp(): Promise<LocalApp> {
  if (!localApp) {
    // Loaded on demand so the route handlers and services stay out of the first-load bundle.
    localApp = Promise.all([
      import("../../server/http/router"),
      import("../../server/http/auth/demo"),
    ]).then(([router, demo]) =>
      router.createApp({
        envSource: {},
        logger: createLogger("warn", import.meta.env?.DEV ? undefined : () => undefined),
        auth: demo.createDemoAuth(),
      })
    );
  }
  return localApp;
}

let sessionToken: string | null = null;
export const getSessionToken = () => sessionToken;
export const setSessionToken = (token: string | null) => {
  sessionToken = token;
};

const devContext: Omit<RequestContext, "requestId"> = {
  organizationId: DEMO_ORGANIZATION_ID,
  userId: null,
  role: "owner",
  authMode: "demo",
  // The cross-tenant probe carries no session, so it is treated as an anonymous caller.
  tokenPresented: false,
  at: new Date().toISOString(),
};

async function callLocal<T>(
  request: Omit<ApiRequest, "headers">,
  ctx: Omit<RequestContext, "requestId"> = devContext
): Promise<ApiResult<T>> {
  const app = await getLocalApp();

  // The local transport executes the real handlers, so route-level guards (validation,
  // error shape, tenant scoping) are exercised exactly as they will be server-side.
  if (ctx.organizationId !== devContext.organizationId) {
    const response = await app.handle(
      { ...request, headers: { "content-type": "application/json" } },
      { ...ctx, requestId: `selftest_${Math.random().toString(36).slice(2, 8)}` }
    );
    if (response.status >= 400) return { ok: false, error: toFailure(response.status, response.body) };
    return { ok: true, data: response.body as T };
  }

  const response = await app.handleSafe({
    method: request.method,
    path: request.path,
    search: request.query ? new URLSearchParams(request.query).toString() : "",
    headers: {
      "content-type": "application/json",
      // The local transport has no cookie jar, so the session token rides as a bearer header.
      ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: request.body,
  });
  if (response.status >= 400) return { ok: false, error: toFailure(response.status, response.body) };
  return { ok: true, data: response.body as T };
}

function toFailure(status: number, body: unknown): ApiFailure {
  const err = (body as ApiErrorBody | undefined)?.error;
  return {
    code: (err?.code ?? (status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST")) as ApiFailure["code"],
    message: err?.message ?? "Request failed.",
    ...(err?.fields ? { fields: err.fields } : {}),
  };
}

/* ── http transport ─────────────────────────────────────────────────── */

async function callHttp<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body: unknown,
  signal?: AbortSignal
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      // Cookies are the primary mechanism; "include" lets a same-site session ride along.
      credentials: "include",
      signal: controller.signal,
    });
    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: toFailure(res.status, payload) };
    return { ok: true, data: payload as T };
  } catch (error) {
    const aborted = (error as Error)?.name === "AbortError";
    return {
      ok: false,
      error: {
        code: aborted ? "TIMEOUT" : "NETWORK_ERROR",
        message: aborted
          ? "The API did not respond in time."
          : "The API could not be reached. Falling back to local demo mode.",
      },
    };
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function createApiClient(): ApiClient {
  const transport: ApiClient["transport"] = API_BASE_URL ? "http" : "local";

  const run = async <T>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    signal?: AbortSignal
  ) => {
    if (transport === "local") {
      const [pathname, search = ""] = path.split("?");
      return callLocal<T>({ method, path: pathname, query: parseQuery(search), body });
    }
    return callHttp<T>(method, path, body, signal);
  };

  return {
    transport,
    health: (signal) => run<HealthResponse>("GET", "/api/health", undefined, signal),
    capabilities: (signal) => run<CapabilitiesResponse>("GET", "/api/voice/capabilities", undefined, signal),
    agents: (signal) => run<AgentDto[]>("GET", "/api/agents", undefined, signal),
    startSession: (input, signal) => run<VoiceSessionDto>("POST", "/api/voice/session", input, signal),
    sendTurn: (input, signal) => run<VoiceTurnDto>("POST", "/api/voice/message", input, signal),
    endSession: (sessionId, signal) => run<EndSessionDto>("POST", "/api/voice/end", { sessionId }, signal),
    startRealtimeSession: (input, signal) =>
      run<RealtimeSessionDto>("POST", "/api/voice/realtime/session", input, signal),
    // keepalive so a tab close or unmount still records session_ended / session_failed
    endRealtimeSession: (input) =>
      transport === "local"
        ? run<{ sessionId: string }>("POST", "/api/voice/realtime/end", input)
        : fetch(`${API_BASE_URL}/api/voice/realtime/end`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
            keepalive: true,
            credentials: "omit",
          })
            .then(
              (res) =>
                res.ok
                  ? { ok: true as const, data: { sessionId: input.sessionId } }
                  : { ok: false as const, error: toFailure(res.status, null) }
            )
            .catch(() => ({
              ok: false as const,
              error: { code: "NETWORK_ERROR" as const, message: "offline" },
            })),
    usage: (sessionId, signal) =>
      run<UsageSummaryDto>(
        "GET",
        `/api/usage${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`,
        undefined,
        signal
      ),
    analytics: (signal) => run<AnalyticsSummaryDto>("GET", "/api/analytics", undefined, signal),
    tenantCommercialSummary: (signal) =>
      run<TenantCommercialSummaryDto>("GET", "/api/tenant/subscription", undefined, signal),
    usageFoundation: (signal) =>
      run<TenantUsageFoundationDto>("GET", "/api/usage/foundation", undefined, signal),
    workspaceBootstrap: (signal) =>
      run<WorkspaceBootstrapDto>("GET", "/api/workspace/bootstrap", undefined, signal),
    branding: (signal) =>
      run<OrganizationBrandingDto>("GET", "/api/workspace/branding", undefined, signal),
    updateBranding: (patch, signal) =>
      run<OrganizationBrandingDto>("PATCH", "/api/workspace/branding", patch, signal),
    publicBrandingStatus: (signal) =>
      run<PublicBrandingStatusDto>("GET", "/api/public/branding", undefined, signal),
    sessions: (signal) => run<unknown[]>("GET", "/api/voice/sessions", undefined, signal),
    agent: (id, signal) => run<AgentDto>("GET", `/api/agents/${encodeURIComponent(id)}`, undefined, signal),
    createAgent: (input, signal) => run<AgentDto>("POST", "/api/agents", input, signal),
    updateOrganization: (patch, signal) => run<unknown>("PATCH", "/api/organizations", patch, signal),

    /* ── Voice Execution Engine (orchestration layer) ── */
    engineCapabilities: (signal) =>
      run<VoiceEngineCapabilities>("GET", "/api/voice/engine/capabilities", undefined, signal),
    agentSummary: (signal) => run<AgentSummaryDto>("GET", "/api/agents/summary", undefined, signal),
    voiceSessions: (signal) => run<VoiceSessionRecord[]>("GET", "/api/voice/sessions", undefined, signal),
    voiceSession: (id, signal) =>
      run<VoiceSessionDetail>("GET", `/api/voice/sessions/${encodeURIComponent(id)}`, undefined, signal),
    createVoiceSession: (input, signal) =>
      run<CreateVoiceSessionResponse>("POST", "/api/voice/sessions", input, signal),
    sendVoiceInput: (sessionId, text, signal) =>
      run<VoiceInputResponse>(
        "POST",
        `/api/voice/sessions/${encodeURIComponent(sessionId)}/messages`,
        { text },
        signal
      ),
    endVoiceSession: (sessionId, input, signal) =>
      run<VoiceEndResponse>(
        "POST",
        `/api/voice/sessions/${encodeURIComponent(sessionId)}/end`,
        input,
        signal
      ),
    voiceAnalytics: (signal) => run<VoiceAnalyticsDto>("GET", "/api/analytics/voice", undefined, signal),
    cancelVoiceTurn: (sessionId, input, signal) =>
      run<{ state: string; cancelled: boolean }>(
        "POST",
        `/api/voice/sessions/${encodeURIComponent(sessionId)}/cancel`,
        input,
        signal
      ),
    reportVoiceTelemetry: (sessionId, input, signal) =>
      run<unknown>("POST", `/api/voice/sessions/${encodeURIComponent(sessionId)}/telemetry`, input, signal),
    setVoiceState: (sessionId, state, signal) =>
      run<{ state: string }>("POST", `/api/voice/sessions/${encodeURIComponent(sessionId)}/state`, { state }, signal),
    voiceStreamUrl: (sessionId) =>
      transport === "http" && streamingSupported
        ? `${API_BASE_URL}/api/voice/sessions/${encodeURIComponent(sessionId)}/stream`
        : null,
    updateAgent: (id, patch, signal) =>
      run<AgentDto>("PUT", `/api/agents/${encodeURIComponent(id)}`, patch, signal),
    deleteAgent: (id, signal) =>
      run<{ id: string; deleted: true }>("DELETE", `/api/agents/${encodeURIComponent(id)}`, {}, signal),

    connectorControlCenter: (signal) =>
      run<TenantConnectorControlCenterDto>("GET", "/api/connectors/control-center", undefined, signal),
    createConnector: (input, signal) =>
      run<ConnectorControlDto>("POST", "/api/connectors", input, signal),
    updateConnector: (id, patch, signal) =>
      run<ConnectorControlDto>("PUT", `/api/connectors/${encodeURIComponent(id)}`, patch, signal),
    configureConnectorCredentials: (id, credentials, signal) =>
      run<{ configured: true }>(
        "POST",
        `/api/connectors/${encodeURIComponent(id)}/credentials`,
        credentials,
        signal
      ),
    testConnector: (id, signal) =>
      run<ConnectorTestResult>("POST", `/api/connectors/${encodeURIComponent(id)}/test`, {}, signal),

    async register(input, signal) {
      const result = await run<{ session: AuthSessionDto }>("POST", "/api/auth/register", input, signal);
      if (result.ok) {
        const token = (result.data as { session: AuthSessionDto } & { bearerToken?: string }).bearerToken;
        if (token) setSessionToken(token);
        return { ok: true, data: { session: result.data.session } };
      }
      return result;
    },

    async login(input, signal) {
      const result = await run<{ session: AuthSessionDto }>("POST", "/api/auth/login", input, signal);
      if (result.ok) {
        const token = (result.data as { session: AuthSessionDto } & { bearerToken?: string }).bearerToken;
        if (token) setSessionToken(token);
        return { ok: true, data: { session: result.data.session } };
      }
      return result;
    },

    async logout(signal) {
      const result = await run<{ ok: true }>("POST", "/api/auth/logout", {}, signal);
      setSessionToken(null);
      return result.ok ? { ok: true, data: result.data } : result;
    },

    me: (signal) => run<AuthSessionDto>("GET", "/api/auth/me", undefined, signal),
  };
}

export const api = createApiClient();
export { API_VERSION, DEMO_AGENT_ID };

/* ── voice mode resolution (the only place that decides demo vs production) ── */

export type BackendState = "probing" | "connected" | "local" | "unreachable";

export interface VoiceMode {
  state: BackendState;
  mode: "demo" | "production";
  provider: string;
  /** The server can authorize a realtime session (it holds the credential). */
  realtime: boolean;
  realtimeModel: string | null;
  simulation: boolean;
  transport: ApiClient["transport"];
  latencyMs: number | null;
  message: string;
}

let currentMode: VoiceMode = {
  state: "probing",
  mode: "demo",
  provider: "DemoScriptEngine",
  realtime: false,
  realtimeModel: null,
  simulation: true,
  transport: api.transport,
  latencyMs: null,
  message: "Detecting CenterAI backend…",
};

const modeListeners = new Set<(mode: VoiceMode) => void>();
let probing: Promise<VoiceMode> | null = null;

export const getVoiceMode = () => currentMode;

export function subscribeVoiceMode(listener: (mode: VoiceMode) => void) {
  modeListeners.add(listener);
  return () => {
    modeListeners.delete(listener);
  };
}

function publish(next: VoiceMode) {
  currentMode = next;
  modeListeners.forEach((l) => l(next));
}

/**
 * Probe the backend. A configured production engine is only honoured if the API says so;
 * anything else (no backend, error, demo engine) keeps the simulated experience intact.
 */
export function resolveVoiceMode(force = false): Promise<VoiceMode> {
  if (probing && !force) return probing;

  probing = (async () => {
    const started = performance.now();
    if (CONFIGURED_BACKEND === "demo") {
      const demo: VoiceMode = {
        ...currentMode,
        state: api.transport === "local" ? "local" : "connected",
        mode: "demo",
        provider: "DemoScriptEngine",
        simulation: true,
        message: "Demo mode — forced by VITE_VOICE_BACKEND.",
        latencyMs: null,
      };
      publish(demo);
      return demo;
    }

    const [health, capabilities] = await Promise.all([api.health(), api.capabilities()]);

    if (!health.ok) {
      const offline: VoiceMode = {
        state: api.transport === "local" ? "local" : "unreachable",
        mode: "demo",
        provider: "DemoScriptEngine",
        realtime: false,
        realtimeModel: null,
        simulation: true,
        transport: api.transport,
        latencyMs: Math.round(performance.now() - started),
        message:
          api.transport === "local"
            ? "No backend configured — running the API handlers locally in demo mode."
            : "Backend unreachable — demo mode keeps the experience working.",
      };
      publish(offline);
      return offline;
    }

    const mode = capabilities.ok && capabilities.data.mode === "production" ? "production" : "demo";
    const realtime = Boolean(capabilities.ok && capabilities.data.realtime);
    const resolved: VoiceMode = {
      state: api.transport === "local" ? "local" : "connected",
      mode,
      provider: capabilities.ok ? capabilities.data.provider : "DemoScriptEngine",
      realtime,
      realtimeModel: capabilities.ok ? (capabilities.data.realtimeModel ?? null) : null,
      simulation: capabilities.ok ? capabilities.data.simulation : true,
      transport: api.transport,
      latencyMs: Math.round(performance.now() - started),
      message: realtime
        ? "Realtime voice available — the console will use the live provider."
        : mode === "production"
          ? "Production voice engine reported by the API."
          : "Demo mode — no production voice provider configured.",
    };
    publish(resolved);
    return resolved;
  })();

  return probing;
}

/* ── self-test: exercises the real routes in dev and on ?centerai=selftest ── */

export interface SelfTestResult {
  at: string;
  passed: number;
  failed: number;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
}

export async function runApiSelfTest(): Promise<SelfTestResult> {
  const checks: SelfTestResult["checks"] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const health = await api.health();
  add(
    "GET /api/health",
    health.ok && health.data.status === "ok" && health.data.service === "centerai-api",
    health.ok ? `appMode=${health.data.appMode} · engine=${health.data.mode}` : health.error.message
  );

  const caps = await api.capabilities();
  add("GET /api/voice/capabilities", caps.ok && typeof caps.data.mode === "string");
  add(
    "Demo Mode needs no credentials",
    caps.ok && caps.data.appMode === "demo" && caps.data.mode === "demo" && caps.data.simulation === true,
    caps.ok ? `provider=${caps.data.provider}` : caps.error.message
  );
  add(
    "telephony reported false",
    caps.ok && caps.data.telephony === false && caps.data.microphone === false
  );

  // Security property: in the browser the local handlers must never authorize a realtime leg.
  const realtimeAttempt = await api.startRealtimeSession({
    agentId: "centerai-demo-agent",
    language: "en",
  });
  const refusalCodes = [
    "RUNTIME_UNSUPPORTED",
    "PROVIDER_NOT_CONFIGURED",
    "CONFIG_INVALID",
    "REALTIME_UNAVAILABLE",
  ] as string[];
  add(
    "realtime never authorized in-browser",
    !realtimeAttempt.ok && refusalCodes.includes(realtimeAttempt.error.code),
    realtimeAttempt.ok ? "LEAKED — a key was reachable from the client" : undefined
  );

  const session = await api.startSession({ language: "en", agentId: DEMO_AGENT_ID });
  add("POST /api/voice/session", session.ok && Boolean(session.data.id), session.ok ? undefined : session.error.message);

  let turns = 0;
  let lastDone = false;
  if (session.ok) {
    for (let i = 0; i < session.data.turnCount; i += 1) {
      const turn = await api.sendTurn({ sessionId: session.data.id });
      if (!turn.ok) {
        add(`POST /api/voice/message #${i + 1}`, false, turn.error.message);
        break;
      }
      turns += 1;
      lastDone = turn.data.done;
      add(
        `agent text #${i + 1}`,
        turn.data.text.length > 0 || turn.data.done,
        `phase=${turn.data.phase} · engine=${turn.data.engine}`
      );
      if (turn.ok && turn.data.done) break;
    }
  }
  add("scenario completed via API", lastDone && turns > 0, `turns=${turns}`);

  const ended = session.ok ? await api.endSession(session.data.id) : null;
  add("POST /api/voice/end", Boolean(ended?.ok));

  const usage = await api.usage(session.ok ? session.data.id : undefined);
  add("GET /api/usage", usage.ok && usage.data.messages > 0, usage.ok ? `messages=${usage.data.messages}` : undefined);

  const analytics = await api.analytics();
  add("GET /api/analytics", analytics.ok && analytics.data.estimated === true);

  const badSession = await (api as ApiClient & typeof api).startSession({ language: "de" as AgentLanguage });
  add("invalid language rejected", !badSession.ok && badSession.error.code === "VALIDATION_FAILED");

  const foreign = await callLocal<{ id: string }>(
    {
      method: "POST",
      path: "/api/voice/message",
      body: { sessionId: session.ok ? session.data.id : "vsn_none" },
    },
    { ...devContext, organizationId: "org_other_tenant" }
  );
  add(
    "cross-tenant session access denied",
    !foreign.ok && foreign.error.code === "NOT_FOUND",
    foreign.ok ? "LEAKED" : undefined
  );

  const leaked = await callLocal<Record<string, unknown>>({ method: "GET", path: "/api/config" });
  const serialized = JSON.stringify(leaked.ok ? leaked.data : {}).toLowerCase();
  add(
    "no secrets in config response",
    leaked.ok && !/(api_key|secret|password|token|database_url)/.test(serialized)
  );

  const passed = checks.filter((c) => c.ok).length;
  return { at: new Date().toISOString(), passed, failed: checks.length - passed, checks };
}

/** Never expose raw config to the page; only presence/mode, for dev diagnostics. */
export function diagnosticsSnapshot() {
  return {
    version: API_VERSION,
    transport: api.transport,
    apiBaseUrlConfigured: Boolean(API_BASE_URL),
    mode: currentMode,
    secretsInClient: false,
  };
}
