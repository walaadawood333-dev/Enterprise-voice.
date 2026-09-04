/**
 * Demo-Mode identity broker.
 *
 * It is a real identity flow — PBKDF2-derived digests, random per-user salt, random opaque
 * tokens, expiry, revocation on logout — but it is explicitly NOT a security boundary:
 * state lives in the process (or the browser tab running the local transport) and disappears
 * on restart. The UI labels it "Local identity — session memory only" rather than pretending
 * to be production auth.
 */

import type { UserRole } from "../../../shared/contracts";
import type { AuthBroker, AuthClaims } from "./broker";

const PBKDF2_ITERATIONS = 120_000;
const encode = (value: string) => new TextEncoder().encode(value);

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const randomHex = (length: number) => {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
};

async function derive(password: string, salt: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto unavailable — Demo Mode identity cannot be built.");
  const key = await subtle.importKey("raw", encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits(
    { name: "PBKDF2", salt: encode(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${salt}$${toHex(new Uint8Array(bits))}`;
}

/** Constant-time-ish string compare for digests. */
const safeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
};

export function createDemoAuth(): AuthBroker {
  /** token → claims. Cleared by logout; lost on reload (documented). */
  const sessions = new Map<string, AuthClaims>();
  const cookieName = "centerai_demo_session";
  const maxAgeSeconds = 60 * 60 * 4;

  const sweep = () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    for (const [token, claims] of sessions) if (claims.exp <= nowSeconds) sessions.delete(token);
  };

  return {
    kind: "demo",
    cookieName,
    maxAgeSeconds,

    async hashPassword(password) {
      return derive(password, randomHex(8));
    },

    async verifyPassword(password, hash) {
      const [, iterations, salt] = hash.split("$");
      if (!iterations || !salt) return false;
      const candidate = await derive(password, salt);
      return safeEqual(candidate, hash);
    },

    async sign(claims) {
      sweep();
      const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
      const token = randomHex(24);
      const jti = randomHex(8);
      sessions.set(token, { ...claims, exp, iat: Math.floor(Date.now() / 1000), jti });
      return { token, expiresAt: new Date(exp * 1000).toISOString(), jti };
    },

    async verify(token) {
      sweep();
      const claims = sessions.get(token);
      if (!claims) return null;
      if (claims.exp <= Math.floor(Date.now() / 1000)) {
        sessions.delete(token);
        return null;
      }
      return claims;
    },

    revoke(jti) {
      for (const [token, claims] of sessions) {
        if (claims.jti === jti) sessions.delete(token);
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

/** Used by the local transport: the token travels in memory, never in localStorage. */
export type RoleFor<K extends string> = K extends keyof UserRole ? UserRole : UserRole;
