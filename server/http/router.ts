/**
 * API router — framework-free.
 * `handleApiRequest` takes a plain { method, path, headers, body } object and returns a plain
 * { status, body }, so the identical route table runs under Node, a serverless function, or the
 * browser's local fallback adapter.
 */

import {
  API_VERSION,
  DEMO_AGENT_ID,
  DEMO_ORGANIZATION_ID,
  SERVICE_NAME,
  type ApiRequest,
  type ApiResponse,
  type RequestContext,
} from "../../shared/contracts";
import { optionalString, parseQuery, requireId, requireLanguage, sanitizeText } from "../../shared/validate";

const sanitizeName = (value: unknown) => sanitizeText(value, 80);
import { asObject } from "../../shared/validate";
import {
  publicConfigSummary,
  resolveEnv,
  validateStartupConfig,
  type EnvSource,
  type ServerEnv,
  type StartupConfig,
} from "../config/env";
import { createMemoryDb, createStore, newId, SCHEMA_SQL, type Db } from "../db/store";
import { ApiError, configInvalid, createLogger, notFound, rateLimited, toApiError, type Logger } from "../lib/observability";
import { resolveEngine, type VoiceEngine } from "../providers";
import { createIntegrations, type IntegrationRegistry } from "../integrations";
import { createAgentService, createUsageService, createVoiceService } from "../services";
import { createAuthService } from "../services/auth";
import { createVoiceOrchestrator } from "../services/voiceSessions";
import { NO_SECRETS, type RealtimeSecrets } from "../config/secrets";
import { bearerToken, cookieValue, type AuthBroker } from "./auth/broker";
import type { RealtimeEndRequest, RealtimeSessionDto } from "../../shared/contracts";

/**
 * The realtime broker is *injected* by the adapter that may hold credentials. The browser bundle
 * therefore never contains the credential-minting code path at all — it gets this refusing stub.
 */
export interface RealtimeServiceLike {
  available(): boolean;
  create(input: {
    organizationId: string;
    userId: string | null;
    agentId: string;
    language: "en" | "ar" | "jo";
  }): Promise<RealtimeSessionDto>;
  end(input: RealtimeEndRequest & {
    organizationId: string;
  }): Promise<{ sessionId: string; outcome: RealtimeEndRequest["outcome"]; durationSeconds: number }>;
}

export interface RealtimeFactoryContext {
  env: ServerEnv;
  db: Db;
  logger: Logger;
  agents: ReturnType<typeof createAgentService>;
  /**
   * The orchestrator is handed to the realtime service so a WebRTC leg reuses the *same* session
   * creation path: one state machine, one resume rule, one place that writes usage.
   */
  voiceEngine: ReturnType<typeof createVoiceOrchestrator>;
}

const refusingRealtime = (): RealtimeServiceLike => ({
  available: () => false,
  create: async () => {
    throw new ApiError(
      "RUNTIME_UNSUPPORTED",
      "This runtime cannot authorize realtime voice sessions. The demo experience continues unchanged."
    );
  },
  end: async ({ sessionId, outcome }) => ({ sessionId, outcome, durationSeconds: 0 }),
});
import { authenticate, authorize, createRateLimiter, type RateLimiter } from "./middleware";

/** The public demo can be addressed by either id. */
const normalizeAgentId = (raw?: string) =>
  !raw || raw === "centerai-demo-agent" || raw === DEMO_AGENT_ID ? DEMO_AGENT_ID : raw;

/** Endpoints that must keep answering even when production config is incomplete. */
const ALWAYS_PUBLIC = ["/api/health", "/api/voice/capabilities", "/api/config"];

export interface AppServices {
  agents: ReturnType<typeof createAgentService>;
  voice: ReturnType<typeof createVoiceService>;
  usage: ReturnType<typeof createUsageService>;
  realtime: RealtimeServiceLike;
  auth: ReturnType<typeof createAuthService>;
}

