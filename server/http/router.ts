/**
 * API router — framework-free.
 * `handleApiRequest` takes a plain { method, path, headers, body } object and returns a plain
 * { status, body }, so the identical route table runs under Node, a serverless function, or the
 * browser's local fallback adapter.
 */

import {
  API_VERSION,
  FEATURES,
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
import { createAgentService, createUsageService, createVoiceService, createEntitlementEngine, seedDefaultPlans, createSaasControlPlaneService, createTenantBrandingService, createWorkspaceBootstrapService, createComplianceService, createDNCService, createReportService, createAuditService, type EntitlementEngine, type SaasControlPlaneService, type TenantBrandingService, type WorkspaceBootstrapService, type ComplianceService, type DNCService, type ReportService, type AuditService } from "../services";
import { createAuthService } from "../services/auth";
import { createVoiceOrchestrator } from "../services/voiceSessions";
import { createConnectorService } from "../services/connectors";
import { createConnectorProviderRegistry, type ConnectorProviderRegistry } from "../connectors/providers/registry";
import {
  createConnectorCredentialStore,
  type ConnectorCredentialStore,
} from "../connectors/credentials";
import { createConnectorSyncEngine } from "../connectors/syncEngine";
import {
  platformProviderControlCenter,
  testTelephonyProvider,
} from "../services/providerControlCenter";
import { NO_SECRETS, type RealtimeSecrets } from "../config/secrets";
import { bearerToken, cookieValue, type AuthBroker } from "./auth/broker";
import type { RealtimeEndRequest, RealtimeSessionDto } from "../../shared/contracts";
import {
  createTelephonyGateway,
  DemoTelephonyProvider,
  createProviderRegistry,
  selectProvider,
  createOrgProviderPolicy,
  type TelephonyGateway,
  type TelephonyProvider,
  type ProviderRegistry,
} from "../telephony";

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
const ALWAYS_PUBLIC = ["/api/health", "/api/voice/capabilities", "/api/public/branding", "/api/config"];

export interface AppServices {
  agents: ReturnType<typeof createAgentService>;
  voice: ReturnType<typeof createVoiceService>;
  usage: ReturnType<typeof createUsageService>;
  realtime: RealtimeServiceLike;
  auth: ReturnType<typeof createAuthService>;
}

export interface App {
  /** Resolves after idempotent commercial seed data has been loaded. */
  ready: Promise<void>;
  env: ServerEnv;
  db: Db;
  logger: Logger;
  engine: VoiceEngine;
  services: AppServices;
  voiceEngine: ReturnType<typeof createVoiceOrchestrator>;
  telephony: TelephonyGateway;
  providerRegistry: ProviderRegistry;
  orgProviderPolicy: ReturnType<typeof createOrgProviderPolicy>;
  limiter: RateLimiter;
  integrations: IntegrationRegistry;
  startup: StartupConfig;
  entitlements: EntitlementEngine;
  saas: SaasControlPlaneService;
  tenantBranding: TenantBrandingService;
  workspaceBootstrap: WorkspaceBootstrapService;
  /** Phase 10C — Governance services */
  compliance: ComplianceService;
  dnc: DNCService;
  reports: ReportService;
  audit: AuditService;
  /** Phase 14 — Enterprise Connector services */
  connectors: ReturnType<typeof createConnectorService>;
  connectorProviderRegistry?: ConnectorProviderRegistry;
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
  /** Server-only telephony providers. Concrete adapters must never enter the browser bundle. */
  telephonyProviders?: TelephonyProvider[];
  /** Production must inject an encrypted external implementation; demo/tests use session memory. */
  connectorCredentialStore?: ConnectorCredentialStore;
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

  // Commercial access is assembled before every feature service so backend execution can fail
  // closed. Built-in plan seeding is idempotent and does not assign real tenants automatically.
  const ready = seedDefaultPlans(db).catch((err) => {
    // Entitlement resolution still fails closed if seeding fails; waiting for this promise prevents
    // a fresh deployment's first request from racing the idempotent seed operation.
    logger.warn("seed_default_plans_failed", { reason: String(err) });
  });
  const entitlements = createEntitlementEngine(db);
  const audit = createAuditService(db);
  const saas = createSaasControlPlaneService({ db, entitlements, audit });
  const tenantBranding = createTenantBrandingService({ db, entitlements, audit });
  const workspaceBootstrap = createWorkspaceBootstrapService(db, entitlements);

  const agents = createAgentService(db);
  const voice = createVoiceService(db, engine, agents, logger, entitlements);
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
    entitlements,
    streamingCapable: options.streamingCapable === true,
  });
  /*
   * The realtime (WebRTC) service is built after the orchestrator so a provider leg reuses the
   * same session creation path: one state machine, one resume rule, one writer of usage rows.
   */
  const realtime = options.realtime
    ? options.realtime({ env, db, logger, agents, voiceEngine })
    : refusingRealtime();

  /*
   * Telephony Gateway: starts with only the DemoTelephonyProvider.
   * In APP_MODE=demo this is the only provider available.
   * In APP_MODE=production, the demo provider is rejected for any real call traffic.
   * Real providers (Twilio, SignalWire, etc.) are registered here by the Node adapter.
   */
  const telephonyProviders: TelephonyProvider[] = [
    new DemoTelephonyProvider(),
    ...(options.telephonyProviders ?? []),
  ];
  
  // Production telephony providers are injected by the server adapter. The universal router is
  // also bundled for the browser demo and must never import Node-only credential/crypto code.
  if (
    env.telephony.configured &&
    env.telephony.activeProvider === "signalwire" &&
    !telephonyProviders.some((provider) => provider.info.id === "signalwire")
  ) {
    logger.warn("signalwire_adapter_not_injected", {
      note: "SignalWire is configured but no server-side provider adapter was injected.",
    });
  }
  
  const telephony = createTelephonyGateway({
    db,
    env,
    logger,
    providers: telephonyProviders,
  });

  /*
   * Provider Registry — manages provider lifecycle states and health.
   * The demo provider is auto-registered; production providers are registered by adapters.
   */
  const providerRegistry = createProviderRegistry();
  providerRegistry.register({
    provider: new DemoTelephonyProvider(),
    credentialsConfigured: true,
    webhookConfigured: false,
    enabled: true,
    isDefault: true,
  });

  /*
   * Organization Provider Policy — per-org telephony provider configuration.
   * Tenant-scoped: organizations can only access their own configurations.
   */
  const orgProviderPolicy = createOrgProviderPolicy(db, logger);

  /* Phase 10C — Governance Services */
  const compliance = createComplianceService(db);
  const dnc = createDNCService(db);
  const reports = createReportService(db);

  /*
   * Phase 14 — Enterprise Connector Services
   */
  const connectorProviderRegistry = createConnectorProviderRegistry(logger);
  const connectorCredentialStore =
    options.connectorCredentialStore ?? createConnectorCredentialStore(env.appMode);
  const connectorSyncEngine = createConnectorSyncEngine(db, connectorProviderRegistry, connectorCredentialStore, logger);
  const connectors = createConnectorService({
    db,
    audit,
    entitlements,
    providerRegistry: connectorProviderRegistry,
    credentialStore: connectorCredentialStore,
    syncEngine: connectorSyncEngine,
    logger,
  });

  const limiter = createRateLimiter(env.rateLimit);
  /** Tighter bucket for credential endpoints — slows guessing without a separate store. */
  const authLimiter = createRateLimiter({
    windowMs: env.rateLimit.windowMs,
    max: Math.max(5, Math.floor(env.rateLimit.max / 6)),
  });

  const app: App = {
    ready,
    env,
    db,
    logger,
    engine,
    services: { agents, voice, usage, realtime, auth },
    voiceEngine,
    telephony,
    providerRegistry,
    orgProviderPolicy,
    entitlements,
    saas,
    tenantBranding,
    workspaceBootstrap,
    compliance,
    dnc,
    reports,
    audit,
    connectors,
    connectorProviderRegistry,
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
    const query = request.query ?? {};
    const searchParams = new URLSearchParams(query);

    /*
     * Production mode with missing credentials: refuse real work, but keep the three
     * diagnostic endpoints answering so operators can see *which* variables are missing.
     */
    if (!startup.ok && !ALWAYS_PUBLIC.includes(path)) throw configInvalid(startup.problems);
    if (!ALWAYS_PUBLIC.includes(path)) await app.ready;

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

    if (path === "/api/public/branding" && method === "GET") {
      // Custom-domain and pre-auth tenant discovery infrastructure does not exist in this build.
      // Never infer a tenant from an unverified Host header or expose authenticated branding here.
      return ok({
        resolution: "not_configured",
        branding: null,
        customDomain: { status: "not_configured", hostname: null },
        loginBranding: { status: "not_configured" },
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
      if (env.appMode === "production") {
        requireSession(ctx);
        await app.entitlements.assertFeature(ctx.organizationId, "voice_calls");
      }
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
      await app.entitlements.assertFeature(ctx.organizationId, "ai_agents");
      await app.entitlements.assertLimit(
        ctx.organizationId,
        "maxAgents",
        (await db.agents.listByOrg(ctx.organizationId)).length
      );
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

    /* ── telephony gateway ── */
    if (path === "/api/telephony/providers" && method === "GET") {
      requirePlatformAdmin(ctx);
      return ok((await platformProviderControlCenter(app.providerRegistry, app.connectors)).telephonyProviders);
    }

    if (path === "/api/telephony/media" && method === "GET") {
      return ok(app.telephony.mediaStatus());
    }

    if (path === "/api/telephony/calls" && method === "GET") {
      requireSession(ctx);
      return ok(app.telephony.listCalls(ctx.organizationId));
    }

    if (path === "/api/telephony/calls" && method === "POST") {
      requireSession(ctx);
      const body = asObject(request.body);
      return ok(
        app.telephony.initiateCall({
          organizationId: ctx.organizationId,
          agentId: requireId(body, "agentId"),
          toNumber: String(body.toNumber ?? ""),
          fromNumber: optionalString(body, "fromNumber", 32),
          language: body.language !== undefined ? requireLanguage(body, "language") : undefined,
          providerId: optionalString(body, "providerId", 32),
        }),
        201
      );
    }

    if (path === "/api/telephony/calls/simulate/inbound" && method === "POST") {
      requireSession(ctx);
      const body = asObject(request.body);
      const failAt = optionalString(body, "failAt", 16);
      return ok(
        app.telephony.simulateInboundCall({
          organizationId: ctx.organizationId,
          agentId: requireId(body, "agentId"),
          fromNumber: optionalString(body, "fromNumber", 32),
          toNumber: optionalString(body, "toNumber", 32),
          failAt: failAt === "ringing" || failAt === "answered" || failAt === "active" ? failAt : undefined,
        })
      );
    }

    if (path === "/api/telephony/calls/simulate/outbound" && method === "POST") {
      requireSession(ctx);
      const body = asObject(request.body);
      return ok(
        app.telephony.simulateOutboundCall({
          organizationId: ctx.organizationId,
          agentId: requireId(body, "agentId"),
          fromNumber: optionalString(body, "fromNumber", 32),
          toNumber: optionalString(body, "toNumber", 32),
        })
      );
    }

    if (path === "/api/telephony/webhook" && method === "POST") {
      const body = asObject(request.body);
      const providerId = optionalString(body, "providerId", 32) ?? "demo";
      const event = body.event as Record<string, unknown>;
      if (!event || typeof event !== "object") throw new ApiError("BAD_REQUEST", "Missing event payload.");
      return ok(
        app.telephony.handleProviderEvent({
          organizationId: ctx.organizationId,
          providerId,
          event: {
            providerEventId: String(event.providerEventId ?? ""),
            eventType: String(event.eventType ?? "call_created") as any,
            providerCallId: String(event.providerCallId ?? ""),
            fromNumber: typeof event.fromNumber === "string" ? event.fromNumber : null,
            toNumber: typeof event.toNumber === "string" ? event.toNumber : null,
            metadata: (typeof event.metadata === "object" && event.metadata ? event.metadata as Record<string, string | number | boolean | null> : {}),
            occurredAt: typeof event.occurredAt === "string" ? event.occurredAt : new Date().toISOString(),
          },
          webhookContext: {
            rawBody: JSON.stringify(body),
            headers: request.headers as Record<string, string>,
            appMode: env.appMode,
          },
        })
      );
    }

    const telephonyCallMatch = path.match(/^\/api\/telephony\/calls\/([A-Za-z0-9_.:-]{4,64})$/);
    if (telephonyCallMatch) {
      requireSession(ctx);
      const callId = telephonyCallMatch[1];
      if (method === "GET") return ok(app.telephony.getCall({ organizationId: ctx.organizationId, callId }));
      if (method === "DELETE") return ok(app.telephony.endCall({ organizationId: ctx.organizationId, callId }));
      return methodNotAllowed(["GET", "DELETE"]);
    }

    const telephonyCallEventsMatch = path.match(/^\/api\/telephony\/calls\/([A-Za-z0-9_.:-]{4,64})\/events$/);
    if (telephonyCallEventsMatch && method === "GET") {
      requireSession(ctx);
      return ok(app.telephony.listCallEvents({ organizationId: ctx.organizationId, callId: telephonyCallEventsMatch[1] }));
    }

    const telephonyCallAssignMatch = path.match(/^\/api\/telephony\/calls\/([A-Za-z0-9_.:-]{4,64})\/assign$/);
    if (telephonyCallAssignMatch && method === "POST") {
      requireSession(ctx);
      const body = asObject(request.body);
      return ok(
        app.telephony.assignAgent({
          organizationId: ctx.organizationId,
          callId: telephonyCallAssignMatch[1],
          agentId: requireId(body, "agentId"),
        })
      );
    }

    const telephonyCallEndMatch = path.match(/^\/api\/telephony\/calls\/([A-Za-z0-9_.:-]{4,64})\/end$/);
    if (telephonyCallEndMatch && method === "POST") {
      requireSession(ctx);
      const body = asObject(request.body);
      return ok(
        app.telephony.endCall({
          organizationId: ctx.organizationId,
          callId: telephonyCallEndMatch[1],
          reason: optionalString(body, "reason", 80),
        })
      );
    }

    /* ── telephony analytics ── */
    if (path === "/api/analytics/calls" && method === "GET") {
      requireSession(ctx);
      return ok(app.telephony.analytics(ctx.organizationId));
    }

    /* ── Phase 13: SignalWire Webhook Routes ── */
    if (path === "/api/telephony/signalwire/webhook" && method === "POST") {
      // SignalWire webhook endpoint - receives call events
      // This endpoint does NOT require authentication (it's called by SignalWire)
      // Instead, we verify the webhook signature
      
      if (!env.telephony.configured || env.telephony.activeProvider !== "signalwire") {
        return ok({ error: "SignalWire provider not configured" }, 400);
      }

      // Get the raw body for signature verification
      const rawBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
      
      // Verify webhook signature
      const signature = request.headers["x-signalwire-signature"];
      if (!signature) {
        logger.warn("signalwire_webhook_missing_signature");
        return ok({ error: "Missing signature" }, 401);
      }

      // Create SignalWire provider instance for verification
      const signalwireProvider = telephonyProviders.find((provider) => provider.info.id === "signalwire") as
        | (typeof telephonyProviders[number] & {
            verifyWebhookSignature(payload: string, headers: Record<string, string>): boolean;
            normalizeWebhookEvent(payload: unknown): import("../telephony").TelephonyEvent | null;
          })
        | undefined;
      if (!signalwireProvider) {
        logger.error("signalwire_provider_not_found");
        return ok({ error: "SignalWire provider not available" }, 500);
      }

      const isValid = signalwireProvider.verifyWebhookSignature(rawBody, request.headers);
      if (!isValid) {
        logger.warn("signalwire_webhook_invalid_signature");
        return ok({ error: "Invalid signature" }, 401);
      }

      // Parse the webhook payload
      const webhookPayload = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
      
      // Normalize the webhook event
      const telephonyEvent = signalwireProvider.normalizeWebhookEvent(webhookPayload);
      if (!telephonyEvent) {
        logger.warn("signalwire_webhook_normalization_failed");
        return ok({ error: "Failed to process webhook event" }, 400);
      }

      // Extract organizationId from custom parameters
      const organizationId = telephonyEvent.metadata?.organizationId as string | undefined;
      if (!organizationId) {
        logger.warn("signalwire_webhook_missing_organization_id");
        return ok({ error: "Missing organization ID" }, 400);
      }

      // Process the event through the gateway
      try {
        const result = await app.telephony.handleProviderEvent({
          organizationId,
          providerId: "signalwire",
          event: telephonyEvent,
          webhookContext: {
            rawBody,
            headers: request.headers as Record<string, string>,
            appMode: env.appMode,
          },
        });

        return ok({
          success: true,
          callId: result.call.id,
          status: result.call.status,
          duplicate: result.duplicate,
        });
      } catch (error) {
        logger.error("signalwire_webhook_processing_error", {
          error: error instanceof Error ? error.message : String(error),
          providerEventId: telephonyEvent.providerEventId,
        });
        return ok({ error: "Failed to process webhook event" }, 500);
      }
    }

    if (path === "/api/telephony/signalwire/laml" && method === "POST") {
      // SignalWire LaML webhook endpoint - returns call control instructions
      // This is called by SignalWire when a call is initiated to get instructions
      
      if (!env.telephony.configured || env.telephony.activeProvider !== "signalwire") {
        return ok({ error: "SignalWire provider not configured" }, 400);
      }

      // For Phase 13, we return a simple LaML response that connects to the voice engine
      // In production, this would be more sophisticated with AI agent routing
      const callSid = request.body?.CallSid;
      const from = request.body?.From;
      const to = request.body?.To;

      logger.info("signalwire_laml_request", {
        callSid,
        from,
        to,
      });

      // Return LaML XML that tells SignalWire to connect to our voice webhook
      const voiceWebhookUrl = `${env.appUrl}/api/telephony/signalwire/voice`;
      const laxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${voiceWebhookUrl}" />
  </Connect>
</Response>`;

      return {
        status: 200,
        body: laxml,
        headers: { "Content-Type": "application/xml" },
      };
    }

    if (path === "/api/telephony/signalwire/voice" && method === "POST") {
      // SignalWire voice media stream handler
      // This receives the actual audio stream from SignalWire
      
      if (!env.telephony.configured || env.telephony.activeProvider !== "signalwire") {
        return ok({ error: "SignalWire provider not configured" }, 400);
      }

      // For Phase 13, we log the media stream connection but don't process audio
      // The voice engine will handle this in a future phase
      const streamSid = request.body?.streamSid;
      const event = request.body?.event;

      logger.info("signalwire_voice_stream", {
        streamSid,
        event,
        note: "Phase 13 - Media streaming not yet implemented",
      });

      return ok({ received: true });
    }

    /* ── platform provider registry ── */
    if (path === "/api/telephony/registry" && method === "GET") {
      requirePlatformAdmin(ctx);
      return ok((await platformProviderControlCenter(app.providerRegistry, app.connectors)).telephonyProviders);
    }

    if (path === "/api/telephony/registry/health" && method === "GET") {
      requirePlatformAdmin(ctx);
      const results = await Promise.all(
        app.providerRegistry.list().map((entry) =>
          testTelephonyProvider(app.providerRegistry, entry.providerId, logger)
        )
      );
      return ok(results.filter(Boolean));
    }

    if (path === "/api/telephony/registry/summary" && method === "GET") {
      requirePlatformAdmin(ctx);
      const registry = await platformProviderControlCenter(app.providerRegistry, app.connectors);
      return ok({
        ...registry,
        environment: env.appMode,
        canMakeProductionCalls: app.providerRegistry.hasProductionProvider(),
      });
    }

    if (path === "/api/telephony/registry/selection" && method === "POST") {
      requirePlatformAdmin(ctx);
      const body = asObject(request.body);
      const outcome = selectProvider(
        {
          requestedProviderId: optionalString(body, "providerId", 32),
          direction: (body.direction === "inbound" || body.direction === "outbound") ? body.direction as "inbound" | "outbound" : undefined,
          requiredCapability: typeof body.requiredCapability === "string" ? body.requiredCapability as any : undefined,
          appMode: env.appMode,
        },
        app.providerRegistry,
        logger
      );
      const providers = (await platformProviderControlCenter(app.providerRegistry, app.connectors)).telephonyProviders;
      return ok({
        providerId: outcome.providerId,
        selected: outcome.selected,
        selectionMethod: outcome.selectionMethod,
        status: outcome.providerId
          ? providers.find((provider) => provider.id === outcome.providerId)?.status ?? "UNKNOWN"
          : "UNAVAILABLE",
      });
    }

    /* ── organization provider policy (Phase 8A) ── */
    if (path === "/api/telephony/organizations/providers" && method === "GET") {
      requireSession(ctx);
      const [rows, control] = await Promise.all([
        app.orgProviderPolicy.list(ctx.organizationId),
        platformProviderControlCenter(app.providerRegistry, app.connectors),
      ]);
      return ok(rows.map((row) => ({
        ...row,
        status: row.enabled
          ? control.telephonyProviders.find((provider) => provider.id === row.provider)?.status ?? "UNAVAILABLE"
          : "UNAVAILABLE",
      })));
    }

    if (path === "/api/telephony/organizations/providers" && method === "POST") {
      requireTenantConnectorAdmin(ctx);
      const body = asObject(request.body);
      const providerId = sanitizeText(body.provider, 64);
      if (!app.providerRegistry.get(providerId)) {
        throw new ApiError("BAD_REQUEST", "Telephony provider is not registered by the platform.");
      }
      const existing = await db.orgProviders.findByOrgAndProvider(ctx.organizationId, providerId);
      const row = await app.orgProviderPolicy.upsert({
        organizationId: ctx.organizationId,
        provider: providerId,
        enabled: body.enabled !== false,
        isDefault: body.isDefault === true,
        // Platform provider configuration is never accepted through a tenant route.
        configurationReference: null,
      });
      await audit.record({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "PROVIDER_POLICY_CHANGED",
        metadata: { providerId, lifecycle: existing ? "updated" : "created" },
      });
      const control = await platformProviderControlCenter(app.providerRegistry, app.connectors);
      return ok({
        ...row,
        status: row.enabled
          ? control.telephonyProviders.find((provider) => provider.id === row.provider)?.status ?? "UNAVAILABLE"
          : "UNAVAILABLE",
      }, 201);
    }

    if (path === "/api/telephony/organizations/providers/default" && method === "GET") {
      requireSession(ctx);
      const row = await app.orgProviderPolicy.getDefault(ctx.organizationId);
      if (!row) return ok(null);
      const control = await platformProviderControlCenter(app.providerRegistry, app.connectors);
      return ok({
        ...row,
        status: row.enabled
          ? control.telephonyProviders.find((provider) => provider.id === row.provider)?.status ?? "UNAVAILABLE"
          : "UNAVAILABLE",
      });
    }

    const orgProviderMatch = path.match(/^\/api\/telephony\/organizations\/providers\/([A-Za-z0-9_.:-]{4,64})$/);
    if (orgProviderMatch) {
      requireSession(ctx);
      const providerConfigId = orgProviderMatch[1];
      if (method === "GET") {
        const row = await app.orgProviderPolicy.get(ctx.organizationId, providerConfigId);
        const control = await platformProviderControlCenter(app.providerRegistry, app.connectors);
        return ok({
          ...row,
          status: row.enabled
            ? control.telephonyProviders.find((provider) => provider.id === row.provider)?.status ?? "UNAVAILABLE"
            : "UNAVAILABLE",
        });
      }
      if (method === "DELETE") {
        requireTenantConnectorAdmin(ctx);
        const row = await app.orgProviderPolicy.get(ctx.organizationId, providerConfigId);
        const deleted = await app.orgProviderPolicy.remove(ctx.organizationId, providerConfigId);
        if (deleted) {
          await audit.record({
            organizationId: ctx.organizationId,
            actorId: ctx.userId,
            action: "PROVIDER_POLICY_CHANGED",
            metadata: { providerId: row.provider, lifecycle: "disabled" },
          });
        }
        return ok({ deleted });
      }
      if (method === "PATCH") {
        requireTenantConnectorAdmin(ctx);
        const body = asObject(request.body);
        if (body.isDefault === true) {
          const row = await app.orgProviderPolicy.setDefault(ctx.organizationId, providerConfigId);
          await audit.record({
            organizationId: ctx.organizationId,
            actorId: ctx.userId,
            action: "PROVIDER_POLICY_CHANGED",
            metadata: { providerId: row.provider, lifecycle: "updated", isDefault: true },
          });
          const control = await platformProviderControlCenter(app.providerRegistry, app.connectors);
          return ok({
            ...row,
            status: row.enabled
              ? control.telephonyProviders.find((provider) => provider.id === row.provider)?.status ?? "UNAVAILABLE"
              : "UNAVAILABLE",
          });
        }
        return methodNotAllowed(["GET", "DELETE", "PATCH (set isDefault:true)"]);
      }
      return methodNotAllowed(["GET", "DELETE", "PATCH"]);
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

    /* ── Phase 10A — Workspace Bootstrap API ── */
    if (path === "/api/workspace/bootstrap" && method === "GET") {
      requireSession(ctx);
      const org = await db.organizations.get(ctx.organizationId);
      if (!org) throw notFound("Organization");
      const user = ctx.userId ? await db.users.get(ctx.userId) : null;
      if (!user) throw notFound("User");
      if (user.organizationId !== org.id) {
        throw new ApiError("FORBIDDEN", "Authenticated organization mismatch.");
      }
      return ok(await app.workspaceBootstrap.getBootstrap(user, org));
    }

    /* ── Authenticated tenant branding ── */
    if (path === "/api/workspace/branding" && method === "GET") {
      requireSession(ctx);
      const user = ctx.userId ? await db.users.get(ctx.userId) : undefined;
      if (!user || user.organizationId !== ctx.organizationId) {
        throw new ApiError("FORBIDDEN", "Authenticated organization mismatch.");
      }
      return ok(app.tenantBranding.getForOrganization(ctx.organizationId));
    }

    if (path === "/api/workspace/branding" && (method === "PATCH" || method === "PUT")) {
      authorize(ctx, ["owner", "admin"]);
      const actor = ctx.userId ? await db.users.get(ctx.userId) : undefined;
      if (!actor || actor.organizationId !== ctx.organizationId) {
        throw new ApiError("FORBIDDEN", "Authenticated organization mismatch.");
      }
      return ok(app.tenantBranding.updateForOrganization(ctx.organizationId, request.body, {
        id: ctx.userId,
        email: actor.email,
      }));
    }

    /* ── Phase 10A — Entitlements API ── */
    if (path === "/api/entitlements" && method === "GET") {
      requireSession(ctx);
      const [features, capabilities, limits, subscription] = await Promise.all([
        app.entitlements.getEnabledFeatures(ctx.organizationId),
        app.entitlements.getCapabilities(ctx.organizationId),
        app.entitlements.getEffectiveLimits(ctx.organizationId),
        app.entitlements.getSubscription(ctx.organizationId),
      ]);
      return ok({
        features,
        capabilities,
        limits,
        subscription: subscription
          ? { id: subscription.id, status: subscription.status, planId: subscription.plan.id, planName: subscription.plan.name }
          : null,
      });
    }

    if (path === "/api/entitlements/check" && method === "POST") {
      requireSession(ctx);
      const body = asObject(request.body);
      const feature = String(body.feature ?? "");
      if (!(FEATURES as readonly string[]).includes(feature)) {
        throw new ApiError("VALIDATION_ERROR", "Unknown entitlement feature.");
      }
      const has = await app.entitlements.hasFeature(ctx.organizationId, feature as any);
      return ok({ feature, enabled: has });
    }

    if (path === "/api/tenant/subscription" && method === "GET") {
      requireSession(ctx);
      return ok(app.saas.getTenantSummary(ctx.organizationId));
    }

    /* ── Phase 10B — Workspace Operational APIs ── */
    if (path === "/api/workspace/overview" && method === "GET") {
      requireSession(ctx);
      const orgId = ctx.organizationId;
      
      // Fetch all data in parallel
      const [agents, sessions, calls, usage, entitlements, limits] = await Promise.all([
        db.agents.listByOrg(orgId),
        db.sessions.listByOrg(orgId),
        db.calls.listByOrg(orgId),
        db.usage.summarize(orgId),
        app.entitlements.getEnabledFeatures(orgId),
        app.entitlements.getEffectiveLimits(orgId),
      ]);

      // Calculate metrics
      const activeSessions = sessions.filter((s) => s.status === "active");
      const completedSessions = sessions.filter((s) => s.status === "completed");
      const failedSessions = sessions.filter((s) => s.status === "failed");
      
      const inboundCalls = calls.filter((c) => c.direction === "inbound");
      const outboundCalls = calls.filter((c) => c.direction === "outbound");
      const completedCalls = calls.filter((c) => c.status === "completed");
      const failedCalls = calls.filter((c) => c.status === "failed");
      
      // Calculate durations
      const completedSessionDurations = completedSessions
        .map((s) => s.durationSeconds)
        .filter((d): d is number => d !== null);
      const avgSessionDuration = completedSessionDurations.length > 0
        ? completedSessionDurations.reduce((sum, d) => sum + d, 0) / completedSessionDurations.length
        : null;

      const completedCallDurations = completedCalls
        .map((c) => c.durationSeconds)
        .filter((d): d is number => d !== null);
      const avgCallDuration = completedCallDurations.length > 0
        ? completedCallDurations.reduce((sum, d) => sum + d, 0) / completedCallDurations.length
        : null;

      return ok({
        organizationId: orgId,
        voice: {
          totalSessions: sessions.length,
          activeSessions: activeSessions.length,
          completedSessions: completedSessions.length,
          failedSessions: failedSessions.length,
          avgSessionDuration,
          inboundCalls: inboundCalls.length,
          outboundCalls: outboundCalls.length,
          completedCalls: completedCalls.length,
          failedCalls: failedCalls.length,
          avgCallDuration,
        },
        agents: {
          total: agents.length,
          active: agents.filter((a) => a.status === "active").length,
          paused: agents.filter((a) => a.status === "paused").length,
          draft: agents.filter((a) => a.status === "draft").length,
        },
        usage: {
          totalEvents: usage.sessions + usage.messages + usage.aiRequests,
          voiceSessions: usage.sessions,
          messages: usage.messages,
          aiRequests: usage.aiRequests,
          characters: usage.characters,
          audioSeconds: usage.audioSeconds,
        },
        limits,
        entitlements,
      });
    }

    if (path === "/api/workspace/calls" && method === "GET") {
      requireSession(ctx);
      const calls = await db.calls.listByOrg(ctx.organizationId);
      
      // Enrich with agent names
      const agents = await db.agents.listByOrg(ctx.organizationId);
      const agentMap = new Map(agents.map((a) => [a.id, a.name]));
      
      return ok(calls.map((c) => ({
        ...c,
        agentName: c.agentId ? agentMap.get(c.agentId) || null : null,
      })));
    }

    const workspaceCallMatch = path.match(/^\/api\/workspace\/calls\/([A-Za-z0-9_.:-]{4,64})$/);
    if (workspaceCallMatch && method === "GET") {
      requireSession(ctx);
      const callId = workspaceCallMatch[1];
      const call = await db.calls.get(callId, ctx.organizationId);
      if (!call) throw notFound("Call");

      // Get related data
      const [events, messages, agents] = await Promise.all([
        db.callEvents.listByCall(callId),
        call.voiceSessionId ? db.messages.listBySession(call.voiceSessionId, ctx.organizationId) : Promise.resolve([]),
        db.agents.listByOrg(ctx.organizationId),
      ]);

      const agent = call.agentId ? agents.find((a) => a.id === call.agentId) : null;

      return ok({
        call: {
          ...call,
          agentName: agent?.name || null,
        },
        events,
        messages,
      });
    }

    if (path === "/api/workspace/agents/performance" && method === "GET") {
      requireSession(ctx);
      const orgId = ctx.organizationId;
      const agents = await db.agents.listByOrg(orgId);
      const sessions = await db.sessions.listByOrg(orgId);

      // Calculate performance per agent
      const performance = agents.map((agent) => {
        const agentSessions = sessions.filter((s) => s.agentId === agent.id);
        const completed = agentSessions.filter((s) => s.status === "completed");
        const failed = agentSessions.filter((s) => s.status === "failed");
        
        const durations = completed
          .map((s) => s.durationSeconds)
          .filter((d): d is number => d !== null);
        const avgDuration = durations.length > 0
          ? durations.reduce((sum, d) => sum + d, 0) / durations.length
          : null;

        return {
          agentId: agent.id,
          agentName: agent.name,
          status: agent.status,
          totalSessions: agentSessions.length,
          completedSessions: completed.length,
          failedSessions: failed.length,
          completionRate: agentSessions.length > 0
            ? (completed.length / agentSessions.length) * 100
            : 0,
          avgDurationSeconds: avgDuration,
        };
      });

      return ok(performance);
    }

    if (path === "/api/workspace/analytics" && method === "GET") {
      requireSession(ctx);
      const orgId = ctx.organizationId;
      
      const [sessions, calls, usage, agents] = await Promise.all([
        db.sessions.listByOrg(orgId),
        db.calls.listByOrg(orgId),
        db.usage.summarize(orgId),
        db.agents.listByOrg(orgId),
      ]);

      // Session analytics
      const sessionsByStatus: Record<string, number> = {};
      sessions.forEach((s) => {
        sessionsByStatus[s.status] = (sessionsByStatus[s.status] || 0) + 1;
      });

      // Session duration distribution
      const completedSessions = sessions.filter((s) => s.status === "completed" && s.durationSeconds);
      const sessionDurations = completedSessions.map((s) => s.durationSeconds!).sort((a, b) => a - b);
      const avgDuration = sessionDurations.length > 0
        ? sessionDurations.reduce((sum, d) => sum + d, 0) / sessionDurations.length
        : 0;

      // Call analytics
      const callsByDirection: Record<string, number> = {};
      calls.forEach((c) => {
        callsByDirection[c.direction] = (callsByDirection[c.direction] || 0) + 1;
      });

      // Agent performance
      const agentPerformance = agents.map((agent) => {
        const agentSessions = sessions.filter((s) => s.agentId === agent.id);
        const completed = agentSessions.filter((s) => s.status === "completed");
        return {
          agentId: agent.id,
          agentName: agent.name,
          totalSessions: agentSessions.length,
          completedSessions: completed.length,
          completionRate: agentSessions.length > 0
            ? (completed.length / agentSessions.length) * 100
            : 0,
        };
      });

      return ok({
        sessions: {
          total: sessions.length,
          byStatus: sessionsByStatus,
          avgDurationSeconds: avgDuration,
          durationDistribution: sessionDurations,
        },
        calls: {
          total: calls.length,
          byDirection: callsByDirection,
        },
        usage: {
          voiceSessions: usage.sessions,
          messages: usage.messages,
          aiRequests: usage.aiRequests,
          characters: usage.characters,
          audioSeconds: usage.audioSeconds,
        },
        agents: agentPerformance,
      });
    }

    /* ── Phase 10B — Campaign APIs ── */
    if (path === "/api/workspace/campaigns" && method === "GET") {
      requireSession(ctx);
      const campaigns = await db.campaigns.listByOrg(ctx.organizationId);
      const agents = await db.agents.listByOrg(ctx.organizationId);
      const agentMap = new Map(agents.map((a) => [a.id, a.name]));

      return ok(campaigns.map((c) => ({
        ...c,
        agentName: c.agentId ? agentMap.get(c.agentId) || null : null,
      })));
    }

    if (path === "/api/workspace/campaigns" && method === "POST") {
      requireSession(ctx);
      const body = asObject(request.body);
      
      const name = optionalString(body, "name", 120);
      if (!name) throw new ApiError("BAD_REQUEST", "Campaign name is required");

      const campaign = await db.campaigns.create({
        organizationId: ctx.organizationId,
        name,
        description: optionalString(body, "description", 500) || "",
        agentId: optionalString(body, "agentId", 64) || null,
        status: "draft",
        direction: (body.direction === "INBOUND" || body.direction === "OUTBOUND") 
          ? body.direction 
          : "OUTBOUND",
        scheduledAt: typeof body.scheduledAt === "string" ? body.scheduledAt : null,
        startedAt: null,
        completedAt: null,
        totalContacts: typeof body.totalContacts === "number" ? body.totalContacts : 0,
        configuration: typeof body.configuration === "object" && body.configuration !== null
          ? body.configuration as Record<string, string | number | boolean | null>
          : {},
      });

      return ok(campaign, 201);
    }

    const workspaceCampaignMatch = path.match(/^\/api\/workspace\/campaigns\/([A-Za-z0-9_.:-]{4,64})$/);
    if (workspaceCampaignMatch) {
      requireSession(ctx);
      const campaignId = workspaceCampaignMatch[1];
      
      if (method === "GET") {
        const campaign = await db.campaigns.get(campaignId, ctx.organizationId);
        if (!campaign) throw notFound("Campaign");
        
        const agents = await db.agents.listByOrg(ctx.organizationId);
        const agent = campaign.agentId ? agents.find((a) => a.id === campaign.agentId) : null;
        
        return ok({
          ...campaign,
          agentName: agent?.name || null,
        });
      }

      if (method === "PATCH") {
        const body = asObject(request.body);
        const patch: any = {};

        if (body.name !== undefined) patch.name = optionalString(body, "name", 120);
        if (body.description !== undefined) patch.description = optionalString(body, "description", 500);
        if (body.agentId !== undefined) patch.agentId = optionalString(body, "agentId", 64);
        if (body.status !== undefined) {
          const validStatuses = ["draft", "scheduled", "running", "paused", "completed", "cancelled", "failed"];
          if (!validStatuses.includes(body.status as string)) {
            throw new ApiError("BAD_REQUEST", "Invalid campaign status");
          }
          patch.status = body.status as any;
          
          // Auto-set timestamps based on status
          if (body.status === "running" && !patch.startedAt) {
            patch.startedAt = new Date().toISOString();
          }
          if ((body.status === "completed" || body.status === "cancelled") && !patch.completedAt) {
            patch.completedAt = new Date().toISOString();
          }
        }
        if (body.scheduledAt !== undefined) {
          patch.scheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt : null;
        }
        if (body.totalContacts !== undefined) {
          patch.totalContacts = typeof body.totalContacts === "number" ? body.totalContacts : 0;
        }

        const updated = await db.campaigns.update(campaignId, ctx.organizationId, patch);
        if (!updated) throw notFound("Campaign");
        return ok(updated);
      }

      if (method === "DELETE") {
        const deleted = await db.campaigns.delete(campaignId, ctx.organizationId);
        if (!deleted) throw notFound("Campaign");
        return ok({ deleted: true });
      }

      return methodNotAllowed(["GET", "PATCH", "DELETE"]);
    }

    if (path === "/api/workspace/live" && method === "GET") {
      requireSession(ctx);
      const sessions = await db.sessions.listByOrg(ctx.organizationId);
      const activeSessions = sessions.filter((s) => s.status === "active");
      
      const agents = await db.agents.listByOrg(ctx.organizationId);
      const agentMap = new Map(agents.map((a) => [a.id, a.name]));

      return ok(activeSessions.map((s) => ({
        ...s,
        agentName: agentMap.get(s.agentId) || null,
      })));
    }

    /* ── Phase 11 — Contact Center Operations APIs ── */
    if (path === "/api/workspace/operations/overview" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "contact_center_operations"))) {
        throw new ApiError("FORBIDDEN", "Contact Center Operations feature not enabled.");
      }
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const orgId = ctx.organizationId;

      const [calls, sessions, campaigns, agents] = await Promise.all([
        db.calls.listByOrg(orgId),
        db.sessions.listByOrg(orgId),
        db.campaigns.listByOrg(orgId),
        db.agents.listByOrg(orgId),
      ]);

      const callsToday = calls.filter((c) => c.startedAt >= todayStart);
      const activeCalls = calls.filter((c) => ["created", "ringing", "answered", "active"].includes(c.status));
      const inboundToday = callsToday.filter((c) => c.direction === "inbound");
      const outboundToday = callsToday.filter((c) => c.direction === "outbound");
      const activeCampaigns = campaigns.filter((c) => c.status === "running" || c.status === "scheduled");
      const availableAgents = agents.filter((a) => a.status === "active");

      const completedCalls = calls.filter((c) => c.status === "completed" && c.durationSeconds !== null);
      const averageCallDurationSeconds = completedCalls.length > 0
        ? Math.round(completedCalls.reduce((sum, c) => sum + (c.durationSeconds || 0), 0) / completedCalls.length)
        : null;
      const completionRate = calls.length > 0
        ? Math.round((calls.filter((c) => c.status === "completed").length / calls.length) * 100)
        : null;

      return ok({
        organizationId: orgId,
        activeCalls: activeCalls.length,
        callsToday: callsToday.length,
        inboundCallsToday: inboundToday.length,
        outboundCallsToday: outboundToday.length,
        activeCampaigns: activeCampaigns.length,
        availableAgents: availableAgents.length,
        averageCallDurationSeconds,
        completionRate,
        empty: calls.length === 0 && campaigns.length === 0,
      });
    }

    if (path === "/api/workspace/operations/live" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "contact_center_operations"))) {
        throw new ApiError("FORBIDDEN", "Contact Center Operations feature not enabled.");
      }
      const orgId = ctx.organizationId;
      const sessions = await db.sessions.listByOrg(orgId);
      const activeSessions = sessions.filter((s) => s.status === "active" || s.status === "created");
      const calls = await db.calls.listByOrg(orgId);
      const campaigns = await db.campaigns.listByOrg(orgId);
      const agents = await db.agents.listByOrg(orgId);
      const agentMap = new Map(agents.map((a) => [a.id, a.name]));

      const liveCalls = activeSessions.map((session) => {
        const relatedCall = calls.find((c) => c.voiceSessionId === session.id);
        return {
          sessionId: session.id,
          organizationId: session.organizationId,
          direction: relatedCall?.direction ?? null,
          callId: relatedCall?.id ?? null,
          agentId: session.agentId,
          agentName: agentMap.get(session.agentId) || session.agentId,
          status: session.status,
          callStatus: relatedCall?.status ?? null,
          durationSeconds: session.durationSeconds,
          startedAt: session.startedAt,
          provider: relatedCall?.provider ?? null,
          campaignId: null,
          campaignName: null,
        };
      });

      return ok(liveCalls);
    }

    const opsLiveMatch = path.match(/^\/api\/workspace\/operations\/live\/([A-Za-z0-9_.:-]{4,64})$/);
    if (opsLiveMatch && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "contact_center_operations"))) {
        throw new ApiError("FORBIDDEN", "Contact Center Operations feature not enabled.");
      }
      const orgId = ctx.organizationId;
      const sessionId = opsLiveMatch[1];
      const session = await db.sessions.get(sessionId, orgId);
      if (!session) throw notFound("Voice session");

      const calls = await db.calls.listByOrg(orgId);
      const relatedCall = calls.find((c) => c.voiceSessionId === sessionId);
      const campaigns = await db.campaigns.listByOrg(orgId);
      const agents = await db.agents.listByOrg(orgId);
      const agent = agents.find((a) => a.id === session.agentId);
      const messages = await db.messages.listBySession(sessionId, orgId);

      return ok({
        sessionId: session.id,
        organizationId: session.organizationId,
        direction: relatedCall?.direction ?? null,
        callId: relatedCall?.id ?? null,
        agentId: session.agentId,
        agentName: agent?.name || session.agentId,
        status: session.status,
        callStatus: relatedCall?.status ?? null,
        provider: relatedCall?.provider ?? null,
        durationSeconds: session.durationSeconds,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        language: session.language,
        mode: session.mode,
        campaignId: null,
        campaignName: null,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
        controls: {
          canEnd: session.status === "active" || session.status === "created",
          canTransfer: false,
          canHold: false,
          canMute: false,
          canBarge: false,
          canWhisper: false,
        },
      });
    }

    const opsLiveEndMatch = path.match(/^\/api\/workspace\/operations\/live\/([A-Za-z0-9_.:-]{4,64})\/end$/);
    if (opsLiveEndMatch && method === "POST") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "contact_center_operations"))) {
        throw new ApiError("FORBIDDEN", "Contact Center Operations feature not enabled.");
      }
      authorize(ctx, ["owner", "admin", "manager"]);
      const orgId = ctx.organizationId;
      const sessionId = opsLiveEndMatch[1];
      const session = await db.sessions.get(sessionId, orgId);
      if (!session) throw notFound("Voice session");
      if (session.status !== "active" && session.status !== "created") {
        throw new ApiError("BAD_REQUEST", "Session is not active.");
      }
      await db.sessions.patch(sessionId, orgId, {
        status: "completed",
        endedAt: new Date().toISOString(),
        durationSeconds: Math.max(0, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000)),
      });
      await audit.record({
        organizationId: orgId,
        action: "CALL_ENDED_BY_SUPERVISOR",
        actorId: ctx.userId,
        metadata: { sessionId },
      });
      return ok({ ended: true, sessionId });
    }

    if (path === "/api/workspace/operations/campaigns" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "contact_center_operations"))) {
        throw new ApiError("FORBIDDEN", "Contact Center Operations feature not enabled.");
      }
      const campaigns = await db.campaigns.listByOrg(ctx.organizationId);
      const agents = await db.agents.listByOrg(ctx.organizationId);
      const agentMap = new Map(agents.map((a) => [a.id, a.name]));
      return ok(campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        agentName: c.agentId ? agentMap.get(c.agentId) || null : null,
        direction: c.direction,
        totalContacts: c.totalContacts,
        processedContacts: c.processedContacts,
        completedCalls: c.completedCalls,
        failedCalls: c.failedCalls,
        pendingContacts: c.totalContacts - c.processedContacts,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })));
    }

    const opsCampaignMatch = path.match(/^\/api\/workspace\/operations\/campaigns\/([A-Za-z0-9_.:-]{4,64})$/);
    if (opsCampaignMatch && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "contact_center_operations"))) {
        throw new ApiError("FORBIDDEN", "Contact Center Operations feature not enabled.");
      }
      const campaignId = opsCampaignMatch[1];
      const campaign = await db.campaigns.get(campaignId, ctx.organizationId);
      if (!campaign) throw notFound("Campaign");
      const agents = await db.agents.listByOrg(ctx.organizationId);
      const agent = campaign.agentId ? agents.find((a) => a.id === campaign.agentId) : null;
      const statusCounts = await db.campaignContacts.countByStatus(ctx.organizationId, campaignId);
      const outcomeCounts = await db.campaignContacts.countByOutcome(ctx.organizationId, campaignId);

      return ok({
        id: campaign.id,
        organizationId: campaign.organizationId,
        name: campaign.name,
        description: campaign.description,
        status: campaign.status,
        agentId: campaign.agentId,
        agentName: agent?.name || null,
        direction: campaign.direction,
        totalContacts: campaign.totalContacts,
        processedContacts: campaign.processedContacts,
        completedCalls: campaign.completedCalls,
        failedCalls: campaign.failedCalls,
        pendingContacts: campaign.totalContacts - campaign.processedContacts,
        scheduledAt: campaign.scheduledAt,
        startedAt: campaign.startedAt,
        completedAt: campaign.completedAt,
        contactQueue: {
          pending: statusCounts["PENDING"] || 0,
          queued: statusCounts["QUEUED"] || 0,
          processing: statusCounts["PROCESSING"] || 0,
          completed: statusCounts["COMPLETED"] || 0,
          failed: statusCounts["FAILED"] || 0,
          skipped: statusCounts["SKIPPED"] || 0,
        },
        outcomes: outcomeCounts,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      });
    }

    const opsCampaignContactsMatch = path.match(/^\/api\/workspace\/operations\/campaigns\/([A-Za-z0-9_.:-]{4,64})\/contacts$/);
    if (opsCampaignContactsMatch && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "contact_center_operations"))) {
        throw new ApiError("FORBIDDEN", "Contact Center Operations feature not enabled.");
      }
      const campaignId = opsCampaignContactsMatch[1];
      const campaign = await db.campaigns.get(campaignId, ctx.organizationId);
      if (!campaign) throw notFound("Campaign");
      const statusFilter = query.status as any;
      const validStatuses = ["PENDING", "QUEUED", "PROCESSING", "COMPLETED", "FAILED", "SKIPPED"];
      const contacts = await db.campaignContacts.listByCampaign(
        ctx.organizationId,
        campaignId,
        validStatuses.includes(statusFilter) ? statusFilter : undefined
      );
      return ok(contacts.map((c) => ({
        id: c.id,
        campaignId: c.campaignId,
        customerRef: c.customerRef,
        phoneNumber: c.phoneNumber,
        displayName: c.displayName,
        status: c.status,
        callOutcome: c.callOutcome,
        callId: c.callId,
        voiceSessionId: c.voiceSessionId,
        queuedAt: c.queuedAt,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        attempts: c.attempts,
      })));
    }

    if (path === "/api/workspace/operations/supervisor" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "contact_center_operations"))) {
        throw new ApiError("FORBIDDEN", "Contact Center Operations feature not enabled.");
      }
      const orgId = ctx.organizationId;
      const [calls, sessions, campaigns, agents, alerts] = await Promise.all([
        db.calls.listByOrg(orgId),
        db.sessions.listByOrg(orgId),
        db.campaigns.listByOrg(orgId),
        db.agents.listByOrg(orgId),
        db.operationalAlerts.listByOrg(orgId, true),
      ]);

      const activeCalls = calls.filter((c) => ["created", "ringing", "answered", "active"].includes(c.status));
      const activeSessions = sessions.filter((s) => s.status === "active" || s.status === "created");
      const activeCampaigns = campaigns.filter((c) => c.status === "running");
      const availableAgents = agents.filter((a) => a.status === "active");
      const busyAgentIds = new Set(activeSessions.map((s) => s.agentId));
      const busyAgents = agents.filter((a) => busyAgentIds.has(a.id)).length;
      const offlineAgents = agents.filter((a) => a.status === "paused" || a.status === "archived").length;

      let callsInQueue = 0;
      for (const c of activeCampaigns) {
        callsInQueue += await db.campaignContacts.count(orgId, c.id, "QUEUED");
      }

      const recentFailures: any[] = [];
      const failedCalls = calls.filter((c) => c.status === "failed").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
      for (const call of failedCalls) {
        recentFailures.push({ id: call.id, type: "call", message: `Call failed: ${call.direction}`, timestamp: call.updatedAt });
      }
      const failedCampaigns = campaigns.filter((c) => c.status === "failed").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
      for (const camp of failedCampaigns) {
        recentFailures.push({ id: camp.id, type: "campaign", message: `Campaign failed: ${camp.name}`, timestamp: camp.updatedAt });
      }
      recentFailures.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return ok({
        organizationId: orgId,
        activeCalls: activeCalls.length,
        callsInQueue,
        activeCampaigns: activeCampaigns.length,
        availableAgents: availableAgents.length,
        busyAgents,
        offlineAgents,
        recentFailures: recentFailures.slice(0, 10),
        alerts: alerts.slice(0, 10).map((a) => ({
          id: a.id,
          organizationId: a.organizationId,
          source: a.source,
          severity: a.severity,
          code: a.code,
          message: a.message,
          resourceType: a.resourceType,
          resourceId: a.resourceId,
          acknowledged: a.acknowledged,
          resolved: a.resolved,
          createdAt: a.createdAt,
        })),
        empty: calls.length === 0 && campaigns.length === 0,
      });
    }

    if (path === "/api/workspace/operations/activity" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "contact_center_operations"))) {
        throw new ApiError("FORBIDDEN", "Contact Center Operations feature not enabled.");
      }
      const limit = query.limit ? Math.min(parseInt(query.limit, 10) || 50, 200) : 50;
      const events = await db.audit.listByOrg(ctx.organizationId, limit * 2);
      const activities: any[] = [];
      for (const event of events) {
        let type: string | null = null;
        switch (event.action) {
          case "CAMPAIGN_STATUS_CHANGED":
            type = event.metadata.status === "running" ? "campaign_started" : event.metadata.status === "completed" ? "campaign_completed" : null;
            break;
          case "CONNECTOR_SYNC_FAILED":
            type = "connector_error";
            break;
          case "COMPLIANCE_VIOLATION_DETECTED":
            type = "compliance_violation";
            break;
          case "CALL_ENDED_BY_SUPERVISOR":
            type = "call_ended";
            break;
          default:
            continue;
        }
        if (type) {
          activities.push({
            id: event.id,
            organizationId: ctx.organizationId,
            type,
            description: event.action.replace(/_/g, " ").toLowerCase(),
            actorId: event.actorId,
            actorEmail: event.actorEmail,
            resourceId: (event.metadata?.resourceId as string) ?? null,
            timestamp: event.createdAt,
          });
        }
        if (activities.length >= limit) break;
      }
      return ok(activities);
    }

    if (path === "/api/workspace/operations/alerts" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "contact_center_operations"))) {
        throw new ApiError("FORBIDDEN", "Contact Center Operations feature not enabled.");
      }
      const unresolvedOnly = query.unresolved !== "false";
      const alerts = await db.operationalAlerts.listByOrg(ctx.organizationId, unresolvedOnly);
      return ok(alerts.map((a) => ({
        id: a.id,
        organizationId: a.organizationId,
        source: a.source,
        severity: a.severity,
        code: a.code,
        message: a.message,
        resourceType: a.resourceType,
        resourceId: a.resourceId,
        acknowledged: a.acknowledged,
        resolved: a.resolved,
        createdAt: a.createdAt,
      })));
    }

    const opsAlertAckMatch = path.match(/^\/api\/workspace\/operations\/alerts\/([A-Za-z0-9_.:-]{4,64})\/acknowledge$/);
    if (opsAlertAckMatch && method === "POST") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "contact_center_operations"))) {
        throw new ApiError("FORBIDDEN", "Contact Center Operations feature not enabled.");
      }
      const alertId = opsAlertAckMatch[1];
      const alert = await db.operationalAlerts.acknowledge(alertId, ctx.organizationId);
      if (!alert) throw notFound("Alert");
      await audit.record({
        organizationId: ctx.organizationId,
        action: "ALERT_ACKNOWLEDGED",
        actorId: ctx.userId,
        metadata: { alertId },
      });
      return ok({
        id: alert.id,
        organizationId: alert.organizationId,
        source: alert.source,
        severity: alert.severity,
        code: alert.code,
        message: alert.message,
        acknowledged: alert.acknowledged,
        resolved: alert.resolved,
        createdAt: alert.createdAt,
      });
    }

    const opsCustomerContextMatch = path.match(/^\/api\/workspace\/operations\/live\/([A-Za-z0-9_.:-]{4,64})\/customer-context$/);
    if (opsCustomerContextMatch && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "contact_center_operations"))) {
        throw new ApiError("FORBIDDEN", "Contact Center Operations feature not enabled.");
      }
      const sessionId = opsCustomerContextMatch[1];
      // IDOR protection
      const session = await db.sessions.get(sessionId, ctx.organizationId);
      if (!session) throw notFound("Voice session");

      // Customer context requires connector integration — return empty context for now
      // Real customer data would come from Data Connectors with proper field mappings
      return ok({
        sessionId,
        organizationId: ctx.organizationId,
        available: false,
        fields: [],
        source: null,
      });
    }

    /* ── Phase 14 — Enterprise Connector APIs ── */
    if (path === "/api/connectors/providers" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      return ok(await app.connectors.listControlProviders(ctx.organizationId));
    }

    if (path === "/api/connectors/control-center" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      const [providers, connectors] = await Promise.all([
        app.connectors.listControlProviders(ctx.organizationId),
        app.connectors.listControlConnectors(ctx.organizationId),
      ]);
      return ok({
        providers,
        connectors,
        credentialStorage: app.connectors.credentialStorageKind(),
      });
    }

    if (path === "/api/connectors" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const connectors = await app.connectors.listControlConnectors(ctx.organizationId);
      return ok(connectors);
    }

    if (path === "/api/connectors" && method === "POST") {
      requireTenantConnectorAdmin(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }

      const body = asObject(request.body);
      const providerId = sanitizeText(body.provider, 64);
      const provider = app.connectorProviderRegistry?.hasProvider(providerId)
        ? app.connectorProviderRegistry.getProvider(providerId)
        : undefined;
      if (!provider) throw new ApiError("BAD_REQUEST", "Connector provider is not registered.");
      const connector = await app.connectors.createConnector(
        ctx.organizationId,
        {
          name: sanitizeName(body.name),
          provider: providerId,
          type: provider.info.type,
          syncMode: body.syncMode as any,
          scheduleCron: body.scheduleCron as string,
          configuration: body.configuration as Record<string, any>,
        },
        { actorId: ctx.userId }
      );
      return ok(await app.connectors.getControlConnector(ctx.organizationId, connector.id), 201);
    }

    const connectorMatch = path.match(/^\/api\/connectors\/([A-Za-z0-9_.:-]{4,64})$/);
    if (connectorMatch && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const connector = await app.connectors.getControlConnector(ctx.organizationId, connectorMatch[1]);
      if (!connector) throw notFound("Connector");
      return ok(connector);
    }

    if (connectorMatch && method === "PUT") {
      requireTenantConnectorAdmin(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }

      const body = asObject(request.body);
      const connector = await app.connectors.updateConnector(
        ctx.organizationId,
        connectorMatch[1],
        {
          name: body.name === undefined ? undefined : sanitizeName(body.name),
          syncMode: body.syncMode as any,
          scheduleCron: body.scheduleCron as string,
          configuration: body.configuration as Record<string, any>,
          enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        },
        { actorId: ctx.userId }
      );
      if (!connector) throw notFound("Connector");
      return ok(await app.connectors.getControlConnector(ctx.organizationId, connector.id));
    }

    if (connectorMatch && method === "DELETE") {
      requireTenantConnectorAdmin(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const deleted = await app.connectors.deleteConnector(
        ctx.organizationId,
        connectorMatch[1],
        { actorId: ctx.userId }
      );
      if (!deleted) throw notFound("Connector");
      return ok({ success: true });
    }

    const connectorCredentialsMatch = path.match(/^\/api\/connectors\/([A-Za-z0-9_.:-]{4,64})\/credentials$/);
    if (connectorCredentialsMatch && method === "POST") {
      requireTenantConnectorAdmin(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const body = asObject(request.body);
      await app.connectors.storeCredentials(
        ctx.organizationId,
        connectorCredentialsMatch[1],
        body,
        { actorId: ctx.userId }
      );
      // Values and even submitted field names are deliberately absent from the response.
      return ok({ configured: true });
    }

    if (connectorCredentialsMatch && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const hasCredentials = await app.connectors.hasCredentials(ctx.organizationId, connectorCredentialsMatch[1]);
      return ok({ hasCredentials });
    }

    const connectorTestMatch = path.match(/^\/api\/connectors\/([A-Za-z0-9_.:-]{4,64})\/test$/);
    if (connectorTestMatch && method === "POST") {
      requireTenantConnectorAdmin(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const result = await app.connectors.testConnection(
        ctx.organizationId,
        connectorTestMatch[1],
        { actorId: ctx.userId }
      );
      return ok(result);
    }

    const connectorSchemaMatch = path.match(/^\/api\/connectors\/([A-Za-z0-9_.:-]{4,64})\/schema$/);
    if (connectorSchemaMatch && method === "GET") {
      requireTenantConnectorAdmin(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const schema = await app.connectors.discoverSchema(ctx.organizationId, connectorSchemaMatch[1]);
      if (!schema) {
        return ok({ error: "Schema discovery not available" }, 404);
      }
      
      return ok(schema);
    }

    const connectorMappingsMatch = path.match(/^\/api\/connectors\/([A-Za-z0-9_.:-]{4,64})\/mappings$/);
    if (connectorMappingsMatch && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const mappings = await app.connectors.listMappings(ctx.organizationId, connectorMappingsMatch[1]);
      return ok(mappings);
    }

    if (connectorMappingsMatch && method === "POST") {
      requireTenantConnectorAdmin(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const body = asObject(request.body);
      const mapping = await app.connectors.createMapping(ctx.organizationId, connectorMappingsMatch[1], {
        sourceField: String(body.sourceField ?? ""),
        targetField: String(body.targetField ?? ""),
        dataType: body.dataType as string,
        required: body.required as boolean,
        transformerType: body.transformerType as any,
        transformerConfig: body.transformerConfig as Record<string, any>,
        displayOrder: body.displayOrder as number,
      });
      
      return ok(mapping, 201);
    }

    const connectorMappingMatch = path.match(/^\/api\/connectors\/([A-Za-z0-9_.:-]{4,64})\/mappings\/([A-Za-z0-9_.:-]{4,64})$/);
    if (connectorMappingMatch && method === "PUT") {
      requireTenantConnectorAdmin(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const body = asObject(request.body);
      const mapping = await app.connectors.updateMapping(
        ctx.organizationId,
        connectorMappingMatch[1],
        connectorMappingMatch[2],
        {
          sourceField: body.sourceField as string,
          targetField: body.targetField as string,
          dataType: body.dataType as string,
          required: body.required as boolean,
          transformerType: body.transformerType as any,
          transformerConfig: body.transformerConfig as Record<string, any>,
          displayOrder: body.displayOrder as number,
        }
      );
      
      if (!mapping) {
        return ok({ error: "Mapping not found" }, 404);
      }
      
      return ok(mapping);
    }

    if (connectorMappingMatch && method === "DELETE") {
      requireTenantConnectorAdmin(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const deleted = await app.connectors.deleteMapping(
        ctx.organizationId,
        connectorMappingMatch[1],
        connectorMappingMatch[2]
      );
      
      if (!deleted) {
        return ok({ error: "Mapping not found" }, 404);
      }
      
      return ok({ success: true });
    }

    const connectorSyncMatch = path.match(/^\/api\/connectors\/([A-Za-z0-9_.:-]{4,64})\/sync$/);
    if (connectorSyncMatch && method === "POST") {
      requireTenantConnectorAdmin(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const body = asObject(request.body);
      const direction = String(body.direction ?? "INBOUND") as any;
      
      try {
        const job = await app.connectors.triggerSync(ctx.organizationId, connectorSyncMatch[1], direction);
        return ok(job, 201);
      } catch (error) {
        if (error instanceof Error && error.message === "SYNC_ALREADY_RUNNING") {
          return ok({ error: "A sync job is already running" }, 409);
        }
        if (error instanceof Error && error.message === "NO_MAPPINGS_CONFIGURED") {
          return ok({ error: "No field mappings configured" }, 400);
        }
        throw error;
      }
    }

    const connectorSyncJobsMatch = path.match(/^\/api\/connectors\/([A-Za-z0-9_.:-]{4,64})\/sync\/jobs$/);
    if (connectorSyncJobsMatch && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50;
      const jobs = await app.connectors.listSyncJobs(ctx.organizationId, connectorSyncJobsMatch[1], limit);
      return ok(jobs);
    }

    const connectorActivitiesMatch = path.match(/^\/api\/connectors\/([A-Za-z0-9_.:-]{4,64})\/activities$/);
    if (connectorActivitiesMatch && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50;
      const activities = await app.connectors.listActivities(ctx.organizationId, connectorActivitiesMatch[1], limit);
      return ok(activities);
    }

    const connectorHealthMatch = path.match(/^\/api\/connectors\/([A-Za-z0-9_.:-]{4,64})\/health$/);
    if (connectorHealthMatch && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "data_connectors"))) {
        throw new ApiError("FORBIDDEN", "Data Connectors feature not enabled.");
      }
      
      const connector = await app.connectors.getControlConnector(ctx.organizationId, connectorHealthMatch[1]);
      if (!connector) throw notFound("Connector");
      return ok({ status: connector.status });
    }

    /* ── Phase 10C — Reporting Center APIs ── */
    if (path === "/api/workspace/reports/voice" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "reporting"))) {
        throw new ApiError("FORBIDDEN", "Reporting feature not enabled for this organization.");
      }
      const filter: any = {};
      if (query.startDate) filter.startDate = query.startDate;
      if (query.endDate) filter.endDate = query.endDate;
      if (query.agentId) filter.agentId = query.agentId;
      if (query.direction === "inbound" || query.direction === "outbound") {
        filter.direction = query.direction;
      }
      if (query.status) filter.status = query.status;
      return ok(await reports.generateVoiceReport(ctx.organizationId, filter));
    }

    if (path === "/api/workspace/reports/agents" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "reporting"))) {
        throw new ApiError("FORBIDDEN", "Reporting feature not enabled for this organization.");
      }
      const filter: any = {};
      if (query.startDate) filter.startDate = query.startDate;
      if (query.endDate) filter.endDate = query.endDate;
      if (query.agentId) filter.agentId = query.agentId;
      return ok(await reports.generateAgentReport(ctx.organizationId, filter));
    }

    if (path === "/api/workspace/reports/campaigns" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "reporting"))) {
        throw new ApiError("FORBIDDEN", "Reporting feature not enabled for this organization.");
      }
      const filter: any = {};
      if (query.startDate) filter.startDate = query.startDate;
      if (query.endDate) filter.endDate = query.endDate;
      return ok(await reports.generateCampaignReport(ctx.organizationId, filter));
    }

    if (path === "/api/workspace/reports/export" && method === "POST") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "reporting"))) {
        throw new ApiError("FORBIDDEN", "Reporting feature not enabled for this organization.");
      }
      authorize(ctx, ["owner", "admin", "manager"]);
      const body = asObject(request.body);
      const reportType = String(body.reportType ?? "");
      const filter: any = {};
      if (body.startDate) filter.startDate = String(body.startDate);
      if (body.endDate) filter.endDate = String(body.endDate);
      if (body.agentId) filter.agentId = String(body.agentId);

      let csvData: string;
      let filename: string;

      switch (reportType) {
        case "voice": {
          const report = await reports.generateVoiceReport(ctx.organizationId, filter);
          csvData = reports.exportToCSV(
            report.byDay.map((d) => ({
              date: d.date,
              total: d.total,
              inbound: d.inbound,
              outbound: d.outbound,
              completed: d.completed,
              failed: d.failed,
            })),
            ["date", "total", "inbound", "outbound", "completed", "failed"]
          );
          filename = "voice-report.csv";
          break;
        }
        case "agents": {
          const report = await reports.generateAgentReport(ctx.organizationId, filter);
          csvData = reports.exportToCSV(
            report.agents.map((a) => ({
              agentName: a.agentName,
              totalSessions: a.totalSessions,
              completedSessions: a.completedSessions,
              failedSessions: a.failedSessions,
              completionRate: a.completionRate.toFixed(1),
            })),
            ["agentName", "totalSessions", "completedSessions", "failedSessions", "completionRate"]
          );
          filename = "agent-report.csv";
          break;
        }
        case "campaigns": {
          const report = await reports.generateCampaignReport(ctx.organizationId, filter);
          csvData = reports.exportToCSV(
            report.campaigns.map((c) => ({
              name: c.name,
              status: c.status,
              totalContacts: c.totalContacts,
              processedContacts: c.processedContacts,
              completedCalls: c.completedCalls,
              failedCalls: c.failedCalls,
            })),
            ["name", "status", "totalContacts", "processedContacts", "completedCalls", "failedCalls"]
          );
          filename = "campaign-report.csv";
          break;
        }
        default:
          throw new ApiError("BAD_REQUEST", "Invalid report type. Use: voice, agents, campaigns.");
      }

      // Record audit event for the export
      await audit.record({
        organizationId: ctx.organizationId,
        action: "REPORT_EXPORTED",
        actorId: ctx.userId,
        metadata: { reportType, format: "csv" },
      });

      return {
        status: 200,
        body: { data: csvData, filename, format: "csv" },
        headers: { "content-type": "text/csv" },
      };
    }

    /* ── Phase 10C — Compliance Policy APIs ── */
    if (path === "/api/workspace/compliance/policies" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "compliance"))) {
        throw new ApiError("FORBIDDEN", "Compliance feature not enabled for this organization.");
      }
      const policies = await db.compliancePolicies.listByOrg(ctx.organizationId);
      return ok(policies);
    }

    if (path === "/api/workspace/compliance/policies" && method === "POST") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "compliance"))) {
        throw new ApiError("FORBIDDEN", "Compliance feature not enabled for this organization.");
      }
      authorize(ctx, ["owner", "admin"]);
      const body = asObject(request.body);
      const name = optionalString(body, "name", 120);
      if (!name) throw new ApiError("BAD_REQUEST", "Policy name is required.");
      const category = String(body.category ?? "");
      const validCategories = ["CALLING_HOURS", "CONTACT_FREQUENCY", "DISCLOSURE_REQUIREMENTS", "RESTRICTED_CONTACTS", "CONSENT_REQUIREMENTS", "DATA_RETENTION"];
      if (!validCategories.includes(category)) throw new ApiError("BAD_REQUEST", `Invalid category. Must be one of: ${validCategories.join(", ")}`);

      const policy = await db.compliancePolicies.create({
        organizationId: ctx.organizationId,
        name,
        category: category as any,
        enabled: body.enabled !== false,
        severity: (body.severity === "LOW" || body.severity === "HIGH" || body.severity === "CRITICAL") ? body.severity as any : "MEDIUM",
        configuration: typeof body.configuration === "object" && body.configuration !== null ? body.configuration as any : {},
        description: optionalString(body, "description", 500) ?? "",
      });

      await audit.record({
        organizationId: ctx.organizationId,
        action: "COMPLIANCE_POLICY_CREATED",
        actorId: ctx.userId,
        metadata: { policyId: policy.id, category, name },
      });

      return ok(policy, 201);
    }

    const compliancePolicyMatch = path.match(/^\/api\/workspace\/compliance\/policies\/([A-Za-z0-9_.:-]{4,64})$/);
    if (compliancePolicyMatch) {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "compliance"))) {
        throw new ApiError("FORBIDDEN", "Compliance feature not enabled for this organization.");
      }
      const policyId = compliancePolicyMatch[1];

      if (method === "GET") {
        const policy = await db.compliancePolicies.get(policyId, ctx.organizationId);
        if (!policy) throw notFound("Compliance policy");
        return ok(policy);
      }

      if (method === "PUT" || method === "PATCH") {
        authorize(ctx, ["owner", "admin"]);
        const body = asObject(request.body);
        const patch: any = {};
        if (body.name !== undefined) patch.name = optionalString(body, "name", 120);
        if (body.description !== undefined) patch.description = optionalString(body, "description", 500);
        if (body.enabled !== undefined) patch.enabled = body.enabled === true;
        if (body.severity !== undefined) {
          const validSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
          if (!validSeverities.includes(String(body.severity))) throw new ApiError("BAD_REQUEST", "Invalid severity");
          patch.severity = body.severity;
        }
        if (body.configuration !== undefined && typeof body.configuration === "object") {
          patch.configuration = body.configuration;
        }

        const updated = await db.compliancePolicies.update(policyId, ctx.organizationId, patch);
        if (!updated) throw notFound("Compliance policy");

        await audit.record({
          organizationId: ctx.organizationId,
          action: "COMPLIANCE_POLICY_UPDATED",
          actorId: ctx.userId,
          metadata: { policyId: updated.id },
        });

        return ok(updated);
      }

      if (method === "DELETE") {
        authorize(ctx, ["owner", "admin"]);
        const deleted = await db.compliancePolicies.delete(policyId, ctx.organizationId);
        if (!deleted) throw notFound("Compliance policy");

        await audit.record({
          organizationId: ctx.organizationId,
          action: "COMPLIANCE_POLICY_DELETED",
          actorId: ctx.userId,
          metadata: { policyId },
        });

        return ok({ deleted: true });
      }

      return methodNotAllowed(["GET", "PUT", "PATCH", "DELETE"]);
    }

    if (path === "/api/workspace/compliance/evaluations" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "compliance"))) {
        throw new ApiError("FORBIDDEN", "Compliance feature not enabled for this organization.");
      }
      const evaluations = await compliance.getRecentEvaluations(ctx.organizationId, 100);
      const policies = await db.compliancePolicies.listByOrg(ctx.organizationId);
      const policyMap = new Map(policies.map((p) => [p.id, p]));
      return ok(evaluations.map((e) => ({
        ...e,
        policyName: policyMap.get(e.policyId)?.name || "Unknown",
        category: policyMap.get(e.policyId)?.category || "UNKNOWN",
      })));
    }

    if (path === "/api/workspace/compliance/evaluate" && method === "POST") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "compliance"))) {
        throw new ApiError("FORBIDDEN", "Compliance feature not enabled for this organization.");
      }
      authorize(ctx, ["owner", "admin", "manager"]);
      const body = asObject(request.body);
      const policyId = requireId(body, "policyId");
      const resourceType = String(body.resourceType ?? "");
      const resourceId = requireId(body, "resourceId");

      if (!["call", "campaign"].includes(resourceType)) {
        throw new ApiError("BAD_REQUEST", "Resource type must be: call or campaign.");
      }

      const result = await compliance.evaluate({
        organizationId: ctx.organizationId,
        policyId,
        resourceType: resourceType as any,
        resourceId,
      });

      // Persist evaluation
      await db.complianceEvaluations.create({
        organizationId: ctx.organizationId,
        policyId,
        resourceType,
        resourceId,
        status: result.status,
        result: result.result,
        context: result.context,
      });

      await audit.record({
        organizationId: ctx.organizationId,
        action: "COMPLIANCE_EVALUATION_RUN",
        actorId: ctx.userId,
        metadata: { policyId, resourceType, resourceId, status: result.status },
      });

      if (result.status === "VIOLATION") {
        await audit.record({
          organizationId: ctx.organizationId,
          action: "COMPLIANCE_VIOLATION_DETECTED",
          actorId: ctx.userId,
          metadata: { policyId, resourceType, resourceId, result: result.result },
        });
      }

      return ok(result);
    }

    if (path === "/api/workspace/compliance/stats" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "compliance"))) {
        throw new ApiError("FORBIDDEN", "Compliance feature not enabled for this organization.");
      }
      const policyCount = await db.compliancePolicies.count(ctx.organizationId);
      const policyByCategory = await db.compliancePolicies.countByCategory(ctx.organizationId);
      const evalStats = await compliance.getEvaluationStats(ctx.organizationId);
      return ok({
        policies: { total: policyCount, byCategory: policyByCategory },
        evaluations: evalStats,
      });
    }

    /* ── Phase 10C — DNC (Do Not Contact) APIs ── */
    if (path === "/api/workspace/dnc" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "dnc_management"))) {
        throw new ApiError("FORBIDDEN", "DNC Management feature not enabled for this organization.");
      }
      const records = await dnc.listRecords(ctx.organizationId);
      return ok(records.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        maskedIdentifier: dnc.maskIdentifier(r.identifier, r.identifierType),
        identifierType: r.identifierType,
        status: r.status,
        reason: r.reason,
        source: r.source,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })));
    }

    if (path === "/api/workspace/dnc" && method === "POST") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "dnc_management"))) {
        throw new ApiError("FORBIDDEN", "DNC Management feature not enabled for this organization.");
      }
      authorize(ctx, ["owner", "admin", "manager"]);
      const body = asObject(request.body);
      const identifier = String(body.identifier ?? "").trim();
      if (!identifier) throw new ApiError("BAD_REQUEST", "Identifier is required.");
      const validTypes = ["PHONE_NUMBER", "EMAIL", "CUSTOMER_ID"];
      const identifierType = String(body.identifierType ?? "PHONE_NUMBER");
      if (!validTypes.includes(identifierType)) throw new ApiError("BAD_REQUEST", `Invalid identifier type. Must be one of: ${validTypes.join(", ")}`);

      const record = await dnc.addRecord({
        organizationId: ctx.organizationId,
        identifier,
        identifierType: identifierType as any,
        reason: optionalString(body, "reason", 500) ?? "",
        source: (body.source === "SYSTEM" || body.source === "PORTAL" || body.source === "LEGAL_REQUEST") ? body.source as any : "MANUAL",
        expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : null,
        createdBy: ctx.userId,
      });

      await audit.record({
        organizationId: ctx.organizationId,
        action: "DNC_RECORD_ADDED",
        actorId: ctx.userId,
        metadata: { dncRecordId: record.id, identifierType, maskedIdentifier: dnc.maskIdentifier(identifier, identifierType as any) },
      });

      return ok({
        id: record.id,
        organizationId: record.organizationId,
        maskedIdentifier: dnc.maskIdentifier(record.identifier, record.identifierType),
        identifierType: record.identifierType,
        status: record.status,
        reason: record.reason,
        source: record.source,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
      }, 201);
    }

    if (path === "/api/workspace/dnc/check" && method === "POST") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "dnc_management"))) {
        throw new ApiError("FORBIDDEN", "DNC Management feature not enabled for this organization.");
      }
      const body = asObject(request.body);
      const identifier = String(body.identifier ?? "").trim();
      if (!identifier) throw new ApiError("BAD_REQUEST", "Identifier is required.");
      const validTypes = ["PHONE_NUMBER", "EMAIL", "CUSTOMER_ID"];
      const identifierType = String(body.identifierType ?? "PHONE_NUMBER");
      if (!validTypes.includes(identifierType)) throw new ApiError("BAD_REQUEST", `Invalid identifier type. Must be one of: ${validTypes.join(", ")}`);

      const result = await dnc.check({
        organizationId: ctx.organizationId,
        identifier,
        identifierType: identifierType as any,
        context: body.context as any,
      });

      if (!result.allowed) {
        await audit.record({
          organizationId: ctx.organizationId,
          action: "DNC_ENFORCEMENT_BLOCKED",
          actorId: ctx.userId,
          metadata: { identifierType, maskedIdentifier: dnc.maskIdentifier(identifier, identifierType as any), reason: result.reason },
        });
      }

      return ok(result);
    }

    const dncRecordMatch = path.match(/^\/api\/workspace\/dnc\/([A-Za-z0-9_.:-]{4,64})$/);
    if (dncRecordMatch) {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "dnc_management"))) {
        throw new ApiError("FORBIDDEN", "DNC Management feature not enabled for this organization.");
      }
      const recordId = dncRecordMatch[1];

      if (method === "GET") {
        const record = await dnc.getRecord(ctx.organizationId, recordId);
        if (!record) throw notFound("DNC record");
        return ok({
          id: record.id,
          organizationId: record.organizationId,
          maskedIdentifier: dnc.maskIdentifier(record.identifier, record.identifierType),
          identifierType: record.identifierType,
          status: record.status,
          reason: record.reason,
          source: record.source,
          expiresAt: record.expiresAt,
          createdAt: record.createdAt,
        });
      }

      if (method === "DELETE") {
        authorize(ctx, ["owner", "admin"]);
        const deleted = await dnc.removeRecord(ctx.organizationId, recordId);
        if (!deleted) throw notFound("DNC record");

        await audit.record({
          organizationId: ctx.organizationId,
          action: "DNC_RECORD_REMOVED",
          actorId: ctx.userId,
          metadata: { dncRecordId: recordId },
        });

        return ok({ deleted: true });
      }

      return methodNotAllowed(["GET", "DELETE"]);
    }

    if (path === "/api/workspace/dnc/stats" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "dnc_management"))) {
        throw new ApiError("FORBIDDEN", "DNC Management feature not enabled for this organization.");
      }
      return ok(await dnc.getStats(ctx.organizationId));
    }

    /* ── Phase 10C — Audit Trail API ── */
    if (path === "/api/workspace/audit" && method === "GET") {
      requireSession(ctx);
      if (!(await entitlements.hasFeature(ctx.organizationId, "audit_trail"))) {
        throw new ApiError("FORBIDDEN", "Audit Trail feature not enabled for this organization.");
      }
      const limit = query.limit ? Math.min(parseInt(query.limit, 10) || 100, 500) : 100;
      const events = await audit.listByOrg(ctx.organizationId, limit);
      return ok(events);
    }

    /* ── Platform Providers & Connectors Control Center ── */
    if (path === "/api/admin/providers" && method === "GET") {
      requirePlatformAdmin(ctx);
      return ok(await platformProviderControlCenter(app.providerRegistry, app.connectors));
    }

    const adminProviderTestMatch = path.match(
      /^\/api\/admin\/providers\/([A-Za-z0-9_.:-]{2,64})\/test$/
    );
    if (adminProviderTestMatch && method === "POST") {
      requirePlatformAdmin(ctx);
      const result = await testTelephonyProvider(app.providerRegistry, adminProviderTestMatch[1], logger);
      if (!result) throw notFound("Provider");
      await audit.record({
        organizationId: null,
        actorId: ctx.userId,
        action: "PROVIDER_POLICY_CHANGED",
        metadata: {
          providerId: result.providerId,
          lifecycle: "tested",
          status: result.status,
          latencyMs: result.latencyMs,
        },
      });
      return ok(result);
    }

    const adminProviderMatch = path.match(/^\/api\/admin\/providers\/([A-Za-z0-9_.:-]{2,64})$/);
    if (adminProviderMatch && method === "PATCH") {
      requirePlatformAdmin(ctx);
      const body = asObject(request.body);
      if (typeof body.enabled !== "boolean") throw new ApiError("BAD_REQUEST", "enabled must be a boolean.");
      const entry = app.providerRegistry.get(adminProviderMatch[1]);
      if (!entry) throw notFound("Provider");
      app.providerRegistry.setEnabled(adminProviderMatch[1], body.enabled);
      await audit.record({
        organizationId: null,
        actorId: ctx.userId,
        action: "PROVIDER_POLICY_CHANGED",
        metadata: {
          providerId: adminProviderMatch[1],
          lifecycle: body.enabled ? "updated" : "disabled",
          enabled: body.enabled,
        },
      });
      const control = await platformProviderControlCenter(app.providerRegistry, app.connectors);
      return ok(control.telephonyProviders.find((provider) => provider.id === adminProviderMatch[1]));
    }

    /* ── Phase 10A — Admin API ── */
    if (path === "/api/admin/overview" && method === "GET") {
      requirePlatformAdmin(ctx);
      const orgs = await db.organizations.list();
      const subscriptions = await db.subscriptions.listAll();
      const allUsers = await Promise.all(orgs.map((o) => db.users.listByOrg(o.id)));
      const allAgents = await Promise.all(orgs.map((o) => db.agents.listByOrg(o.id)));
      const allSessions = await Promise.all(orgs.map((o) => db.sessions.listByOrg(o.id)));
      const allCalls = await Promise.all(orgs.map((o) => db.calls.listByOrg(o.id)));
      const plans = await db.plans.list();

      const totalUsers = allUsers.reduce((sum, u) => sum + u.length, 0);
      const totalAgents = allAgents.reduce((sum, a) => sum + a.length, 0);
      const totalSessions = allSessions.reduce((sum, s) => sum + s.length, 0);
      const totalCalls = allCalls.reduce((sum, c) => sum + c.length, 0);

      return ok({
        organizations: {
          total: orgs.length,
          active: orgs.filter((o) => o.status === "active").length,
          trial: orgs.filter((o) => o.status === "trial").length,
          suspended: orgs.filter((o) => o.status === "suspended").length,
        },
        users: { total: totalUsers },
        agents: {
          total: totalAgents,
          active: allAgents.flat().filter((a) => a.status === "active").length,
        },
        voiceSessions: {
          total: totalSessions,
          completed: allSessions.flat().filter((s) => s.status === "completed").length,
          failed: allSessions.flat().filter((s) => s.status === "failed").length,
          active: allSessions.flat().filter((s) => s.status === "active").length,
        },
        calls: {
          total: totalCalls,
          inbound: allCalls.flat().filter((c) => c.direction === "inbound").length,
          outbound: allCalls.flat().filter((c) => c.direction === "outbound").length,
          completed: allCalls.flat().filter((c) => c.status === "completed").length,
          failed: allCalls.flat().filter((c) => c.status === "failed").length,
        },
        subscriptions: {
          total: subscriptions.length,
          active: subscriptions.filter((s) => s.status === "active").length,
          trial: subscriptions.filter((s) => s.status === "trial").length,
        },
        plans: plans.map((p) => ({ id: p.id, name: p.name, planType: p.planType, status: p.status })),
        providers: app.providerRegistry.list().length,
      });
    }

    if (path === "/api/admin/organizations" && method === "GET") {
      requirePlatformAdmin(ctx);
      const orgs = await db.organizations.list();
      return ok(orgs.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        status: o.status,
        createdAt: o.createdAt,
      })));
    }

    if (path === "/api/admin/plans") {
      requirePlatformAdmin(ctx);
      if (method === "GET") return ok(app.saas.listPlans());
      if (method === "POST") {
        return ok(
          app.saas.createPlan(request.body, { id: ctx.userId, email: ctx.userId }),
          201
        );
      }
      return methodNotAllowed(["GET", "POST"]);
    }

    const adminPlanMatch = path.match(/^\/api\/admin\/plans\/([A-Za-z0-9_.:-]{4,64})$/);
    if (adminPlanMatch) {
      requirePlatformAdmin(ctx);
      if (method === "PATCH" || method === "PUT") {
        return ok(app.saas.updatePlan(adminPlanMatch[1], request.body, { id: ctx.userId, email: ctx.userId }));
      }
      return methodNotAllowed(["PATCH", "PUT"]);
    }

    if (path === "/api/admin/subscriptions" && method === "GET") {
      requirePlatformAdmin(ctx);
      return ok(app.saas.listSubscriptions());
    }

    const adminSubscriptionMatch = path.match(/^\/api\/admin\/subscriptions\/([A-Za-z0-9_.:-]{4,64})$/);
    if (adminSubscriptionMatch) {
      requirePlatformAdmin(ctx);
      if (method === "PUT" || method === "PATCH") {
        return ok(
          app.saas.setSubscription(adminSubscriptionMatch[1], request.body, {
            id: ctx.userId,
            email: ctx.userId,
          })
        );
      }
      return methodNotAllowed(["PUT", "PATCH"]);
    }

    if (path === "/api/admin/entitlements" && method === "GET") {
      requirePlatformAdmin(ctx);
      const organizationId = request.query?.organizationId;
      if (!organizationId) throw new ApiError("VALIDATION_ERROR", "organizationId is required.");
      return ok(app.saas.getOrganizationEntitlements(organizationId));
    }

    const adminEntitlementMatch = path.match(
      /^\/api\/admin\/entitlements\/([A-Za-z0-9_.:-]{4,64})\/([a-z_]{3,64})$/
    );
    if (adminEntitlementMatch) {
      requirePlatformAdmin(ctx);
      const [, organizationId, feature] = adminEntitlementMatch;
      const actor = { id: ctx.userId, email: ctx.userId };
      if (method === "PUT" || method === "PATCH") {
        return ok(app.saas.setEntitlement(organizationId, feature, request.body, actor));
      }
      if (method === "DELETE") {
        await app.saas.removeEntitlement(organizationId, feature, actor);
        return ok({ deleted: true, organizationId, feature });
      }
      return methodNotAllowed(["PUT", "PATCH", "DELETE"]);
    }

    /* ── Phase 10C — Admin Governance API ── */
    if (path === "/api/admin/governance" && method === "GET") {
      requirePlatformAdmin(ctx);
      
      // Get platform-wide governance metrics
      const allAuditEvents = await audit.listAll(100);
      const orgs = await db.organizations.list();
      
      // Count organizations with compliance policies
      let orgsWithPolicies = 0;
      let totalCompliancePolicies = 0;
      let totalDNCRecords = 0;
      
      for (const org of orgs) {
        const policyCount = await db.compliancePolicies.count(org.id);
        const dncCount = await db.dncRecords.count(org.id);
        if (policyCount > 0) orgsWithPolicies++;
        totalCompliancePolicies += policyCount;
        totalDNCRecords += dncCount;
      }
      
      // Get recent governance activity (last 20 events)
      const recentActivity = allAuditEvents.slice(0, 20).map((e) => ({
        id: e.id,
        organizationId: e.organizationId,
        action: e.action,
        actorEmail: e.actorEmail,
        createdAt: e.createdAt,
      }));
      
      return ok({
        audit: {
          totalEvents: allAuditEvents.length,
          recentActivity,
        },
        compliance: {
          organizationsWithPolicies: orgsWithPolicies,
          totalPolicies: totalCompliancePolicies,
        },
        dnc: {
          totalRecords: totalDNCRecords,
        },
        organizations: {
          total: orgs.length,
          active: orgs.filter((o) => o.status === "active").length,
          trial: orgs.filter((o) => o.status === "trial").length,
          suspended: orgs.filter((o) => o.status === "suspended").length,
        },
      });
    }

    /* ── Phase 19 — Platform Admin APIs ── */
    
    // List organizations with filtering and pagination
    if (path === "/api/admin/v2/organizations" && method === "GET") {
      requirePlatformAdmin(ctx);
      const limit = parseInt(query.limit ?? "50", 10);
      const offset = parseInt(query.offset ?? "0", 10);
      const status = query.status as any;
      const search = query.search;
      
      const allOrgs = await db.organizations.list();
      let filtered = allOrgs;
      
      if (status) {
        filtered = filtered.filter((o) => o.status === status);
      }
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(
          (o) => o.name.toLowerCase().includes(s) || o.slug.toLowerCase().includes(s)
        );
      }
      
      const paginated = filtered.slice(offset, offset + limit);
      
      const organizations = await Promise.all(
        paginated.map(async (org) => {
          const [users, agents, subscription] = await Promise.all([
            db.users.listByOrg(org.id),
            db.agents.listByOrg(org.id),
            db.subscriptions.getByOrg(org.id),
          ]);
          
          return {
            id: org.id,
            name: org.name,
            slug: org.slug,
            status: org.status,
            createdAt: org.createdAt,
            userCount: users.length,
            agentCount: agents.length,
            subscriptionStatus: subscription?.status ?? null,
          };
        })
      );
      
      return ok({
        organizations,
        total: filtered.length,
        limit,
        offset,
      });
    }
    
    // Get organization detail
    if (path.startsWith("/api/admin/v2/organizations/") && method === "GET") {
      requirePlatformAdmin(ctx);
      const orgId = path.split("/")[5];
      
      const org = await db.organizations.get(orgId);
      if (!org) {
        throw new ApiError("NOT_FOUND", "Organization not found");
      }
      
      const [users, agents, subscription, sessions, calls, usage] = await Promise.all([
        db.users.listByOrg(orgId),
        db.agents.listByOrg(orgId),
        db.subscriptions.getByOrg(orgId),
        db.sessions.listByOrg(orgId),
        db.calls.listByOrg(orgId),
        db.usage.listByOrg(orgId),
      ]);
      
      let entitlements: string[] = [];
      if (subscription) {
        const plan = await db.plans.get(subscription.planId);
        if (plan) {
          entitlements = plan.features;
        }
      }
      
      const audioSeconds = usage
        .filter((u) => u.eventType === "audio_seconds")
        .reduce((sum, u) => sum + u.quantity, 0);
      
      return ok({
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        createdAt: org.createdAt,
        userCount: users.length,
        agentCount: agents.length,
        subscription: subscription
          ? {
              id: subscription.id,
              planName: (await db.plans.get(subscription.planId))?.name ?? "Unknown",
              status: subscription.status,
              startedAt: subscription.startedAt,
            }
          : null,
        entitlements,
        usage: {
          sessions: sessions.length,
          calls: calls.length,
          audioSeconds,
        },
      });
    }
    
    // Update organization lifecycle
    if (path.startsWith("/api/admin/v2/organizations/") && path.endsWith("/lifecycle") && method === "POST") {
      requirePlatformAdmin(ctx);
      const orgId = path.split("/")[5];
      const body = asObject(request.body);
      const { action, reason } = body;
      
      if (!action || !["activate", "suspend", "archive"].includes(action)) {
        throw new ApiError("VALIDATION_ERROR", "Invalid action");
      }
      
      const org = await db.organizations.get(orgId);
      if (!org) {
        throw new ApiError("NOT_FOUND", "Organization not found");
      }
      
      const statusMap: Record<string, string> = {
        activate: "active",
        suspend: "suspended",
        archive: "suspended",
      };
      
      await db.organizations.update(orgId, { status: statusMap[action] as any });
      
      await audit.record({
        organizationId: orgId,
        action: `organization.${action}`,
        actorId: ctx.userId ?? "unknown",
        actorEmail: ctx.userId ?? "platform_admin",
        metadata: {
          previousStatus: org.status,
          newStatus: statusMap[action],
          reason: reason ?? "",
        },
      });
      
      logger.info(`organization_${action}`, {
        organizationId: orgId,
        actorId: ctx.userId,
        reason,
      });
      
      return ok({ success: true });
    }
    
    // List users with filtering
    if (path === "/api/admin/v2/users" && method === "GET") {
      requirePlatformAdmin(ctx);
      const limit = parseInt(query.limit ?? "50", 10);
      const offset = parseInt(query.offset ?? "0", 10);
      const organizationId = query.organizationId;
      const status = query.status;
      const search = query.search;
      
      let allUsers: any[];
      if (organizationId) {
        allUsers = await db.users.listByOrg(organizationId);
      } else {
        const orgs = await db.organizations.list();
        const usersByOrg = await Promise.all(orgs.map((o) => db.users.listByOrg(o.id)));
        allUsers = usersByOrg.flat();
      }
      
      let filtered = allUsers;
      if (status) {
        filtered = filtered.filter((u) => u.status === status);
      }
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(
          (u) => u.email.toLowerCase().includes(s) || u.name.toLowerCase().includes(s)
        );
      }
      
      const paginated = filtered.slice(offset, offset + limit);
      
      const users = await Promise.all(
        paginated.map(async (user) => {
          let organizationName: string | undefined;
          if (user.organizationId) {
            const org = await db.organizations.get(user.organizationId);
            organizationName = org?.name;
          }
          
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
            organizationId: user.organizationId,
            organizationName,
            createdAt: user.createdAt,
          };
        })
      );
      
      return ok({
        users,
        total: filtered.length,
        limit,
        offset,
      });
    }
    
    // Platform usage analytics
    if (path === "/api/admin/v2/usage" && method === "GET") {
      requirePlatformAdmin(ctx);
      
      const orgs = await db.organizations.list();
      
      const usageByOrg = await Promise.all(
        orgs.map(async (org) => {
          const usage = await db.usage.listByOrg(org.id);
          const sessions = await db.sessions.listByOrg(org.id);
          const calls = await db.calls.listByOrg(org.id);
          
          const audioSeconds = usage
            .filter((u) => u.eventType === "audio_seconds")
            .reduce((sum, u) => sum + u.quantity, 0);
          
          const aiRequests = usage.filter((u) => u.eventType === "ai_request").length;
          
          return {
            organizationId: org.id,
            organizationName: org.name,
            sessions: sessions.length,
            calls: calls.length,
            audioSeconds,
            aiRequests,
          };
        })
      );
      
      const totals = usageByOrg.reduce(
        (acc, curr) => ({
          sessions: acc.sessions + curr.sessions,
          calls: acc.calls + curr.calls,
          audioSeconds: acc.audioSeconds + curr.audioSeconds,
          aiRequests: acc.aiRequests + curr.aiRequests,
        }),
        { sessions: 0, calls: 0, audioSeconds: 0, aiRequests: 0 }
      );
      
      return ok({
        byOrganization: usageByOrg,
        totals,
        generatedAt: new Date().toISOString(),
      });
    }
    
    // Platform health
    if (path === "/api/admin/v2/health" && method === "GET") {
      requirePlatformAdmin(ctx);
      
      let databaseStatus = "healthy";
      try {
        await db.organizations.list();
      } catch {
        databaseStatus = "unhealthy";
      }
      
      const orgs = await db.organizations.list();
      const allConnectors = await Promise.all(orgs.map((o) => db.connectors.listByOrg(o.id)));
      const connectors = allConnectors.flat();
      
      return ok({
        database: databaseStatus,
        providers: [],
        connectors: {
          total: connectors.length,
          healthy: 0,
          degraded: 0,
          unhealthy: 0,
        },
        generatedAt: new Date().toISOString(),
      });
    }
    
    // Audit log
    if (path === "/api/admin/v2/audit" && method === "GET") {
      requirePlatformAdmin(ctx);
      const limit = parseInt(query.limit ?? "100", 10);
      const offset = parseInt(query.offset ?? "0", 10);
      const organizationId = query.organizationId;
      const action = query.action;
      
      let events = await db.audit.listAll(1000);
      
      if (organizationId) {
        events = events.filter((e) => e.organizationId === organizationId);
      }
      if (action) {
        events = events.filter((e) => e.action === action);
      }
      
      events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const paginated = events.slice(offset, offset + limit);
      
      return ok({
        events: paginated.map((e) => ({
          id: e.id,
          organizationId: e.organizationId,
          action: e.action,
          actorId: e.actorId,
          actorEmail: e.actorEmail,
          metadata: e.metadata,
          createdAt: e.createdAt,
        })),
        total: events.length,
        limit,
        offset,
      });
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

/** Connector mutations are tenant-admin operations, including in demo mode. */
function requireTenantConnectorAdmin(ctx: RequestContext) {
  requireSession(ctx);
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    throw new ApiError("FORBIDDEN", "Tenant owner or administrator access required.");
  }
}

/**
 * Phase 10A — Platform admin authorization gate.
 * Only platform admin roles can access admin endpoints.
 */
function requirePlatformAdmin(ctx: RequestContext) {
  if (!ctx.userId) {
    throw new ApiError("UNAUTHENTICATED", "Sign in to access admin.");
  }
  const platformRoles = ["super_admin", "platform_admin", "platform_operator"];
  if (!platformRoles.includes(ctx.role)) {
    throw new ApiError("FORBIDDEN", "Platform administrator access required.");
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
