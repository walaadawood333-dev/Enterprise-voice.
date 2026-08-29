/**
 * HTTP middleware: CORS, rate limiting, body guards, auth-ready context, security headers
 * and a fetch-style handler shared by every adapter (Node, serverless, tests).
 * No fake security: each control is either implemented or reported as not configured.
 */

import {
  API_ERROR_CODES,
  type ApiErrorCode,
  type ApiErrorBody,
  type ApiResponse,
  type OrgRole,
  type RequestContext,
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
        if (buckets.size > 5_000) sweep();
        return { allowed: true, remaining: options.max - 1, resetInMs: options.windowMs };
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

export function corsHeadersFor(env: ServerEnv, origin?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    vary: "Origin",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "microphone=(), camera=(), geolocation=()",
  };
  if (!origin) return headers;
  const allowed =
    env.corsOrigins.includes("*") || env.corsOrigins.includes(origin) || sameOrigin(env.appUrl, origin);
  if (!allowed) return headers;
  headers["access-control-allow-origin"] = origin;
  headers["access-control-vary"] = "Origin";
  return headers;
}

function sameOrigin(appUrl: string, origin: string) {
  try {
    return new URL(appUrl).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

export const preflightHeaders = (env: ServerEnv, origin?: string | null): Record<string, string> => ({
  ...corsHeadersFor(env, origin),
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-request-id",
  "access-control-max-age": "600",
});

/* ── Authentication / authorization (ready, not production auth) ────── */

/**
 * With CENTERAI_AUTH_SECRET unset the API answers as the seeded demo organization — clearly
 * labelled, never presented as real authentication. With it set, a bearer token is required;
 * token verification is delegated to `verifyBearer` which must be wired to the real IdP later.
 */
export interface AuthenticateDeps {
  /** Only consulted in Demo Mode, where there is no browser cookie jar to authenticate. */
  demoOrganizationId: string;
  users: Db["users"];
  broker?: AuthBroker;
}

/**
 * Identity resolution. Priority: bearer token → session cookie → (Demo Mode only) the seeded
 * workspace owner.
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

  if (env.appMode === "demo" && env.auth.mode !== "bearer") {
    const members = await deps.users.listByOrg(deps.demoOrganizationId);
    const owner = members.find((user) => user.role === "owner") ?? members[0];
    return {
      organizationId: deps.demoOrganizationId,
      userId: owner?.id ?? null,
      role: owner?.role ?? "owner",
      authMode: "demo",
      tokenPresented: false,
      at,
    };
  }

  throw new ApiError("UNAUTHENTICATED", "Sign in to open your workspace.");
}

const RANK: Record<OrgRole, number> = { owner: 40, admin: 30, manager: 20, operator: 10, viewer: 0 };

/** Authorization gate. In Demo Mode there is one seeded tenant, so nothing to escalate against. */
export function authorize(ctx: { role: OrgRole; authMode: string }, allowed: OrgRole[]): void {
  if (ctx.authMode === "demo") return;
  if (!allowed.includes(ctx.role) && RANK[ctx.role] < RANK[allowed[0] ?? "owner"]) {
    throw new ApiError("FORBIDDEN", "Your role cannot perform this action.");
  }
}

/* ── Body guard ──────────────────────────────────────────────────────── */

export function assertBodySize(text: string, maxBytes: number) {
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new ApiError("BAD_REQUEST", `Request body exceeds ${maxBytes} bytes.`);
  }
}

export function parseJsonBody(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("BAD_REQUEST", "Request body must be valid JSON.");
  }
}

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

    let body: unknown;
    if (request.method !== "GET" && request.method !== "HEAD") {
      const text = await request.text().catch(() => "");
      assertBodySize(text, app.env.maxBodyBytes);
      body = parseJsonBody(text);
    }

    let response: ApiResponse;
    try {
      response = await app.handleSafe({
        method: request.method,
        path: url.pathname,
        search: url.search,
        headers,
        body,
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

    return new Response(JSON.stringify(safeBody), {
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
