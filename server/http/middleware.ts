/**
 * HTTP middleware: CORS, rate limiting, body guards, auth-ready context, security headers
 * and a fetch-style handler shared by every adapter (Node, serverless, tests).
 * No fake security: each control is either implemented or reported as not configured.
 */

import {
  API_ERROR_CODES,
  ROLES,
  type ApiErrorCode,
  type ApiErrorBody,
  type ApiResponse,
  type OrgRole,
  type RequestContext,
  type UserRole,
} from "../../shared/contracts";
import type { ServerEnv } from "../config/env";
import type { Db } from "../db/store";
import { ApiError, toApiError } from "../lib/observability";
import { bearerToken, cookieValue, type AuthBroker } from "./auth/broker";

/* ── Rate limiting (in-process token window; swap the store for Redis later) ── */

export interface RateLimiter {
  take(key: string): { allowed: boolean; remaining: number; resetInMs: number };
  reset(): void;
}

export function createRateLimiter(options: { windowMs: number; max: number }): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  const sweep = () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  };

  return {
    take(key: string) {
      const now = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + options.windowMs });
        if (buckets.size > 5_000) {
          sweep();
          // Spoofed high-cardinality keys must not grow memory without bound.
          while (buckets.size > 5_000) {
            const oldest = buckets.keys().next().value as string | undefined;
            if (!oldest) break;
            buckets.delete(oldest);
          }
        }
        return { allowed: true, remaining: Math.max(0, options.max - 1), resetInMs: options.windowMs };
      }
      bucket.count += 1;
      const resetInMs = Math.max(0, bucket.resetAt - now);
      if (bucket.count > options.max) {
        return { allowed: false, remaining: 0, resetInMs };
      }
      return { allowed: true, remaining: Math.max(0, options.max - bucket.count), resetInMs };
    },
    reset: () => buckets.clear(),
  };
}

/* ── CORS ───────────────────────────────────────────────────────────── */

export function isAllowedOrigin(env: ServerEnv, origin: string): boolean {
  try {
    const normalized = new URL(origin).origin;
    return (
      normalized === origin &&
      (env.corsOrigins.includes(origin) ||
        sameOrigin(env.appUrl, origin) ||
        (env.appMode === "demo" && env.corsOrigins.includes("*")))
    );
  } catch {
    return false;
  }
}

export function corsHeadersFor(env: ServerEnv, origin?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    vary: "Origin",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "microphone=(), camera=(), geolocation=()",
    "cross-origin-resource-policy": "same-origin",
    "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  };
  if (env.appMode === "production" && env.appUrl.startsWith("https://")) {
    headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  }
  if (!origin || !isAllowedOrigin(env, origin)) return headers;
  headers["access-control-allow-origin"] = origin;
  headers["access-control-vary"] = "Origin";
  // Wildcard demo origins never receive credentialed CORS. Explicit and same-origin entries do.
  if (env.corsOrigins.includes(origin) || sameOrigin(env.appUrl, origin)) {
    headers["access-control-allow-credentials"] = "true";
  }
  return headers;
}

function sameOrigin(left: string, right: string) {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

export const preflightHeaders = (env: ServerEnv, origin?: string | null): Record<string, string> => ({
  ...corsHeadersFor(env, origin),
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-request-id",
  "access-control-max-age": "600",
});

/* ── Authentication / authorization (ready, not production auth) ────── */

/** Identity dependencies. Demo and production both require an issued session for tenant routes. */
export interface AuthenticateDeps {
  users: Db["users"];
  organizations: Db["organizations"];
  broker?: AuthBroker;
}

/**
 * Identity resolution. Priority: bearer token → session cookie. There is no implicit tenant.
 *
 * Isolation rule: the organizationId on the returned context comes from the *user row*, never
 * from the token payload, a header or the request body. A forged tenant id therefore does nothing.
 */
export async function authenticate(
  env: ServerEnv,
  headers: Record<string, string>,
  deps: AuthenticateDeps
): Promise<Omit<RequestContext, "requestId">> {
  const at = new Date().toISOString();
  const token =
    bearerToken(headers["authorization"]) ??
    cookieValue(headers["cookie"], deps.broker?.cookieName ?? "centerai_session");

  if (deps.broker && token) {
    const claims = await deps.broker.verify(token);
    if (!claims) {
      throw new ApiError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
    }
    const user = await deps.users.get(claims.sub);
    if (!user || user.status !== "active") {
      throw new ApiError("ACCOUNT_DISABLED", "This account cannot access the workspace.");
    }
    const organization = await deps.organizations.get(user.organizationId);
    if (!organization || organization.status === "suspended") {
      throw new ApiError("ACCOUNT_DISABLED", "This workspace is suspended or unavailable.");
    }
    return {
      organizationId: user.organizationId,
      userId: user.id,
      role: user.role,
      authMode: deps.broker.kind === "demo" ? "demo" : "bearer",
      tokenPresented: true,
      at,
    };
  }

  // Second layer of the demo-bypass guard: production may never fall through to an implicit
  // tenant identity, no matter how the adapter was configured.
  if (env.appMode === "production") {
    throw new ApiError(
      "UNAUTHENTICATED",
      "A valid session is required. Sign in to open your workspace."
    );
  }

  // Demo Mode changes provider wiring, never authentication. A user must still register or log in
  // to receive a short-lived in-memory demo token before any tenant route is served.
  throw new ApiError("UNAUTHENTICATED", "Sign in to open your workspace.");
}

const RANK: Record<OrgRole, number> = { owner: 40, admin: 30, manager: 20, operator: 10, viewer: 0 };

/** Authorization gate. Demo mode changes infrastructure, never a user's RBAC permissions. */
export function authorize(ctx: { role: UserRole; authMode: string }, allowed: OrgRole[]): void {
  if (!(ROLES as readonly string[]).includes(ctx.role)) {
    throw new ApiError("FORBIDDEN", "A tenant role is required for this action.");
  }
  const role = ctx.role as OrgRole;
  if (!allowed.includes(role) && RANK[role] < RANK[allowed[0] ?? "owner"]) {
    throw new ApiError("FORBIDDEN", "Your role cannot perform this action.");
  }
}

/* ── Body guard ──────────────────────────────────────────────────────── */

export function assertBodySize(text: string, maxBytes: number) {
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new ApiError("BAD_REQUEST", `Request body exceeds ${maxBytes} bytes.`, { status: 413 });
  }
}

