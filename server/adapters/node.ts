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
import { createLogger } from "../lib/observability";
import { createApp } from "../http/router";
import { createFetchHandler } from "../http/middleware";
import { createProductionAuth } from "../http/auth/production";
import { createDemoAuth } from "../http/auth/demo";
import { createMemoryDb } from "../db/store";

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

  return createApp({
    envSource: process.env,
    logger,
    db,
    secrets,
    auth,
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
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      data += chunk;
      if (data.length > env.maxBodyBytes) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
    });
    req.on("error", reject);
    req.on("end", () => resolve(data));
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
        const ctx = await app.authenticate({
          authorization: typeof req.headers.authorization === "string" ? req.headers.authorization : "",
          cookie: typeof req.headers.cookie === "string" ? req.headers.cookie : "",
        });
        if (!ctx) {
          respond(res, 401, { error: { code: "UNAUTHENTICATED", message: "Sign in to stream a turn." } }, started);
          return;
        }
        const rawBody = await readBody(req);
        const parsed = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        });
        try {
          for await (const frame of app.voiceEngine.streamTurn({
            organizationId: ctx.organizationId,
            sessionId: streamMatch[1],
            text: String(parsed.text ?? ""),
            turnId: typeof parsed.turnId === "string" ? parsed.turnId : undefined,
          })) {
            res.write(`event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`);
          }
        } catch (error) {
          const message = (error as Error)?.message?.slice(0, 160) ?? "stream_failed";
          res.write(`event: error\ndata: ${JSON.stringify({ type: "error", error: message })}\n\n`);
        }
        res.end();
        return;
      }

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers.set(key, value);
        else if (Array.isArray(value)) headers.set(key, value.join(", "));
      }

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
      logger.error("node_adapter_failure", { reason: (error as Error)?.message?.slice(0, 200) });
      respond(res, 500, { error: { code: "INTERNAL_ERROR", message: "Unexpected server error." } }, started);
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
