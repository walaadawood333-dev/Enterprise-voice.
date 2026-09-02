/**
 * Provider Configuration Validation.
 *
 * Validates that a provider is properly configured before it can handle traffic.
 * In APP_MODE=demo, no production credentials are required.
 * In APP_MODE=production, a provider cannot become ACTIVE unless:
 *   - Provider is explicitly configured
 *   - Required credentials exist
 *   - Configuration validates successfully
 *
 * The application fails safely — a misconfigured provider never crashes the platform.
 */

import type { AppMode } from "../../shared/contracts";
import type { Logger } from "../lib/observability";
import type { TelephonyProvider } from "./provider";
import type { TelephonyCredentials } from "./credentials";

export interface ConfigurationValidationResult {
  valid: boolean;
  providerId: string;
  issues: string[];
  /** Human-readable status for the Studio. */
  status: "not_configured" | "configured" | "invalid" | "demo_only";
}

/**
 * Validate a provider's configuration.
 * Does NOT activate the provider — just reports whether it could be activated.
 */
export function validateProviderConfiguration(
  provider: TelephonyProvider,
  credentials: TelephonyCredentials,
  appMode: AppMode,
  logger: Logger
): ConfigurationValidationResult {
  const providerId = provider.info.id;
  const issues: string[] = [];

  // Demo provider is always valid in demo mode.
  if (provider.info.simulation) {
    if (appMode === "demo") {
      return {
        valid: true,
        providerId,
        issues: [],
        status: "demo_only",
      };
    }
    // Simulation provider in production mode is invalid for live calls.
    issues.push("Demo provider cannot handle production calls.");
    return {
      valid: false,
      providerId,
      issues,
      status: "invalid",
    };
  }

  // Production provider validation.
  if (!credentials.credentialsConfigured) {
    issues.push("No telephony credentials configured.");
    if (!credentials.apiKeyPresent) issues.push("TELEPHONY_API_KEY is missing.");
    return {
      valid: false,
      providerId,
      issues,
      status: "not_configured",
    };
  }

  // If a specific provider name is set, check it matches.
  if (credentials.providerName && credentials.providerName !== providerId) {
    logger.warn("provider_configuration_name_mismatch", {
      expected: credentials.providerName,
      actual: providerId,
    });
    // This is a warning, not an error — the provider can still work.
  }

  // Webhook secret is recommended for production.
  if (!credentials.webhookSecretPresent) {
    issues.push("TELEPHONY_WEBHOOK_SECRET is not configured — webhook verification will be limited.");
  }

  logger.info("provider_configuration_validated", {
    providerId,
    valid: true,
    issues: issues.length,
  });

  return {
    valid: true,
    providerId,
    issues,
    status: issues.length > 0 ? "configured" : "configured",
  };
}

/**
 * Validate all registered providers and return a summary.
 */
export function validateAllProviderConfigurations(
  providers: TelephonyProvider[],
  credentials: TelephonyCredentials,
  appMode: AppMode,
  logger: Logger
): ConfigurationValidationResult[] {
  return providers.map((provider) =>
    validateProviderConfiguration(provider, credentials, appMode, logger)
  );
}

/**
 * Determine if the system is ready for production calls.
 * Returns true only when at least one non-simulation provider is fully configured.
 */
export function isProductionReady(
  providers: TelephonyProvider[],
  credentials: TelephonyCredentials,
  appMode: AppMode
): boolean {
  if (appMode !== "production") return false;
  if (!credentials.credentialsConfigured) return false;

  // Check if any non-simulation provider exists.
  return providers.some((p) => !p.info.simulation);
}
