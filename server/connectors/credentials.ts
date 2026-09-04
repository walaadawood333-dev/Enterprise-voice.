/**
 * Connector credential storage boundary.
 *
 * Credential values remain server-side, are tenant-keyed, and are never represented in API DTOs,
 * logs, activities, or audit events. The built-in memory implementation is deliberately available
 * only for demo/tests; production must inject a secure external store.
 */

import type { ConnectorCredentials } from "./providers/base";

export type ConnectorCredentialStorageKind = "SESSION_ONLY" | "SECURE_EXTERNAL" | "UNAVAILABLE";

export interface ConnectorCredentialStore {
  readonly kind: ConnectorCredentialStorageKind;
  store(organizationId: string, connectorId: string, credentials: ConnectorCredentials): Promise<void>;
  retrieve(organizationId: string, connectorId: string): Promise<ConnectorCredentials | undefined>;
  delete(organizationId: string, connectorId: string): Promise<boolean>;
  exists(organizationId: string, connectorId: string): Promise<boolean>;
}

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
const SENSITIVE_KEYS = new Set([
  "apikey",
  "authorization",
  "bearer",
  "clientsecret",
  "connectionstring",
  "credential",
  "credentials",
  "databaseurl",
  "jwt",
  "key",
  "password",
  "passwordhash",
  "privatekey",
  "refreshtoken",
  "secret",
  "securitytoken",
  "signingkey",
  "token",
  "accesstoken",
]);

export function isSensitiveCredentialKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_KEYS.has(normalized) ||
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.endsWith("token") ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("privatekey")
  );
}

/** Reject credential-shaped data from ordinary persisted connector configuration. */
export function containsCredentialMaterial(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredentialMaterial);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => isSensitiveCredentialKey(key) || containsCredentialMaterial(nested)
    );
  }
  if (typeof value !== "string") return false;
  return /(?:authorization:\s*bearer|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)=)/i.test(value);
}

/** Recursively remove sensitive keys before data enters logs, diagnostics, activities, or audits. */
export function scrubCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubCredentials);
  if (!value || typeof value !== "object") return value;

  const scrubbed: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (!isSensitiveCredentialKey(key)) scrubbed[key] = scrubCredentials(nested);
  }
  return scrubbed;
}

class InMemoryCredentialStore implements ConnectorCredentialStore {
  readonly kind = "SESSION_ONLY" as const;
  private readonly credentials = new Map<string, ConnectorCredentials>();

  private getKey(organizationId: string, connectorId: string): string {
    return `${organizationId}:${connectorId}`;
  }

  async store(organizationId: string, connectorId: string, credentials: ConnectorCredentials): Promise<void> {
    this.credentials.set(this.getKey(organizationId, connectorId), { ...credentials });
  }

  async retrieve(organizationId: string, connectorId: string): Promise<ConnectorCredentials | undefined> {
    const credentials = this.credentials.get(this.getKey(organizationId, connectorId));
    return credentials ? { ...credentials } : undefined;
  }

  async delete(organizationId: string, connectorId: string): Promise<boolean> {
    return this.credentials.delete(this.getKey(organizationId, connectorId));
  }

  async exists(organizationId: string, connectorId: string): Promise<boolean> {
    return this.credentials.has(this.getKey(organizationId, connectorId));
  }
}

class UnavailableCredentialStore implements ConnectorCredentialStore {
  readonly kind = "UNAVAILABLE" as const;
  async store(): Promise<void> {
    throw new Error("SECURE_CREDENTIAL_STORE_NOT_CONFIGURED");
  }
  async retrieve(): Promise<undefined> {
    return undefined;
  }
  async delete(): Promise<boolean> {
    return false;
  }
  async exists(): Promise<boolean> {
    return false;
  }
}

/** Demo/test factory. Production callers must opt out or inject a SECURE_EXTERNAL implementation. */
export function createConnectorCredentialStore(mode: "demo" | "production" = "demo"): ConnectorCredentialStore {
  return mode === "production" ? new UnavailableCredentialStore() : new InMemoryCredentialStore();
}