export interface App {
  env: ServerEnv;
  db: Db;
  logger: Logger;
  engine: VoiceEngine;
  services: AppServices;
  voiceEngine: ReturnType<typeof createVoiceOrchestrator>;
  limiter: RateLimiter;
  integrations: IntegrationRegistry;
  startup: StartupConfig;
  /** Present when an adapter supplied a broker; absent → auth routes answer 503. */
  auth?: AuthBroker;
  /**
   * Resolves the authenticated context for transports that bypass the JSON handler — the SSE
   * stream route in the Node adapter. Same rules as every other route: the organization comes
   * from the verified session, never from the client.
   */
  authenticate(headers: Record<string, string>): Promise<Omit<RequestContext, "requestId"> | null>;
  handle(request: ApiRequest, ctx: RequestContext): Promise<ApiResponse>;
  handleSafe(raw: {
    method: string;
    path: string;
    search?: string;
    headers: Record<string, string>;
    body?: unknown;
    ip?: string;
  }): Promise<ApiResponse>;
}

export interface CreateAppOptions {
  envSource?: EnvSource;
  logger?: Logger;
  db?: Db;
  engine?: VoiceEngine;
  /**
   * Credentials are injected by the adapter that owns them. Anything bundled for the browser
   * supplies neither — it receives the refusing stub above.
   */
  secrets?: RealtimeSecrets;
  realtime?: (ctx: RealtimeFactoryContext) => RealtimeServiceLike;
  /** Auth broker (password hashing + tokens). Omitted → auth routes answer AUTH_NOT_CONFIGURED. */
  auth?: AuthBroker;
  /** True only for adapters that can flush incremental frames (SSE). */
  streamingCapable?: boolean;
}

