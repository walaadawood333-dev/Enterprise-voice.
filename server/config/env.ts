/**
 * Environment resolution + configuration policy.
 *
 * Rules enforced here (the rest of the codebase never reads process.env directly):
 *   • APP_MODE defaults to "demo". Demo Mode requires ZERO credentials.
 *   • OPENAI_API_KEY is read ONLY here, server-side. It is never placed on a DTO, a log line,
 *     an HTML comment or anything importable by the browser bundle.
 *   • Realtime voice is only ever "enabled" when: this process is Node, a key exists, and
 *     APP_MODE=production OR REALTIME_ENABLED=true.
 *   • Absent optional integrations are disabled and never initialised — no faked clients.
 *   • Missing production config is reported as variable NAMES, never values.
 */

import type { AppMode, ConfigStatusDto } from "../../shared/contracts";

export type EnvSource = Record<string, string | undefined>;
export type EngineMode = "demo" | "production";
export type Runtime = "node" | "browser";

export interface RealtimeConfig {
  /** Requested by configuration, regardless of whether it can be honoured. */
  requested: boolean;
  /** Truly usable: Node runtime + valid key + allowed mode. */
  enabled: boolean;
  keyPresent: boolean;
  model: string;
  voice: string;
  instructionsSource: "agent" | "default";
  maxDurationSeconds: number;
  apiBase: string;
  sdpUrl: string;
  /** Why realtime is off, when it is — names/conditions only, never values. */
  reason?: string;
}

export interface ServerEnv {
  appMode: AppMode;
  runtime: Runtime;
  nodeEnv: "development" | "test" | "production";
  /** Bind host for the Node adapter. Loopback by default so a dev container opts in explicitly. */
  host: string;
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  appUrl: string;

  database: {
    urlPresent: boolean;
    driver: "memory" | "postgres";
    /** True when Demo Mode chose the in-memory repository instead of an external DB. */
    fallbackUsed: boolean;
  };

  auth: {
    /** bearer = real tokens required; demo = in-process identity; disabled = no auth at all. */
    mode: "disabled" | "demo" | "bearer";
    secretSource: "env" | "dev-ephemeral" | "missing";
    cookieName: string;
    tokenTtlSeconds: number;
    /** True when every protected route must present a valid session. */
    enforce: boolean;
    registrationOpen: boolean;
  };

  openai: { keyPresent: boolean; baseUrl: string; orgHeaderPresent: boolean };

  realtime: RealtimeConfig;

  voice: {
    providerName: string;
    providerKeyPresent: boolean;
    webhookUrlPresent: boolean;
    webhookSecretPresent: boolean;
  };

  llm: {
    preferred: "none" | "openai" | "anthropic" | "other";
    openAiKeyPresent: boolean;
    anthropicKeyPresent: boolean;
  };

  /** Conversation engine for the VoiceOrchestrator. Telephony is not part of this phase. */
  voiceEngine: {
    engine: "auto" | "demo" | "openai";
    model: string;
    temperature: number;
    maxHistoryTurns: number;
    timeoutMs: number;
    maxConcurrentSessions: number;
  };

  /** Per-stage view consumed by the engine boundary. */
  providers: {
    stt: { name: string; keyPresent: boolean };
    llm: { name: string; keyPresent: boolean };
    tts: { name: string; keyPresent: boolean };
  };

  storage: {
    driver: "none" | "s3" | "gcs";
    bucketPresent: boolean;
    credentialsPresent: boolean;
    required: boolean;
  };

  crm: { apiKeyPresent: boolean; enabled: boolean; baseUrlPresent: boolean };

  /** Always false in this phase — declared so the UI can never overstate it. */
  telephony: { configured: false };

  corsOrigins: string[];
  rateLimit: { windowMs: number; max: number };
  maxBodyBytes: number;
  webhookUrl: string | null;

  /** Derived engine selection — demo unless production is fully configured. */
  mode: EngineMode;
  /** Variable names only. Never values. */
  redactedKeys: string[];
}

