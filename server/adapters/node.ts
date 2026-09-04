/**
 * Node HTTP adapter — the composition root for production wiring.
 * This is the only module that reads secrets and chooses the persistent driver.
 *
 * Run locally (Node 20+, which strips types natively):
 *   node --experimental-strip-types server/adapters/node.ts
 * Demo Mode needs nothing at all: no DATABASE_URL, no JWT_SECRET, no provider key.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readRealtimeSecrets } from "../config/secrets";
import { resolveEnv, validateStartupConfig } from "../config/env";
import { ApiError, createLogger, toApiError } from "../lib/observability";
import { createApp } from "../http/router";
import { authorize, createFetchHandler, hashKey, isAllowedOrigin } from "../http/middleware";
import { createProductionAuth } from "../http/auth/production";
import { createDemoAuth } from "../http/auth/demo";
import { createMemoryDb } from "../db/store";
import { asObject, optionalString, requireString } from "../../shared/validate";

const env = resolveEnv();
const logger = createLogger(env.logLevel);
const startup = validateStartupConfig(env);

/** Escape hatch for diagnosing a broken deployment; never for real traffic. */
const allowDegraded = () => (process.env.CENTERAI_API_ALLOW_DEGRADED ?? "") === "1";

/*
 * Fail fast, loudly and safely: a production boot prints the missing variable NAMES and exits
 * before serving traffic — never values, never internal stacks.
 */
if (env.appMode === "production" && !allowDegraded() && !startup.ok) {
  console.error("[centerai] refusing to start: APP_MODE=production but configuration is incomplete");
  for (const problem of startup.problems) console.error(`  ✗ missing — ${problem}`);
  console.error("  Fix the variables above (see .env.example) or run with APP_MODE=demo.");
  process.exit(1);
}

async function buildApp() {
  // Postgres only when a URL exists AND production mode asked for it; otherwise volatile memory.
  let db;
  if (env.appMode === "production" && env.database.driver === "postgres") {
    const { createPrismaDb } = await import("../db/prisma/repository");
    db = await createPrismaDb();
    logger.info("database_connected", { driver: "postgres", pool: "prisma" });
  } else {
    db = createMemoryDb();
    logger.warn("database_in_memory", {
      appMode: env.appMode,
      note: "Nothing is persisted. Set DATABASE_URL and APP_MODE=production for Postgres.",
    });
  }

  // Auth: real hashing + signed cookies only with a server secret; demo identity otherwise.
  const auth =
    env.auth.secretSource === "env"
      ? createProductionAuth({
          secret: process.env.JWT_SECRET ?? "",
          cookieName: env.auth.cookieName,
          tokenTtlSeconds: env.auth.tokenTtlSeconds,
        })
      : env.appMode === "demo"
        ? createDemoAuth()
        : undefined;

  const secrets = readRealtimeSecrets();
  const telephonyProviders: import("../telephony/provider").TelephonyProvider[] = [];
  if (env.telephony.configured && env.telephony.activeProvider === "signalwire") {
    const { SignalWireProvider } = await import("../telephony/providers/signalwire");
    const provider = new SignalWireProvider(env, logger);
    await provider.initialize();
    telephonyProviders.push(provider);
  }

  return createApp({
    envSource: process.env,
    logger,
    db,
    secrets,
    auth,
    telephonyProviders,
    realtime: env.realtime.enabled
      ? (ctx) =>
          createRealtimeService(ctx.env, ctx.db, ctx.logger, ctx.agents, secrets, ctx.voiceEngine)
      : undefined,
    // Only adapters that can flush frames turn streaming on.
    streamingCapable: true,
  });
}

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    let tooLarge = false;
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk, "utf8");
      if (bytes > env.maxBodyBytes) {
        tooLarge = true;
        return;
      }
      data += chunk;
    });
    req.on("error", reject);
    req.on("end", () => tooLarge
      ? reject(new ApiError("BAD_REQUEST", "Request body is too large.", { status: 413 }))
      : resolve(data));
  });