export function createApp(options: CreateAppOptions = {}): App {
  const env = resolveEnv(options.envSource ?? {});
  const logger = options.logger ?? createLogger(env.logLevel);
  const startup = validateStartupConfig(env);

  /*
   * Assembly is non-throwing on purpose: a misconfigured production deployment must still answer
   * /api/health (degraded, with the missing variable names) instead of crashing before it can
   * explain itself. Real fail-fast happens in the Node adapter before it starts listening.
   */
  const db = options.db ?? createStoreQuietly(env, logger, createStore, createMemoryDb);
  const engine = options.engine ?? resolveEngineQuietly(env, logger);
  const integrations = createIntegrations(env);

  const agents = createAgentService(db);
  const voice = createVoiceService(db, engine, agents, logger);
  const usage = createUsageService(db);

  /*
   * DEMO-BYPASS GUARD (server is the source of truth for APP_MODE).
   * A demo identity broker is only ever honoured in APP_MODE=demo. If a production process is
   * handed one — misconfigured adapter, stray env — it is discarded and the app degrades loudly
   * instead of authenticating anyone.
   */
  const productionMode = env.appMode === "production";
  const authBroker =
    productionMode && options.auth?.kind === "demo"
      ? (logger.error("demo_identity_rejected_in_production", {
          note: "APP_MODE=production refuses a demo identity broker; no mock token is issued.",
        }),
        undefined)
      : options.auth;
  if (productionMode && !authBroker) {
    logger.error("authentication_unavailable", {
      note: "production mode requires JWT_SECRET so a real broker can be built",
    });
  }

  const auth = createAuthService(db, authBroker, logger, {
    registrationOpen: env.auth.registrationOpen && !productionMode ? true : env.auth.registrationOpen,
  });
  const voiceEngine = createVoiceOrchestrator({
    db,
    env,
    logger,
    secrets: options.secrets ?? NO_SECRETS,
    streamingCapable: options.streamingCapable === true,
  });
  /*
   * The realtime (WebRTC) service is built after the orchestrator so a provider leg reuses the
   * same session creation path: one state machine, one resume rule, one writer of usage rows.
   */
  const realtime = options.realtime
    ? options.realtime({ env, db, logger, agents, voiceEngine })
    : refusingRealtime();
  const limiter = createRateLimiter(env.rateLimit);
  /** Tighter bucket for credential endpoints — slows guessing without a separate store. */
  const authLimiter = createRateLimiter({
    windowMs: env.rateLimit.windowMs,
    max: Math.max(5, Math.floor(env.rateLimit.max / 6)),
  });

  const app: App = {
    env,
    db,
    logger,
    engine,
    services: { agents, voice, usage, realtime, auth },
    voiceEngine,
    limiter,
    integrations,
    startup,
    auth: authBroker,
    async authenticate(headers) {
      try {
        return await authenticate(env, headers, {
          demoOrganizationId: DEMO_ORGANIZATION_ID,
          users: db.users,
          broker: authBroker,
        });
      } catch {
        return null;
      }
    },
    handle,
    handleSafe,
  };

  async function handle(request: ApiRequest, ctx: RequestContext): Promise<ApiResponse> {
    const path = request.path.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();
    const services = app.services;

    /*
     * Production mode with missing credentials: refuse real work, but keep the three
     * diagnostic endpoints answering so operators can see *which* variables are missing.
     */
    if (!startup.ok && !ALWAYS_PUBLIC.includes(path)) throw configInvalid(startup.problems);

    /* ── public ── */
    if (path === "/api/health" && method === "GET") {
      return ok({
        status: startup.ok ? ("ok" as const) : ("degraded" as const),
        service: SERVICE_NAME,
        version: API_VERSION,
        time: new Date().toISOString(),
        mode: env.mode,
        appMode: env.appMode,
      });
    }

    if (path === "/api/voice/capabilities" && method === "GET") {
      return ok({
        mode: env.mode,
        appMode: env.appMode,
        provider: engine.name,
        simulation: engine.capabilities.simulation,
        telephony: engine.capabilities.telephony,
        realtimeAudio: engine.capabilities.realtimeAudio,
        microphone: engine.capabilities.microphone,
        latencyTargetMs: 300,
        // The browser reads this to decide real-vs-demo. Never any credential material.
        realtime: env.realtime.enabled,
        realtimeModel: env.realtime.enabled ? env.realtime.model : null,
      });
    }

    /* ── realtime voice (server-brokered, ephemeral credential only) ── */
    if (path === "/api/voice/realtime/session" && method === "POST") {
      // A provider credential costs money and touches a live media leg: in production it may
      // never be minted for an anonymous caller. Demo Mode has no credential to leak.
      if (env.appMode === "production") requireSession(ctx);
      const body = asObject(request.body);
      const language = requireLanguage(body, "language");
      const agentId = normalizeAgentId(optionalString(body, "agentId", 64));
      const dto = await services.realtime.create({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        agentId,
        language,
      });
      return ok(dto, 201);
    }

    if (path === "/api/voice/realtime/end" && method === "POST") {
      if (env.appMode === "production") requireSession(ctx);
      const body = asObject(request.body);
      const sessionId = requireId(body, "sessionId");
      const rawOutcome = optionalString(body, "outcome", 16) ?? "completed";
      const outcome =
        rawOutcome === "failed" ? "failed" : rawOutcome === "stopped" ? "stopped" : "completed";
      const durationRaw = Number(body.durationSeconds);
      return ok(
        services.realtime.end({
          organizationId: ctx.organizationId,
          sessionId,
          outcome,
          durationSeconds: Number.isFinite(durationRaw) ? durationRaw : undefined,
          reason: optionalString(body, "reason", 80),
        })
      );
    }

    /* ── authentication (server-validated; no client-side truth) ── */
    if (path === "/api/auth/register" && method === "POST") {
      const body = asObject(request.body);
      const result = await services.auth.register({
        name: body.name,
        email: body.email,
        password: body.password,
        organizationName: body.organizationName,
      });
      return authResponse(result, ctx, app, request, 201);
    }

    if (path === "/api/auth/login" && method === "POST") {
      const body = asObject(request.body);
      const result = await services.auth.login({ email: body.email, password: body.password });
      return authResponse(result, ctx, app, request, 200);
    }

    if (path === "/api/auth/logout" && method === "POST") {
      const token =
        bearerToken(request.headers["authorization"]) ??
        cookieValue(request.headers["cookie"], app.auth?.cookieName ?? "centerai_session");
      services.auth.logout(token ?? null);
      return {
        status: 200,
        body: { ok: true },
        headers: app.auth
          ? { "set-cookie": app.auth.clearCookie(app.auth, env.nodeEnv === "production") }
          : undefined,
      };
    }

    if (path === "/api/auth/me" && method === "GET") {
      return ok(services.auth.me(ctx));
    }

    /* ── voice execution engine (orchestration layer; no telephony) ── */
    if (path === "/api/voice/engine/capabilities" && method === "GET") {
      return ok(app.voiceEngine.capabilities());
    }

    if (path === "/api/voice/sessions" && method === "GET") {
      requireSession(ctx);
      return ok(app.voiceEngine.list(ctx.organizationId));
    }

    if (path === "/api/voice/sessions" && method === "POST") {
      requireSession(ctx);
      const body = asObject(request.body);
      const agentId = requireId(body, "agentId");
      const language = body.language === undefined ? undefined : requireLanguage(body, "language");
      return ok(
        app.voiceEngine.createSession({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          agentId,
          testMode: body.testMode === true,
          language,
        }),
        201
      );
    }

    const sessionMatch = path.match(/^\/api\/voice\/sessions\/([A-Za-z0-9_.:-]{4,64})$/);
    if (sessionMatch) {
      requireSession(ctx);
      const sessionId = sessionMatch[1];
      if (method === "GET") return ok(app.voiceEngine.detail({ organizationId: ctx.organizationId, sessionId }));
      return methodNotAllowed(["GET"]);
    }

    const sessionMessagesMatch = path.match(
      /^\/api\/voice\/sessions\/([A-Za-z0-9_.:-]{4,64})\/messages$/
    );
    if (sessionMessagesMatch && method === "POST") {
      requireSession(ctx);
      const body = asObject(request.body);
      return ok(
        app.voiceEngine.processUserInput({
          organizationId: ctx.organizationId,
          sessionId: sessionMessagesMatch[1],
          text: String(body.text ?? ""),
        })
      );
    }

    const sessionEndMatch = path.match(/^\/api\/voice\/sessions\/([A-Za-z0-9_.:-]{4,64})\/end$/);
    if (sessionEndMatch && method === "POST") {
      requireSession(ctx);
      const body = asObject(request.body);
      const outcome = optionalString(body, "outcome", 16);
      return ok(
        app.voiceEngine.endSession({
          organizationId: ctx.organizationId,
          sessionId: sessionEndMatch[1],
          outcome:
            outcome === "failed" ? "failed" : outcome === "stopped" ? "stopped" : "completed",
          reason: optionalString(body, "reason", 80),
        })
      );
    }

    /* ── scripted demo console (public site) ── */
    if (path === "/api/voice/sessions/scripted" && method === "GET") {
      return ok(services.voice.list(ctx.organizationId));
    }

    if (path === "/api/voice/session" && method === "POST") {
      const body = asObject(request.body);
      const language = requireLanguage(body, "language");
      const agentId = optionalString(body, "agentId", 64);
      const session = services.voice.start({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        agentId: agentId ?? undefined,
        language,
      });
      return ok(session, 201);
    }

    if (path === "/api/voice/message" && method === "POST") {
      const body = asObject(request.body);
      const sessionId = requireId(body, "sessionId");
      const utterance = optionalString(body, "utterance", 2000);
      return ok(
        services.voice.message({ organizationId: ctx.organizationId, sessionId, utterance })
      );
    }

    if (path === "/api/voice/end" && method === "POST") {
      const body = asObject(request.body);
      const sessionId = requireId(body, "sessionId");
      return ok(services.voice.end({ organizationId: ctx.organizationId, sessionId }));
    }

    if (path === "/api/voice/messages" && method === "GET") {
      const sessionId = (request.query?.sessionId ?? "").trim();
      if (!sessionId) throw notFound("sessionId query parameter");
      return ok(services.voice.messages(ctx.organizationId, requireId({ sessionId }, "sessionId")));
    }

    /* ── organization resources ── */
    if (path === "/api/organizations" && method === "GET") {
      const org = await db.organizations.get(ctx.organizationId);
      if (!org) throw notFound("Organization");
      return ok(org);
    }

    if (path === "/api/organizations" && method === "PATCH") {
      authorize(ctx, ["owner"]);
      const body = asObject(request.body);
      const updated = await db.organizations.update(ctx.organizationId, {
        ...(body.name !== undefined ? { name: sanitizeName(body.name) } : {}),
        ...(body.status !== undefined ? { status: body.status as "active" | "trial" | "suspended" } : {}),
      });
      if (!updated) throw notFound("Organization");
      return ok(updated);
    }

    if (path === "/api/users" && method === "GET") {
      authorize(ctx, ["owner", "admin", "manager"]);
      const users = await db.users.listByOrg(ctx.organizationId);
      // Deliberately no passwordHash field anywhere in this mapping.
      return ok(users.map(({ email, name, role, id, createdAt }) => ({ id, email, name, role, createdAt })));
    }

    if (path === "/api/agents" && method === "GET") {
      return ok(services.agents.list(ctx.organizationId));
    }

    /** Real, organization-scoped counts for the dashboard — no estimated figures. */
    if (path === "/api/agents/summary" && method === "GET") {
      const list = await services.agents.list(ctx.organizationId);
      return ok({
        organizationId: ctx.organizationId,
        total: list.length,
        active: list.filter((a) => a.status === "active").length,
        draft: list.filter((a) => a.status === "draft").length,
        paused: list.filter((a) => a.status === "paused").length,
        archived: list.filter((a) => a.status === "archived").length,
        source: "agents",
      });
    }

    if (path === "/api/agents" && method === "POST") {
      authorize(ctx, ["owner", "admin", "manager"]);
      const body = asObject(request.body);
      return ok(
        services.agents.create(ctx.organizationId, {
          name: String(body.name ?? ""),
          description: optionalString(body, "description", 500),
          language: optionalString(body, "language", 8),
          industry: optionalString(body, "industry", 40),
          voice: optionalString(body, "voice", 40),
          systemPrompt: optionalString(body, "systemPrompt", 4000),
          welcomeMessage: optionalString(body, "welcomeMessage", 600),
          status: optionalString(body, "status", 16),
        }),
        201
      );
    }

    const agentMatch = path.match(/^\/api\/agents\/([A-Za-z0-9_.:-]{4,64})$/);
    if (agentMatch) {
      const agentId = agentMatch[1];

      if (method === "GET") {
        return ok(services.agents.get(ctx.organizationId, agentId));
      }

      // Full update (PUT) and partial update (PATCH) share one validated path.
      if (method === "PUT" || method === "PATCH") {
        authorize(ctx, ["owner", "admin", "manager"]);
        const body = asObject(request.body);
        return ok(
          services.agents.update(ctx.organizationId, agentId, {
            ...(body.name !== undefined ? { name: String(body.name) } : {}),
            ...(body.description !== undefined ? { description: String(body.description) } : {}),
            ...(body.language !== undefined ? { language: String(body.language) } : {}),
            ...(body.industry !== undefined ? { industry: String(body.industry) } : {}),
            ...(body.voice !== undefined ? { voice: String(body.voice) } : {}),
            ...(body.systemPrompt !== undefined ? { systemPrompt: String(body.systemPrompt) } : {}),
            ...(body.welcomeMessage !== undefined ? { welcomeMessage: String(body.welcomeMessage) } : {}),
            ...(body.status !== undefined ? { status: String(body.status) } : {}),
            // Legacy convenience: { enabled: boolean } maps onto the status enum.
            ...(body.enabled !== undefined ? { status: body.enabled === false ? "paused" : "active" } : {}),
          })
        );
      }

      if (method === "DELETE") {
        authorize(ctx, ["owner", "admin"]);
        return ok(services.agents.remove(ctx.organizationId, agentId));
      }

      return methodNotAllowed(["GET", "PUT", "PATCH", "DELETE"]);
    }

    /* ── real-time control plane: barge-in, telemetry, state, resume ── */
    const turnControlMatch = path.match(
      /^\/api\/voice\/sessions\/([A-Za-z0-9_.:-]{4,64})\/(cancel|telemetry|state)$/
    );
    if (turnControlMatch && method === "POST") {
      requireSession(ctx);
      const sessionId = turnControlMatch[1];
      const action = turnControlMatch[2];
      const body = asObject(request.body);

      if (action === "cancel") {
        return ok(
          app.voiceEngine.cancelTurn({
            organizationId: ctx.organizationId,
            sessionId,
            reason:
              body.reason === "barge_in" || body.reason === "network" ? body.reason : "user_stop",
            telemetry:
              body.telemetry && typeof body.telemetry === "object"
                ? {
                    markers: (body.telemetry as { markers?: Record<string, unknown> }).markers ?? {},
                    turnId:
                      typeof (body.telemetry as { turnId?: unknown }).turnId === "string"
                        ? String((body.telemetry as { turnId: string }).turnId)
                        : undefined,
                  }
                : undefined,
          })
        );
      }

      if (action === "telemetry") {
        return ok(
          app.voiceEngine.recordTelemetry({
            organizationId: ctx.organizationId,
            sessionId,
            turnId: String(body.turnId ?? "unknown"),
            markers: (body.markers ?? {}) as Record<string, number>,
            interrupted: body.interrupted === true,
            streamed: body.streamed === true,
          })
        );
      }

      const nextState = String(body.state ?? "");
      return ok(
        app.voiceEngine.setState({
          organizationId: ctx.organizationId,
          sessionId,
          state: nextState as Parameters<typeof app.voiceEngine.setState>[0]["state"],
        })
      );
    }

    /* ── usage / analytics (metering only) ── */
    if (path === "/api/usage" && method === "GET") {
      const sessionId = (request.query?.sessionId ?? "").trim() || null;
      return ok(services.usage.summary(ctx.organizationId, sessionId));
    }

    if (path === "/api/analytics" && method === "GET") {
      return ok(services.usage.analytics(ctx.organizationId));
    }

    /** Voice metrics computed from persisted rows only; `empty: true` means "nothing to show". */
    if (path === "/api/analytics/voice" && method === "GET") {
      requireSession(ctx);
      return ok(app.voiceEngine.analytics(ctx.organizationId));
    }

    /* ── diagnostics (dev/local only) ── */
    if (path === "/api/config" && method === "GET") {
      return ok({
        ...publicConfigSummary(env),
        requestContext: { organizationId: ctx.organizationId, role: ctx.role, authMode: ctx.authMode },
        schema: { tables: ["organizations", "users", "agents", "voice_sessions", "messages", "usage_events"], sqlProvided: SCHEMA_SQL.length > 0 },
        instanceId: newId("api"),
      });
    }

    throw new ApiError("NOT_FOUND", `No route for ${method} ${path}.`, {
      internal: { method, path },
    });
  }

  async function handleSafe(raw: {
    method: string;
    path: string;
    search?: string;
    headers: Record<string, string>;
    body?: unknown;
    ip?: string;
  }): Promise<ApiResponse> {
    const started = performance.now();
    const requestId = newId("req");
    const path = raw.path.split("?")[0];
    const query = parseQuery(raw.search ?? "");

    try {
      // Credential routes get their own tighter bucket.
      const isAuthRoute = path.startsWith("/api/auth");
      const decision = isAuthRoute
        ? authLimiter.take(raw.ip ?? "local")
        : limiter.take(raw.ip ?? "local");
      if (!decision.allowed) throw rateLimited(Math.ceil(decision.resetInMs / 1000));

      // Identity comes only from the verified session: bearer token → httpOnly cookie →
      // (Demo Mode) the seeded workspace owner. organizationId is then read from the user row.
      const ctx = await authenticate(env, raw.headers, {
        demoOrganizationId: DEMO_ORGANIZATION_ID,
        users: db.users,
        broker: authBroker,
      });
      const response = await handle(
        { method: raw.method, path, query, headers: raw.headers, body: raw.body },
        { ...ctx, requestId }
      );
      log(response.status, started, requestId, path, ctx);
      return response;
    } catch (error) {
      const apiError = toApiError(error, logger, { requestId, path, method: raw.method });
      log(apiError.status, started, requestId, path, undefined);
      return { status: apiError.status, body: apiError.toPublicBody() };
    }
  }

  function log(
    status: number,
    started: number,
    requestId: string,
    path: string,
    ctx: { organizationId: string; userId: string | null } | undefined
  ) {
    logger.info("request", {
      requestId,
      endpoint: path,
      status,
      latencyMs: Math.round((performance.now() - started) * 10) / 10,
      ...(ctx ? { organizationId: ctx.organizationId, userId: ctx.userId ?? undefined } : {}),
    });
  }

  return app;
}

