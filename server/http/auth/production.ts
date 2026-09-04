/**
 * Production auth broker: bcrypt password digests + signed JWT session cookies.
 * Imported only by the Node/serverless adapters, so neither library reaches the client bundle.
 */

import bcrypt from "bcryptjs";
import { jwtDecrypt, jwtVerify, SignJWT, type JWKSet } from "jose";
import type { UserRole } from "../../../shared/contracts";
import type { AuthBroker, AuthClaims } from "./broker";

export interface ProductionAuthOptions {
  secret: string;
  cookieName?: string;
  tokenTtlSeconds?: number;
  issuer?: string;
  bcryptRounds?: number;
}

const ISSUER_DEFAULT = "centerai-api";

/** In-process deny list for logout. Swap for Redis when more than one instance runs. */
const revoked = new Map<string, number>();

export function createProductionAuth(options: ProductionAuthOptions): AuthBroker {
  if (!options.secret || options.secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be at least 32 characters in production mode. Generate one with: openssl rand -base64 48"
    );
  }

  const key = new TextEncoder().encode(options.secret);
  const issuer = options.issuer ?? ISSUER_DEFAULT;
  const cookieName = options.cookieName ?? "centerai_session";
  const maxAgeSeconds = options.tokenTtlSeconds ?? 60 * 60 * 8;
  const rounds = options.bcryptRounds ?? 12;

  const isRevoked = (jti: string) => {
    const until = revoked.get(jti);
    if (!until) return false;
    if (until <= Math.floor(Date.now() / 1000)) {
      revoked.delete(jti);
      return false;
    }
    return true;
  };

  return {
    kind: "production",
    cookieName,
    maxAgeSeconds,

    async hashPassword(password) {
      return bcrypt.hash(password, rounds);
    },

    async verifyPassword(password, hash) {
      try {
        return await bcrypt.compare(password, hash);
      } catch {
        return false;
      }
    },

    async sign(claims) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const exp = nowSeconds + maxAgeSeconds;
      const jti = cryptoRandomId();
      const token = await new SignJWT({ org: claims.organizationId, role: claims.role })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(claims.sub)
        .setIssuer(issuer)
        .setJti(jti)
        .setIssuedAt(nowSeconds)
        .setExpirationTime(exp)
        .sign(key);

      return { token, expiresAt: new Date(exp * 1000).toISOString(), jti };
    },

    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, { issuer, algorithms: ["HS256"] });
        const jti = payload.jti;
        const exp = payload.exp;
        if (!jti || !exp || isRevoked(jti)) return null;
        const claims: AuthClaims = {
          sub: String(payload.sub ?? ""),
          organizationId: String(payload.org ?? ""),
          role: (payload.role ?? "viewer") as UserRole,
          exp,
          iat: payload.iat ?? 0,
          jti,
        };
        if (!claims.sub) return null;
        return claims;
      } catch {
        return null;
      }
    },

    revoke(jti, expiresAtSeconds) {
      revoked.set(jti, expiresAtSeconds);
      if (revoked.size > 20_000) {
        const cutoff = Math.floor(Date.now() / 1000);
        for (const [id, until] of revoked) if (until <= cutoff) revoked.delete(id);
      }
    },

    serializeCookie(broker, token, secure) {
      return `${broker.cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${broker.maxAgeSeconds}${secure ? "; Secure" : ""}`;
    },

    clearCookie(broker, secure) {
      return `${broker.cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
    },
  };
}

function cryptoRandomId() {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Exposed for a future JWKS endpoint — not used by the cookie flow. */
export async function publicJwks(secret: string) {
  void jwtDecrypt;
  void (secret && secret.length);
  return { keys: [] as JWKSet["keys"] };
}

/*
 * Hardening notes for the operator wiring this up:
 *   • rotate JWT_SECRET with a grace window (dual-key verification) before enforcing;
 *   • move `revoked` into Redis (or shorten TTL to minutes) for multi-instance deploys;
 *   • set cookies to `Secure` + SameSite=Strict once TLS and same-origin are guaranteed;
 *   • bcrypt rounds: raise to 14 when p95 auth latency has headroom.
 */