/** Consume Fetch request bytes with a hard bound instead of allocating the whole body first. */
async function readBoundedBody(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError("BAD_REQUEST", `Request body exceeds ${maxBytes} bytes.`, { status: 413 });
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError("BAD_REQUEST", `Request body exceeds ${maxBytes} bytes.`, { status: 413 });
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export function parseRequestBody(text: string, contentType = "application/json"): unknown {
  if (!text) return {};
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType === "application/x-www-form-urlencoded") {
    const params = new URLSearchParams(text);
    if ([...params.keys()].length > 100) throw new ApiError("BAD_REQUEST", "Too many form fields.");
    const body: Record<string, string> = {};
    for (const [key, value] of params) {
      if (key.length <= 80 && value.length <= 4_000) body[key] = value;
    }
    return body;
  }
  if (mediaType && mediaType !== "application/json" && !mediaType.endsWith("+json")) {
    throw new ApiError("BAD_REQUEST", "Unsupported request content type.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("BAD_REQUEST", "Request body must be valid JSON.");
  }
}

/** Compatibility export used by older tests. */
export const parseJsonBody = (text: string): unknown => parseRequestBody(text);

/* ── Shared fetch-style handler (Web standards: Node 18+, edge runtimes) ── */

export interface FetchApp {
  env: ServerEnv;
  limiter: RateLimiter;
  handleSafe(raw: {
    method: string;
    path: string;
    search?: string;
    headers: Record<string, string>;
    body?: unknown;
    rawBody?: string;
    ip?: string;
  }): Promise<ApiResponse>;
}

export function createFetchHandler(app: FetchApp) {
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: preflightHeaders(app.env, origin) });
    }

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    let response: ApiResponse;
    try {
      const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
      if (unsafeMethod && origin && !isAllowedOrigin(app.env, origin)) {
        throw new ApiError("FORBIDDEN", "Request origin is not allowed.");
      }
      const cookieName = app.env.auth.cookieName;
      const cookieAuthenticated = Boolean(cookieValue(headers["cookie"], cookieName));
      const bearerAuthenticated = Boolean(bearerToken(headers["authorization"]));
      if (unsafeMethod && cookieAuthenticated && !bearerAuthenticated && !origin) {
        throw new ApiError("FORBIDDEN", "An Origin header is required for cookie-authenticated changes.");
      }

      let body: unknown;
      let rawBody: string | undefined;
      if (request.method !== "GET" && request.method !== "HEAD") {
        rawBody = await readBoundedBody(request, app.env.maxBodyBytes);
        body = parseRequestBody(rawBody, headers["content-type"]);
      }

      response = await app.handleSafe({
        method: request.method,
        path: url.pathname,
        search: url.search,
        headers,
        body,
        rawBody,
        ip: hashKey(headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? "local"),
      });
    } catch (error) {
      const apiError = toApiError(error);
      response = { status: apiError.status, body: apiError.toPublicBody() };
    }

    const isServerError = response.status >= 500;
    const safeBody: ApiErrorBody | unknown =
      isServerError && looksLikeInternal(response.body)
        ? {
            error: {
              code: "INTERNAL_ERROR" as ApiErrorCode,
              message: "Unexpected server error.",
            },
          }
        : response.body;

    return new Response(typeof safeBody === "string" ? safeBody : JSON.stringify(safeBody), {
      status: response.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...corsHeadersFor(app.env, origin),
        ...(response.headers ?? {}),
        "x-request-id": headers["x-request-id"] ?? "",
      },
    });
  };
}

function looksLikeInternal(body: unknown) {
  const err = (body as ApiErrorBody | undefined)?.error;
  if (!err?.code) return false;
  return !API_ERROR_CODES.includes(err.code);
}

/** Stable, non-reversible key for rate limiting and logs — no raw IPs retained. */
export function hashKey(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(36)}`;
}