void (async () => {
  const app = await buildApp();
  const fetchHandler = createFetchHandler(app);

  const server = createServer(async (req, res) => {
    const started = Date.now();
    try {
      const method = req.method ?? "GET";
      const host = req.headers.host ?? `localhost:${env.port}`;
      const url = new URL(req.url ?? "/", `http://${host}`);

      if (!url.pathname.startsWith("/api")) {
        respond(res, 404, { error: { code: "NOT_FOUND", message: "API route only." } }, started);
        return;
      }

      /*
       * Streaming turn: only this adapter can flush frames, so SSE lives here and nowhere else.
       * The client asks /api/voice/engine/capabilities first and falls back to buffered turns when
       * streaming is unavailable (e.g. the in-browser local transport).
       */
      const streamMatch = url.pathname.match(
        /^\/api\/voice\/sessions\/([A-Za-z0-9_.:-]{4,64})\/stream$/
      );
      if (streamMatch && method === "POST") {
        try {
          const cookie = typeof req.headers.cookie === "string" ? req.headers.cookie : "";
          const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
          if (cookie && !isAllowedOrigin(env, origin)) {
            throw new ApiError("FORBIDDEN", "Request origin is not allowed.");
          }
          if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
            throw new ApiError("BAD_REQUEST", "Content-Type must be application/json.", { status: 415 });
          }
          const decision = app.limiter.take(hashKey(req.socket.remoteAddress ?? "unknown"));
          if (!decision.allowed) {
            res.setHeader("retry-after", String(Math.max(1, Math.ceil(decision.resetInMs / 1_000))));
            throw new ApiError("RATE_LIMITED", "Too many requests.");
          }
          const ctx = await app.authenticate({
            authorization: typeof req.headers.authorization === "string" ? req.headers.authorization : "",
            cookie,
          });
          if (!ctx) throw new ApiError("UNAUTHENTICATED", "Sign in to stream a turn.");
          authorize(ctx, ["owner", "admin", "manager", "operator"]);

          const rawBody = await readBody(req);
          let parsed: Record<string, unknown>;
          try {
            parsed = asObject(rawBody ? JSON.parse(rawBody) : {});
          } catch (error) {
            if (error instanceof ApiError) throw error;
            throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");
          }
          const text = requireString(parsed, "text", { max: 4_000 });
          const turnId = optionalString(parsed, "turnId", 64);
          res.writeHead(200, {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store, no-transform",
            connection: "keep-alive",
            "x-accel-buffering": "no",
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
          });
          try {
            for await (const frame of app.voiceEngine.streamTurn({
              organizationId: ctx.organizationId,
              sessionId: streamMatch[1],
              text,
              turnId,
            })) {
              res.write(`event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`);
            }
          } catch (error) {
            const safe = toApiError(error, logger, { endpoint: "voice_stream" });
            res.write(`event: error\ndata: ${JSON.stringify({
              type: "error",
              error: safe.toPublicBody().error.message,
              code: safe.code,
            })}\n\n`);
          }
          res.end();
        } catch (error) {
          const safe = toApiError(error, logger, { endpoint: "voice_stream_setup" });
          if (!res.headersSent) respond(res, safe.status, safe.toPublicBody(), started);
          else res.end();
        }
        return;
      }

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers.set(key, value);
        else if (Array.isArray(value)) headers.set(key, value.join(", "));
      }
      // This adapter is the trust boundary. Never accept a client-supplied forwarding chain.
      headers.set("x-forwarded-for", req.socket.remoteAddress ?? "unknown");

      const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
      const response = await fetchHandler(
        new Request(url, {
          method,
          headers,
          body: body && body.length > 0 ? body : undefined,
        })
      );

      const text = await response.text();
      respond(res, response.status, text, started, Object.fromEntries(response.headers.entries()));
    } catch (error) {
      const safe = toApiError(error, logger, { endpoint: "node_adapter" });
      respond(res, safe.status, safe.toPublicBody(), started);
    }
  });

  function respond(
    res: ServerResponse,
    status: number,
    payload: string | Record<string, unknown>,
    started: number,
    extraHeaders: Record<string, string> = {}
  ) {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-response-time-ms": String(Date.now() - started),
      ...extraHeaders,
    });
    res.end(body);
  }

  if (process.env.CENTERAI_API_NO_LISTEN !== "1") {
    // HOST is opt-in: containers set HOST=0.0.0.0, laptops keep loopback. Never hardcoded.
    server.listen(env.port, env.host, () => {
      logger.info("centerai_api_listening", {
        host: env.host,
        port: env.port,
        appMode: env.appMode,
        engine: env.mode,
        database: env.database.driver,
        auth: env.auth.mode,
        identity: authLabel(),
        storage: env.storage.driver,
        crm: env.crm.enabled ? "enabled" : "not initialised",
        cors: env.corsOrigins.length,
      });
    });
  }
})();

/** Presence only — never the secret itself. */
function authLabel(): string {
  if (env.auth.secretSource === "env") return "jwt+httpOnly cookie";
  if (env.appMode === "demo") return "demo-local (session memory)";
  return "not configured";
}