/** Canonical name first, then legacy/alternate spellings. */
const ALIASES = {
  APP_MODE: ["APP_MODE"],
  DATABASE_URL: ["DATABASE_URL", "CENTERAI_DATABASE_URL", "POSTGRES_URL"],
  JWT_SECRET: ["JWT_SECRET", "CENTERAI_AUTH_SECRET", "AUTH_SECRET"],
  AUTH_COOKIE_NAME: ["AUTH_COOKIE_NAME"],
  AUTH_TOKEN_TTL_SECONDS: ["AUTH_TOKEN_TTL_SECONDS"],
  ALLOW_REGISTRATION: ["ALLOW_REGISTRATION"],
  OPENAI_API_KEY: ["OPENAI_API_KEY"],
  OPENAI_BASE_URL: ["OPENAI_BASE_URL"],
  OPENAI_ORG: ["OPENAI_ORG_ID"],
  OPENAI_PROJECT: ["OPENAI_PROJECT_ID"],
  REALTIME_ENABLED: ["REALTIME_ENABLED", "VOICE_MODE"],
  REALTIME_MODEL: ["REALTIME_MODEL", "OPENAI_REALTIME_MODEL"],
  REALTIME_VOICE: ["REALTIME_VOICE", "OPENAI_REALTIME_VOICE"],
  REALTIME_SDP_URL: ["REALTIME_SDP_URL", "OPENAI_REALTIME_SDP_URL"],
  REALTIME_MAX_SECONDS: ["REALTIME_MAX_SECONDS"],
  VOICE_PROVIDER_API_KEY: ["VOICE_PROVIDER_API_KEY", "STT_API_KEY", "TTS_API_KEY"],
  VOICE_PROVIDER_BASE_URL: ["VOICE_PROVIDER_BASE_URL", "STT_BASE_URL", "TTS_BASE_URL"],
  VOICE_PROVIDER_NAME: ["VOICE_PROVIDER_NAME", "STT_PROVIDER", "TTS_PROVIDER"],
  VOICE_PROVIDER_WEBHOOK_SECRET: [
    "VOICE_PROVIDER_WEBHOOK_SECRET",
    "CENTERAI_WEBHOOK_SIGNING_SECRET",
    "WEBHOOK_SIGNING_SECRET",
  ],
  WEBHOOK_URL: ["WEBHOOK_URL", "VOICE_PROVIDER_WEBHOOK_URL"],
  ANTHROPIC_API_KEY: ["ANTHROPIC_API_KEY"],
  LLM_PROVIDER: ["LLM_PROVIDER"],
  LLM_MODEL: ["LLM_MODEL"],
  OPENAI_MODEL: ["OPENAI_MODEL"],
  VOICE_ENGINE: ["VOICE_ENGINE"],
  VOICE_TEMPERATURE: ["VOICE_TEMPERATURE"],
  VOICE_HISTORY_TURNS: ["VOICE_HISTORY_TURNS"],
  VOICE_TIMEOUT_MS: ["VOICE_TIMEOUT_MS"],
  VOICE_MAX_CONCURRENT: ["VOICE_MAX_CONCURRENT"],
  HOST: ["HOST"],
  STORAGE_DRIVER: ["STORAGE_DRIVER"],
  STORAGE_BUCKET_NAME: ["STORAGE_BUCKET_NAME", "STORAGE_BUCKET", "S3_BUCKET"],
  STORAGE_ACCESS_KEY: ["STORAGE_ACCESS_KEY", "AWS_ACCESS_KEY_ID"],
  STORAGE_SECRET_KEY: ["STORAGE_SECRET_KEY", "AWS_SECRET_ACCESS_KEY"],
  CRM_API_KEY: ["CRM_API_KEY", "SALESFORCE_API_KEY", "HUBSPOT_API_KEY"],
  CRM_BASE_URL: ["CRM_BASE_URL"],
  CORS_ORIGINS: ["CORS_ORIGINS"],
  PORT: ["PORT"],
  LOG_LEVEL: ["LOG_LEVEL"],
  APP_URL: ["APP_URL"],
  RATE_LIMIT_WINDOW_MS: ["RATE_LIMIT_WINDOW_MS"],
  RATE_LIMIT_MAX: ["RATE_LIMIT_MAX"],
  MAX_BODY_BYTES: ["MAX_BODY_BYTES"],
  NODE_ENV: ["NODE_ENV"],
} as const;

type AliasKey = keyof typeof ALIASES;

export const SECRET_ENV_NAMES = [
  "JWT_SECRET",
  "OPENAI_API_KEY",
  "VOICE_PROVIDER_API_KEY",
  "VOICE_PROVIDER_WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
  "STORAGE_ACCESS_KEY",
  "STORAGE_SECRET_KEY",
  "CRM_API_KEY",
  "DATABASE_URL",
] as const;

const lookup = (src: EnvSource, key: AliasKey): string | undefined => {
  for (const name of ALIASES[key]) {
    const raw = src[name];
    if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  }
  return undefined;
};

const present = (src: EnvSource, key: AliasKey) => lookup(src, key) !== undefined;
const text = (src: EnvSource, key: AliasKey, fallback = "") => lookup(src, key) ?? fallback;

