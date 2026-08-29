/**
 * External integrations gate.
 *
 * Nothing in Demo Mode is constructed, connected or pinged. Each client is only created when
 * APP_MODE=production AND its own credentials exist — so "configured" always means real, and
 * a missing key produces a disabled entry rather than a half-built object.
 */

import type { ServerEnv } from "../config/env";

export interface DisabledIntegration {
  enabled: false;
  reason: string;
}

export interface CrmClient {
  enabled: boolean;
  readonly name: "crm";
  reason?: string;
  /** Would map a closed session to a CRM activity. Not implemented in this phase. */
  pushActivity?: (input: {
    organizationId: string;
    sessionId: string;
    summary: string;
  }) => Promise<void>;
}

export interface StorageClient {
  enabled: boolean;
  readonly name: "storage";
  reason?: string;
  put?: (key: string, body: string) => Promise<string>;
}

export interface IntegrationRegistry {
  crm: CrmClient | DisabledIntegration;
  storage: StorageClient | DisabledIntegration;
  telephony: DisabledIntegration;
  webhook: DisabledIntegration | { enabled: true; name: "webhook"; signed: boolean };
  summary(): Record<string, string>;
}

const disabled = (reason: string): DisabledIntegration => ({ enabled: false, reason });

/**
 * CRM is never initialised without CRM_API_KEY. Even with a key present the adapter itself is
 * out of scope for this phase, so the registry reports "configured, adapter pending" — and the
 * voice pipeline never calls it.
 */
function createCrm(env: ServerEnv): CrmClient | DisabledIntegration {
  if (env.appMode !== "production") return disabled("Demo Mode does not contact a CRM.");
  if (!env.crm.apiKeyPresent) return disabled("CRM_API_KEY not set.");
  return {
    enabled: false,
    name: "crm",
    reason: "CRM_API_KEY present, but the CRM adapter is not implemented in this phase.",
  };
}

function createStorage(env: ServerEnv): StorageClient | DisabledIntegration {
  if (env.appMode !== "production") return disabled("Demo Mode keeps everything in memory.");
  if (env.storage.driver === "none") return disabled("STORAGE_DRIVER=none.");
  if (!env.storage.bucketPresent || !env.storage.credentialsPresent)
    return disabled("STORAGE_BUCKET_NAME / STORAGE_ACCESS_KEY incomplete.");
  return {
    enabled: false,
    name: "storage",
    reason: "Object storage credentials present, but the storage adapter is not implemented in this phase.",
  };
}

function createWebhook(env: ServerEnv): IntegrationRegistry["webhook"] {
  if (env.appMode !== "production" || !env.webhookUrl) {
    return disabled("No WEBHOOK_URL configured for this mode.");
  }
  return { enabled: true, name: "webhook", signed: env.voice.webhookSecretPresent };
}

export function createIntegrations(env: ServerEnv): IntegrationRegistry {
  const registry: IntegrationRegistry = {
    crm: createCrm(env),
    storage: createStorage(env),
    telephony: disabled("Telephony (PSTN/SIP/SIM) is not implemented in this phase."),
    webhook: createWebhook(env),
    summary: () => ({
      crm: registry.crm.enabled ? "enabled" : "disabled",
      storage: registry.storage.enabled ? "enabled" : "disabled",
      telephony: "disabled",
      webhook: registry.webhook.enabled ? "enabled" : "disabled",
    }),
  };
  return registry;
}
