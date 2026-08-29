/**
 * Authentication broker contract.
 *
 * The router only knows this interface, which keeps two things true:
 *   • password hashing + token signing never run in the browser bundle (the module is injected
 *     by the Node/serverless adapter; the client's local transport passes the demo broker), and
 *   • there is exactly one way to obtain an identity — verify(token) — so no route can
 *     "trust" a client-supplied organizationId.
 */

import type { OrgRole } from "../../../shared/contracts";

export interface AuthClaims {
  /** User id. */
  sub: string;
  organizationId: string;
  role: OrgRole;
  /** Seconds since epoch. */
  exp: number;
  iat: number;
  /** Jti lets a logout revoke a token before it expires. */
  jti: string;
}

export interface AuthBroker {
  readonly kind: "production" | "demo";
  readonly cookieName: string;
  readonly maxAgeSeconds: number;
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  sign(claims: Omit<AuthClaims, "exp" | "iat" | "jti">): Promise<{ token: string; expiresAt: string; jti: string }>;
  verify(token: string): Promise<AuthClaims | null>;
  /** Called on logout; production implementations deny-list until expiry. */
  revoke?(jti: string, expiresAtSeconds: number): void;
  serializeCookie(broker: AuthBroker, token: string, secure: boolean): string;
  clearCookie(broker: AuthBroker, secure: boolean): string;
}

export const cookieValue = (cookieHeader: string | undefined, name: string): string | null => {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("=")) || null;
  }
  return null;
};

export const bearerToken = (header: string | undefined): string | null => {
  if (!header) return null;
  const [scheme, value] = header.trim().split(/\s+/);
  if (!value || scheme?.toLowerCase() !== "bearer") return null;
  return value;
};