const numberFrom = (src: EnvSource, key: AliasKey, fallback: number) => {
  const parsed = Number(lookup(src, key));
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

const csv = (src: EnvSource, key: AliasKey, fallback: string[]) => {
  const raw = lookup(src, key);
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
};

const oneOf = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const truthy = (value: string) => ["1", "true", "yes", "on", "real", "realtime"].includes(value.toLowerCase());

/**
 * Realtime credentials are only visible when running as a server process. The browser bundle
 * executes the same route handlers with an EMPTY env source, so it is structurally impossible
 * for the client-side copy to obtain or forward a key.
 */
export function readProcessEnv(): EnvSource {
  if (typeof process !== "undefined" && process.env) return process.env as EnvSource;
  return {};
}

const detectRuntime = (): Runtime =>
  typeof process !== "undefined" && process.env ? "node" : "browser";

/**
 * Ephemeral Demo-Mode secret.
 * Process-lifetime only: never read from env, never attached to ServerEnv, never logged,
 * never returned by any DTO, and gone on restart. It exists so Demo Mode boots through the
 * same startup path as production instead of crashing on a missing secret.
 */
let devEphemeralSecret: string | null = null;
export function getDemoAuthSecretSource(): string {
  if (devEphemeralSecret) return devEphemeralSecret;
  const bytes = new Uint8Array(32);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  devEphemeralSecret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return devEphemeralSecret;
}

export const DEFAULT_REALTIME_MODEL = "gpt-realtime";
export const DEFAULT_REALTIME_VOICE = "marin";
/** Realtime sessions are capped at 60 minutes by the provider; default lower for a demo. */
export const DEFAULT_REALTIME_MAX_SECONDS = 300;

export function resolveEnv(source: EnvSource = readProcessEnv()): ServerEnv {
  const runtime = detectRuntime();
  const appMode: AppMode = oneOf(
    text(source, "APP_MODE", "demo").toLowerCase(),
    ["demo", "production"] as const,
    "demo"
  );
  const nodeEnv = oneOf(
    text(source, "NODE_ENV", "development"),
    ["development", "test", "production"] as const,
    "development"
  );

  const databaseUrlPresent = present(source, "DATABASE_URL");
  const jwtPresent = present(source, "JWT_SECRET");
  const openAiKeyPresent = present(source, "OPENAI_API_KEY");
  const voiceKeyPresent = present(source, "VOICE_PROVIDER_API_KEY");
  const anthropic = present(source, "ANTHROPIC_API_KEY");
  const crmKeyPresent = present(source, "CRM_API_KEY");

  const storageDriver = oneOf(
    text(source, "STORAGE_DRIVER", "none").toLowerCase(),
    ["none", "s3", "gcs"] as const,
    "none"
  );

  const realtimeRequestedRaw = text(source, "REALTIME_ENABLED", "auto").toLowerCase();
  const realtimeRequested =
    realtimeRequestedRaw === "auto"
      ? appMode === "production"
      : realtimeRequestedRaw === "off" || realtimeRequestedRaw === "false"
        ? false
        : truthy(realtimeRequestedRaw) || appMode === "production";

  const realtimeReason =
    runtime !== "node"
      ? "browser runtime cannot hold or forward a provider credential"
      : !openAiKeyPresent
        ? "OPENAI_API_KEY not configured"
        : !realtimeRequested
          ? "not enabled for this mode (set REALTIME_ENABLED=true to try it)"
          : undefined;

  const realtime: RealtimeConfig = {
    requested: realtimeRequested,
    enabled: runtime === "node" && openAiKeyPresent && realtimeRequested,
    keyPresent: openAiKeyPresent,
    model: text(source, "REALTIME_MODEL", DEFAULT_REALTIME_MODEL),
    voice: text(source, "REALTIME_VOICE", DEFAULT_REALTIME_VOICE),
    instructionsSource: "agent",
    maxDurationSeconds: Math.min(
      3600,
      numberFrom(source, "REALTIME_MAX_SECONDS", DEFAULT_REALTIME_MAX_SECONDS)
    ),
    apiBase: text(source, "OPENAI_BASE_URL", "https://api.openai.com").replace(/\/+$/, ""),
    sdpUrl: text(source, "REALTIME_SDP_URL", "https://api.openai.com/v1/realtime/calls"),
    ...(realtimeReason ? { reason: realtimeReason } : {}),
  };

  // A production engine needs a transport AND a model provider. Demo needs neither.
  const mode: EngineMode =
    appMode === "production" && (voiceKeyPresent || openAiKeyPresent) ? "production" : "demo";

  if (!jwtPresent && appMode === "demo") getDemoAuthSecretSource();

  const llmName = text(
    source,
    "LLM_PROVIDER",
    openAiKeyPresent ? "openai" : anthropic ? "anthropic" : "none"
  );

  const voiceEngine = oneOf(
    text(source, "VOICE_ENGINE", "auto").toLowerCase(),
    ["auto", "demo", "openai"] as const,
    "auto"
  );
  const openAiUsable = openAiKeyPresent && runtime === "node";
  const resolvedVoice =
    voiceEngine === "auto" ? (openAiUsable ? "openai" : "demo") : voiceEngine === "openai" ? "openai" : "demo";

  return {
    appMode,
    runtime,
    nodeEnv,
    host: text(source, "HOST", "127.0.0.1"),
    port: numberFrom(source, "PORT", 8787),
    logLevel: oneOf(
      text(source, "LOG_LEVEL", "info"),
      ["debug", "info", "warn", "error"] as const,
      "info"
    ),
    appUrl: text(source, "APP_URL", "http://localhost:5173"),
    database: {
      urlPresent: databaseUrlPresent,
      driver: databaseUrlPresent ? "postgres" : "memory",
      fallbackUsed: !databaseUrlPresent,
    },
    auth: {
      mode: jwtPresent ? "bearer" : appMode === "demo" ? "demo" : "bearer",
      secretSource: jwtPresent ? "env" : appMode === "demo" ? "dev-ephemeral" : "missing",
      cookieName: text(source, "AUTH_COOKIE_NAME", "centerai_session"),
      tokenTtlSeconds: Math.min(
        60 * 60 * 24 * 7,
        numberFrom(source, "AUTH_TOKEN_TTL_SECONDS", 60 * 60 * 8)
      ),
      enforce: appMode === "production",
      registrationOpen: oneOf(
        text(source, "ALLOW_REGISTRATION", appMode === "demo" ? "true" : "false"),
        ["true", "false"] as const,
        "false"
      ) === "true",
    },
    openai: {
      keyPresent: openAiKeyPresent,
      baseUrl: text(source, "OPENAI_BASE_URL", "https://api.openai.com").replace(/\/+$/, ""),
      orgHeaderPresent: present(source, "OPENAI_ORG"),
    },
    realtime,
    voice: {
      providerName: text(source, "VOICE_PROVIDER_NAME", "openai-realtime"),
      providerKeyPresent: voiceKeyPresent || openAiKeyPresent,
      webhookUrlPresent: present(source, "WEBHOOK_URL"),
      webhookSecretPresent: present(source, "VOICE_PROVIDER_WEBHOOK_SECRET"),
    },
    llm: {
      preferred: oneOf(llmName, ["none", "openai", "anthropic"] as const, "other"),
      openAiKeyPresent,
      anthropicKeyPresent: anthropic,
    },
    voiceEngine: {
      // "auto" resolves to demo whenever no server-side key exists — including the browser bundle.
      engine: resolvedVoice,
      model: text(source, "OPENAI_MODEL", "gpt-4o-mini"),
      temperature: Number(text(source, "VOICE_TEMPERATURE", "0.3")) || 0.3,
      maxHistoryTurns: numberFrom(source, "VOICE_HISTORY_TURNS", 8),
      timeoutMs: numberFrom(source, "VOICE_TIMEOUT_MS", 20_000),
      maxConcurrentSessions: numberFrom(source, "VOICE_MAX_CONCURRENT", 20),
    },
    providers: {
      stt: { name: text(source, "VOICE_PROVIDER_NAME", "openai-realtime"), keyPresent: voiceKeyPresent || openAiKeyPresent },
      llm: { name: llmName, keyPresent: openAiKeyPresent || anthropic },
      tts: { name: text(source, "VOICE_PROVIDER_NAME", "openai-realtime"), keyPresent: voiceKeyPresent || openAiKeyPresent },
    },
    storage: {
      driver: storageDriver,
      bucketPresent: present(source, "STORAGE_BUCKET_NAME"),
      credentialsPresent: present(source, "STORAGE_ACCESS_KEY"),
      required: appMode === "production" && storageDriver !== "none",
    },
    crm: {
      apiKeyPresent: crmKeyPresent,
      // Never enabled in Demo Mode, even if a key happens to be present in the environment.
      enabled: appMode === "production" && crmKeyPresent,
      baseUrlPresent: present(source, "CRM_BASE_URL"),
    },
    telephony: { configured: false },
    corsOrigins: csv(source, "CORS_ORIGINS", ["http://localhost:5173", "http://localhost:4173"]),
    rateLimit: {
      windowMs: numberFrom(source, "RATE_LIMIT_WINDOW_MS", 60_000),
      max: numberFrom(source, "RATE_LIMIT_MAX", 120),
    },
    maxBodyBytes: numberFrom(source, "MAX_BODY_BYTES", 32 * 1024),
    webhookUrl: lookup(source, "WEBHOOK_URL") ?? null,
    mode,
    redactedKeys: [...SECRET_ENV_NAMES],
  };
}

/** Variables Production Mode refuses to start without. */
export function requiredProductionVars(): string[] {
  return [
    "APP_MODE=production",
    "JWT_SECRET",
    "DATABASE_URL",
    "OPENAI_API_KEY",
    "CORS_ORIGINS",
  ];
}

export interface StartupConfig {
  ok: boolean;
  appMode: AppMode;
  /** Missing variable names — safe for operators and CI logs; contains no values. */
  problems: string[];
  /** Informational notes; Demo Mode is expected to have several. */
  notes: string[];
  realtime: { enabled: boolean; model: string; reason?: string };
}

export function validateStartupConfig(env: ServerEnv): StartupConfig {
  const problems: string[] = [];
  const notes: string[] = [];
  const realtime = {
    enabled: env.realtime.enabled,
    model: env.realtime.model,
    ...(env.realtime.reason ? { reason: env.realtime.reason } : {}),
  };

  if (env.appMode === "demo") {
    notes.push("Demo Mode: no external provider credentials required.");
    notes.push(
      env.realtime.enabled
        ? `Realtime voice enabled (${env.realtime.model}).`
        : `Realtime voice off → DemoVoiceProvider (${realtime.reason ?? "not enabled"}).`
    );
    if (env.database.fallbackUsed)
      notes.push("DATABASE_URL absent → in-memory repository (data is not persisted).");
    if (!env.storage.bucketPresent)
      notes.push("STORAGE_BUCKET_NAME absent → nothing is uploaded; transcripts stay in memory.");
    if (!env.crm.enabled) notes.push("CRM_API_KEY absent → CRM integration not initialised.");
    if (env.auth.secretSource === "dev-ephemeral")
      notes.push("JWT_SECRET absent → process-lifetime dev secret only; no tokens are issued.");
    return { ok: true, appMode: "demo", problems, notes, realtime };
  }

  if (env.auth.secretSource === "missing") problems.push("JWT_SECRET");
  if (!env.database.urlPresent) problems.push("DATABASE_URL");
  if (!env.openai.keyPresent) problems.push("OPENAI_API_KEY");
  if (!env.realtime.enabled && runtimeIsNode(env))
    problems.push("OPENAI_API_KEY (realtime voice requested but unusable)");
  if (!env.corsOrigins.length || env.corsOrigins.includes("*"))
    problems.push("CORS_ORIGINS (set an explicit allow-list)");
  if (env.storage.driver !== "none" && (!env.storage.bucketPresent || !env.storage.credentialsPresent))
    problems.push("STORAGE_BUCKET_NAME + STORAGE_ACCESS_KEY + STORAGE_SECRET_KEY");
  if (env.voice.webhookUrlPresent && !env.voice.webhookSecretPresent)
    problems.push("VOICE_PROVIDER_WEBHOOK_SECRET (WEBHOOK_URL is set)");

  return { ok: problems.length === 0, appMode: "production", problems, notes, realtime };
}

const runtimeIsNode = (env: ServerEnv) => env.runtime === "node";

/** What the browser may be told: presence flags, names and notes — never values. */
export function publicConfigSummary(env: ServerEnv): ConfigStatusDto & {
  realtime: { enabled: boolean; model: string; voice: string; maxSeconds: number };
} {
  const { problems, notes } = validateStartupConfig(env);
  return {
    appMode: env.appMode,
    ok: problems.length === 0,
    missing: problems,
    notes,
    storage: {
      driver: env.storage.driver,
      configured: env.storage.bucketPresent && env.storage.credentialsPresent,
      required: env.storage.required,
    },
    database: { driver: env.database.driver, external: !env.database.fallbackUsed },
    auth: { secretSource: env.auth.secretSource, mode: env.auth.mode },
    crm: { enabled: env.crm.enabled },
    realtime: {
      enabled: env.realtime.enabled,
      model: env.realtime.model,
      voice: env.realtime.voice,
      maxSeconds: env.realtime.maxDurationSeconds,
    },
  };
}
