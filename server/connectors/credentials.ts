/**
 * Phase 14 - Connector Credential Store
 * 
 * Secure credential storage for connector providers.
 * Credentials are:
 * - Stored server-side only
 * - Never returned through APIs
 * - Never logged
 * - Never exposed in audit events
 */

import type { ConnectorCredentials } from "./providers/base";
import type { Db } from "../db/store";

/**
 * Credential storage interface
 */
export interface ConnectorCredentialStore {
  /**
   * Store credentials for a connector
   */
  store(organizationId: string, connectorId: string, credentials: ConnectorCredentials): Promise<void>;

  /**
   * Retrieve credentials for a connector
   */
  retrieve(organizationId: string, connectorId: string): Promise<ConnectorCredentials | undefined>;

  /**
   * Delete credentials for a connector
   */
  delete(organizationId: string, connectorId: string): Promise<boolean>;

  /**
   * Check if credentials exist for a connector
   */
  exists(organizationId: string, connectorId: string): Promise<boolean>;
}

/**
 * In-memory credential store (for demo/testing)
 * In production, this would use encrypted storage (AWS Secrets Manager, Vault, etc.)
 */
class InMemoryCredentialStore implements ConnectorCredentialStore {
  private readonly credentials: Map<string, ConnectorCredentials> = new Map();

  private getKey(organizationId: string, connectorId: string): string {
    return `${organizationId}:${connectorId}`;
  }

  async store(
    organizationId: string,
    connectorId: string,
    credentials: ConnectorCredentials
  ): Promise<void> {
    const key = this.getKey(organizationId, connectorId);
    this.credentials.set(key, credentials);
  }

  async retrieve(
    organizationId: string,
    connectorId: string
  ): Promise<ConnectorCredentials | undefined> {
    const key = this.getKey(organizationId, connectorId);
    return this.credentials.get(key);
  }

  async delete(organizationId: string, connectorId: string): Promise<boolean> {
    const key = this.getKey(organizationId, connectorId);
    return this.credentials.delete(key);
  }

  async exists(organizationId: string, connectorId: string): Promise<boolean> {
    const key = this.getKey(organizationId, connectorId);
    return this.credentials.has(key);
  }
}

/**
 * Create credential store
 */
export function createConnectorCredentialStore(): ConnectorCredentialStore {
  // In production, this would return a secure encrypted store
  // For now, we use in-memory storage
  return new InMemoryCredentialStore();
}

/**
 * Scrub credentials from objects (for logging, audit, API responses)
 */
export function scrubCredentials(obj: Record<string, any>): Record<string, any> {
  const scrubbed = { ...obj };
  const sensitiveKeys = [
    "credentials",
    "credential",
    "password",
    "secret",
    "apiKey",
    "api_key",
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "clientSecret",
    "client_secret",
    "securityToken",
    "security_token",
  ];

  for (const key of sensitiveKeys) {
    if (key in scrubbed) {
      delete scrubbed[key];
    }
  }

  // Recursively scrub nested objects
  for (const [key, value] of Object.entries(scrubbed)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      scrubbed[key] = scrubCredentials(value);
    }
  }

  return scrubbed;
}