/**
 * Bodies are awaited on the way out, so a forgotten `await` on a repository call resolves into a
 * value instead of serializing a Promise as `{}`. Responses are also marked no-store.
 */
const ok = async (body: unknown, status = 200): Promise<ApiResponse> => ({
  status,
  body: await body,
  headers: { "cache-control": "no-store" },
});

/**
 * Studio runs require an authenticated context. The implicit Demo Mode tenant has no userId, so
 * this still refuses anonymous use — draft-test access can never be reached without a session,
 * and in production a verified token is mandatory.
 */
function requireSession(ctx: RequestContext) {
  if (!ctx.userId) {
    throw new ApiError("UNAUTHENTICATED", "Sign in to run an agent session.");
  }
}

/**
 * Sets the httpOnly session cookie when a cookie jar exists (a real server response), and returns
 * the token in the body only for the in-browser local transport, which keeps it in memory.
 * The password hash is never part of either response.
 */
function authResponse(
  result: Awaited<ReturnType<ReturnType<typeof createAuthService>["register"]>>,
  _ctx: RequestContext,
  app: App,
  request: ApiRequest,
  status: number
): ApiResponse {
  const broker = app.auth;
  const cookieJarAvailable = Boolean(request.headers["host"]);
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (broker && cookieJarAvailable && result.bearerToken) {
    headers["set-cookie"] = broker.serializeCookie(broker, result.bearerToken, app.env.nodeEnv === "production");
  }
  return {
    status,
    body: { session: result.session, ...(cookieJarAvailable ? {} : { bearerToken: result.bearerToken }) },
    headers,
  };
}
const methodNotAllowed = (allow: string[]): ApiResponse => ({
  status: 405,
  body: { error: { code: "METHOD_NOT_ALLOWED", message: `Allowed methods: ${allow.join(", ")}.` } },
  headers: { allow: allow.join(", ") },
});

/* ── non-throwing assembly guards (fail safe, never fail silent) ─────── */

function createStoreQuietly(
  env: ServerEnv,
  logger: Logger,
  primary: (env: ServerEnv) => Db,
  fallback: () => Db
): Db {
  try {
    return primary(env);
  } catch (error) {
    logger.warn("database_repository_unavailable_using_memory_fallback", {
      appMode: env.appMode,
      reason: (error as Error)?.message?.slice(0, 220),
    });
    return fallback();
  }
}

/**
 * A production deployment that cannot build its engine keeps answering in demo mode and reports
 * the problem on /api/health — it does not dial out with empty credentials, and it does not die
 * before it can explain itself.
 */
function resolveEngineQuietly(env: ServerEnv, logger: Logger): VoiceEngine {
  try {
    return resolveEngine(env);
  } catch (error) {
    logger.warn("voice_engine_fallback_to_demo", {
      appMode: env.appMode,
      reason: (error as Error)?.message?.slice(0, 220),
    });
    return resolveEngine({ ...env, appMode: "demo", mode: "demo" });
  }
}

/** Re-exported so adapters can reuse the same env semantics. */
export { resolveEnv, validateStartupConfig };
export type { ServerEnv, StartupConfig };
