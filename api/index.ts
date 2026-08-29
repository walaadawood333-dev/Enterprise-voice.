/**
 * Serverless entry point (Vercel / Netlify functions / any fetch-compatible runtime).
 * Same composition as the Node adapter: this is where secrets are read and the persistent
 * driver is chosen. `default` is the Web-standard fetch handler.
 */

import { resolveEnv, validateStartupConfig } from "../server/config/env";
import { readRealtimeSecrets } from "../server/config/secrets";
import { createLogger } from "../server/lib/observability";
import { createApp } from "../server/http/router";
import { createFetchHandler } from "../server/http/middleware";
import { createProductionAuth } from "../server/http/auth/production";
import { createDemoAuth } from "../server/http/auth/demo";
import { createRealtimeService } from "../server/services/realtime";
import { createMemoryDb } from "../server/db/store";

const env = resolveEnv();
const logger = createLogger(env.logLevel);
const startup = validateStartupConfig(env);

/** Serverless can't exit(1); it answers degraded so the platform logs stay readable. */
if (env.appMode === "production" && !startup.ok) {
  logger.error("configuration_incomplete", { missing: startup.problems });
}

async function build() {
  let db;
  if (env.appMode === "production" && env.database.driver === "postgres") {
    const { createPrismaDb } = await import("../server/db/prisma/repository");
    db = await createPrismaDb();
  } else {
    db = createMemoryDb();
    logger.warn("database_in_memory", { note: "Ephemeral per instance. Set DATABASE_URL for Postgres." });
  }

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
    // Edge runtimes stream responses, so incremental turn frames are available here too.
    streamingCapable: true,
    realtime: env.realtime.enabled
      ? (ctx) =>
          createRealtimeService(ctx.env, ctx.db, ctx.logger, ctx.agents, secrets, ctx.voiceEngine)
      : undefined,
  });
}

let handler: ((request: Request) => Promise<Response>) | null = null;

export default async function fetchHandler(request: Request): Promise<Response> {
  if (!handler) handler = createFetchHandler(await build());
  return handler(request);
}
