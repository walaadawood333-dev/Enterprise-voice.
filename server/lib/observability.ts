/**
 * Structured logging + the only error shape the API is allowed to emit.
 * Secrets are filtered here rather than trusted to callers.
 */

import { API_ERROR_CODES, type ApiErrorBody, type ApiErrorCode } from "../../shared/contracts";

const REDACT_PATTERNS = [
  /api[_-]?key/i,
  /authorization/i,
  /^cookie$/i,
  /password/i,
  /secret/i,
  /token/i,
  /credential/i,
  /database[_-]?url/i,
  /connection[_-]?string/i,
  /signature/i,
  /jwt/i,
  /access[_-]?key/i,
  /(openai|anthropic|crm|webhook)/i,
  /^(s3|storage)/i,
];

export const REDACTED = "[redacted]";

/** Redact credential values even when a caller placed them under a non-sensitive field name. */
export function redactString(value: string): string {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, REDACTED)
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, REDACTED)
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, REDACTED)
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret|webhook[_-]?secret|jwt[_-]?secret)\s*[=:]\s*["']?)[^\s&"']+/gi,
      `$1${REDACTED}`
    )
    .slice(0, 2_000);
}

export function isSensitiveKey(key: string) {
  return REDACT_PATTERNS.some((re) => re.test(key));
}

export function redact<T>(value: T, depth = 0): T {
  if (value === null || value === undefined) return value as T;
  if (depth > 4) {
    return (typeof value === "string" ? redactString(value) : REDACTED) as T;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T;
  if (typeof value === "string") return redactString(value) as T;
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED : redact(v, depth + 1);
  }
  return out as unknown as T;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(minLevel: LogLevel = "info", sink?: (line: string) => void): Logger {
  const emit = (level: LogLevel, message: string, fields?: Record<string, unknown>) => {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;
    const record = {
      ts: new Date().toISOString(),
      level,
      msg: message,
      service: "centerai-api",
      ...(fields ? redact(fields) : {}),
    };
    const line = JSON.stringify(record);
    if (sink) sink(line);
    else if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
  };

  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
  };
}

/* ── Errors ─────────────────────────────────────────────────────────── */

const DEFAULT_STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_DISABLED: 403,
  EMAIL_TAKEN: 409,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  RATE_LIMITED: 429,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  SESSION_ERROR: 400,
  VOICE_SESSION_ERROR: 500,
  PROVIDER_NOT_CONFIGURED: 503,
  PROVIDER_NOT_IMPLEMENTED: 501,
  AUTH_NOT_CONFIGURED: 503,
  CONFIG_INVALID: 503,
  RUNTIME_UNSUPPORTED: 503,
  REALTIME_UNAVAILABLE: 503,
  SESSION_TIMEOUT: 408,
  INTERNAL_ERROR: 500,
  TELEPHONY_PROVIDER_NOT_CONFIGURED: 503,
  TELEPHONY_PROVIDER_UNAVAILABLE: 503,
  TELEPHONY_CAPABILITY_NOT_SUPPORTED: 422,
  TELEPHONY_CONFIGURATION_INVALID: 503,
};

/**
 * Raised at boot when APP_MODE=production is missing credentials.
 * Carries variable *names* only, so it can be shown to operators without leaking values.
 * Declared after ApiError (see below) and built by the factory to keep the module order simple.
 */
export const configInvalid = (problems: string[]) =>
  new ApiError(
    "CONFIG_INVALID",
    problems.length > 0
      ? `Incomplete configuration for this mode. Missing: ${problems.join(", ")}.`
      : "Server configuration is incomplete for this mode.",
    { status: 503, fields: problems.length ? { missing: problems.join(", ") } : undefined }
  );

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;
  /** Anything here stays server-side only. */
  readonly internal?: unknown;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: { status?: number; fields?: Record<string, string>; internal?: unknown } = {}
  ) {
    super(message);
    this.name = "ApiError";
    if (!API_ERROR_CODES.includes(code)) throw new Error(`Unknown error code: ${code}`);
    this.code = code;
    this.status = options.status ?? DEFAULT_STATUS[code];
    this.fields = options.fields;
    this.internal = options.internal;
  }

  toPublicBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
      },
    };
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new ApiError("BAD_REQUEST", message, { fields });
export const notFound = (what = "Resource") => new ApiError("NOT_FOUND", `${what} not found.`);
export const rateLimited = (retryAfterS: number) =>
  new ApiError("RATE_LIMITED", "Too many requests.", {
    status: 429,
    internal: { retryAfterS },
  });
export const providerNotConfigured = () =>
  new ApiError(
    "PROVIDER_NOT_CONFIGURED",
    "No production voice provider is configured. This deployment answers with the demo engine."
  );

/** Guarantees no stack trace, env var or provider payload ever reaches the browser. */
export function toApiError(error: unknown, logger?: Logger, context?: Record<string, unknown>): ApiError {
  if (error instanceof ApiError) return error;
  if (error && typeof error === "object" && (error as { code?: string }).code === "VALIDATION_FAILED") {
    const fields = (error as { fields?: Record<string, string> }).fields;
    return new ApiError("VALIDATION_FAILED", "Invalid request body.", { fields });
  }
  logger?.error("unhandled_api_error", {
    ...(context ?? {}),
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return new ApiError("INTERNAL_ERROR", "Unexpected server error.", { internal: error });
}
