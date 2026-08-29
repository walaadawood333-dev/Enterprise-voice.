/**
 * The single trust boundary for provider credentials.
 *
 * Only the Node / serverless adapters import `readRealtimeSecrets`. Anything that can be
 * bundled for the browser receives `NO_SECRETS`, so a key can never be read, echoed or
 * reached from the client — even by accident.
 */

export interface RuntimeSecrets {
  /** Signing key for auth tokens. Null in Demo Mode — no secret to protect a server. */
  jwtSecret(): string | null;
}

export interface RealtimeSecrets extends RuntimeSecrets {
  /** Returns the provider key for this request, or null when unavailable. */
  openaiKey(): string | null;
  orgId(): string | null;
  projectId(): string | null;
}

const read = (name: string): string | null => {
  if (typeof process === "undefined" || !process.env) return null;
  const raw = process.env[name];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
};

export function readRealtimeSecrets(): RealtimeSecrets {
  return {
    openaiKey: () => read("OPENAI_API_KEY"),
    orgId: () => read("OPENAI_ORG_ID"),
    projectId: () => read("OPENAI_PROJECT_ID"),
    jwtSecret: () => read("JWT_SECRET") ?? read("CENTERAI_AUTH_SECRET") ?? read("AUTH_SECRET"),
  };
}

/** Default for every non-adapter consumer (including the browser's local transport). */
export const NO_SECRETS: RealtimeSecrets = {
  openaiKey: () => null,
  orgId: () => null,
  projectId: () => null,
  jwtSecret: () => null,
};
