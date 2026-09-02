/**
 * Telephony Credential Security.
 *
 * Centralizes reading and validation of telephony environment variables.
 * Credentials NEVER appear in:
 *   - API responses
 *   - Browser bundles
 *   - Log output
 *   - Error messages
 *
 * Only the PRESENCE of credentials is exposed to clients.
 */

import type { EnvSource } from "../config/env";
import { REDACTED } from "../lib/observability";

/** Telephony environment variable names (aliases supported). */
const TELEPHONY_ENV_ALIASES = {
  TELEPHONY_PROVIDER: ["TELEPHONY_PROVIDER", "TELEPHONY_PROVIDER_NAME"],
  TELEPHONY_API_KEY: ["TELEPHONY_API_KEY", "TELEPHONY_PROVIDER_API_KEY"],
  TELEPHONY_API_SECRET: ["TELEPHONY_API_SECRET", "TELEPHONY_PROVIDER_API_SECRET"],
  TELEPHONY_WEBHOOK_SECRET: [
    "TELEPHONY_WEBHOOK_SECRET",
    "VOICE_PROVIDER_WEBHOOK_SECRET",
    "CENTERAI_WEBHOOK_SIGNING_SECRET",
  ],
  SIP_SERVER: ["SIP_SERVER", "SIP_URI", "SIP_TRUNK_URI"],
  SIP_USERNAME: ["SIP_USERNAME", "SIP_USER"],
  SIP_PASSWORD: ["SIP_PASSWORD", "SIP_AUTH_PASSWORD"],
} as const;

/** All secret env var names — for redaction in logs and responses. */
export const TELEPHONY_SECRET_ENV_NAMES = [
  "TELEPHONY_API_KEY",
  "TELEPHONY_API_SECRET",
  "TELEPHONY_WEBHOOK_SECRET",
  "SIP_PASSWORD",
] as const;

export interface TelephonyCredentials {
  /** Provider name requested (e.g. "twilio", "signalwire"). */
  providerName: string | null;
  /** Whether an API key is present in the environment. */
  apiKeyPresent: boolean;
  /** Whether an API secret is present in the environment. */
  apiSecretPresent: boolean;
  /** Whether a webhook signing secret is present. */
  webhookSecretPresent: boolean;
  /** Whether SIP server configuration is present. */
  sipConfigured: boolean;
  /** Whether credentials are sufficient for at least one provider. */
  credentialsConfigured: boolean;
}

/**
 * Read telephony credentials from the environment.
 * Only returns presence flags — never values.
 */
export function readTelephonyCredentials(source: EnvSource): TelephonyCredentials {
  const lookup = (aliases: readonly string[]): string | undefined => {
    for (const name of aliases) {
      const raw = source[name];
      if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
    }
    return undefined;
  };

  const providerName = lookup(TELEPHONY_ENV_ALIASES.TELEPHONY_PROVIDER);
  const apiKey = lookup(TELEPHONY_ENV_ALIASES.TELEPHONY_API_KEY);
  const apiSecret = lookup(TELEPHONY_ENV_ALIASES.TELEPHONY_API_SECRET);
  const webhookSecret = lookup(TELEPHONY_ENV_ALIASES.TELEPHONY_WEBHOOK_SECRET);
  const sipServer = lookup(TELEPHONY_ENV_ALIASES.SIP_SERVER);
  const sipUsername = lookup(TELEPHONY_ENV_ALIASES.SIP_USERNAME);
  const sipPassword = lookup(TELEPHONY_ENV_ALIASES.SIP_PASSWORD);

  const credentialsConfigured = Boolean(apiKey || (sipServer && sipUsername && sipPassword));

  return {
    providerName: providerName ?? null,
    apiKeyPresent: Boolean(apiKey),
    apiSecretPresent: Boolean(apiSecret),
    webhookSecretPresent: Boolean(webhookSecret),
    sipConfigured: Boolean(sipServer && sipUsername),
    credentialsConfigured,
  };
}

/**
 * Safe DTO for the Studio — contains ONLY presence flags and configuration status.
 * NEVER includes actual credential values.
 */
export interface TelephonyCredentialSummary {
  providerName: string | null;
  credentialsConfigured: boolean;
  apiKeyPresent: boolean;
  apiSecretPresent: boolean;
  webhookSecretPresent: boolean;
  sipConfigured: boolean;
  /** Human-readable status label for the Studio. */
  statusLabel: "not_configured" | "configured" | "partial";
}

/**
 * Build a safe credential summary for the Studio.
 * Redacts all values — only flags and status labels.
 */
export function buildCredentialSummary(creds: TelephonyCredentials): TelephonyCredentialSummary {
  const statusLabel = !creds.credentialsConfigured
    ? "not_configured"
    : creds.apiKeyPresent && creds.apiSecretPresent
      ? "configured"
      : "partial";

  return {
    providerName: creds.providerName,
    credentialsConfigured: creds.credentialsConfigured,
    apiKeyPresent: creds.apiKeyPresent,
    apiSecretPresent: creds.apiSecretPresent,
    webhookSecretPresent: creds.webhookSecretPresent,
    sipConfigured: creds.sipConfigured,
    statusLabel,
  };
}

/**
 * Read a specific credential value — for server-side use only.
 * NEVER return this value in an API response.
 */
export function readTelephonyApiKey(source: EnvSource): string | null {
  const lookup = (aliases: readonly string[]): string | undefined => {
    for (const name of aliases) {
      const raw = source[name];
      if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
    }
    return undefined;
  };
  return lookup(TELEPHONY_ENV_ALIASES.TELEPHONY_API_KEY) ?? null;
}

/**
 * Read the webhook signing secret — for server-side verification only.
 * NEVER return this value in an API response.
 */
export function readTelephonyWebhookSecret(source: EnvSource): string | null {
  const lookup = (aliases: readonly string[]): string | undefined => {
    for (const name of aliases) {
      const raw = source[name];
      if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
    }
    return undefined;
  };
  return lookup(TELEPHONY_ENV_ALIASES.TELEPHONY_WEBHOOK_SECRET) ?? null;
}

/**
 * Redact telephony credentials from an object before logging.
 * Use this when logging request bodies or metadata that may contain secrets.
 */
export function redactTelephonySecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const isSecret = TELEPHONY_SECRET_ENV_NAMES.some(
      (name) => key.toLowerCase().includes(name.toLowerCase().replace(/_/g, ""))
    );
    result[key] = isSecret ? REDACTED : value;
  }
  return result;
}
