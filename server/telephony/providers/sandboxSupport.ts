/**
 * Provider Sandbox Support
 * 
 * Manages the distinction between:
 * - Demo Provider (in-process simulation, no external dependencies)
 * - Provider Sandbox (real provider API but with test credentials/numbers)
 * - Production (real provider API with live credentials)
 * 
 * Sandbox providers use the same adapter as production but with:
 * - Test/sandbox credentials
 * - Test phone numbers
 * - Mock webhooks (optional)
 * - Lower rate limits
 * - No actual charges
 */

import type { AppMode } from "../../../../shared/contracts";

/**
 * Provider environment type.
 */
export type ProviderEnvironment = "demo" | "sandbox" | "production";

/**
 * Configuration for a provider in a specific environment.
 */
export interface ProviderEnvironmentConfig {
  /** Provider identifier */
  providerId: string;
  /** Environment type */
  environment: ProviderEnvironment;
  /** Whether this is a test/sandbox environment */
  isTest: boolean;
  /** API base URL (sandbox may use different endpoint) */
  apiBaseUrl: string;
  /** Whether credentials are configured */
  credentialsConfigured: boolean;
  /** Test phone numbers (sandbox only) */
  testPhoneNumbers?: string[];
  /** Rate limits (sandbox may have lower limits) */
  rateLimits?: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  /** Whether webhooks are configured */
  webhooksConfigured: boolean;
  /** Whether media streaming is configured */
  mediaConfigured: boolean;
}

/**
 * Create a demo environment configuration.
 * Demo providers don't use external APIs.
 */
export function createDemoEnvironmentConfig(providerId: string): ProviderEnvironmentConfig {
  return {
    providerId,
    environment: "demo",
    isTest: true,
    apiBaseUrl: "in-process",
    credentialsConfigured: true, // Demo doesn't need real credentials
    testPhoneNumbers: ["+15551234567", "+15559876543"],
    rateLimits: {
      requestsPerMinute: 1000,
      requestsPerDay: 10000,
    },
    webhooksConfigured: false,
    mediaConfigured: false,
  };
}

/**
 * Create a sandbox environment configuration.
 * Sandbox uses real provider APIs but with test credentials.
 */
export function createSandboxEnvironmentConfig(
  providerId: string,
  apiBaseUrl: string,
  credentialsConfigured: boolean
): ProviderEnvironmentConfig {
  return {
    providerId,
    environment: "sandbox",
    isTest: true,
    apiBaseUrl,
    credentialsConfigured,
    testPhoneNumbers: [], // To be populated by provider-specific setup
    rateLimits: {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    },
    webhooksConfigured: false,
    mediaConfigured: false,
  };
}

/**
 * Create a production environment configuration.
 * Production uses live provider APIs with real credentials.
 */
export function createProductionEnvironmentConfig(
  providerId: string,
  apiBaseUrl: string,
  credentialsConfigured: boolean,
  webhooksConfigured: boolean,
  mediaConfigured: boolean
): ProviderEnvironmentConfig {
  return {
    providerId,
    environment: "production",
    isTest: false,
    apiBaseUrl,
    credentialsConfigured,
    webhooksConfigured,
    mediaConfigured,
  };
}

/**
 * Determine the provider environment based on application mode and configuration.
 */
export function determineProviderEnvironment(
  appMode: AppMode,
  providerIsSimulation: boolean,
  credentialsConfigured: boolean,
  isSandboxMode: boolean
): ProviderEnvironment {
  // Demo provider is always in demo environment
  if (providerIsSimulation) {
    return "demo";
  }

  // In demo app mode, non-simulation providers are in sandbox
  if (appMode === "demo") {
    return "sandbox";
  }

  // In production app mode, check if sandbox mode is explicitly enabled
  if (isSandboxMode) {
    return "sandbox";
  }

  // Otherwise, production
  return "production";
}

/**
 * Validate that a provider configuration is appropriate for its environment.
 */
export function validateEnvironmentConfig(
  config: ProviderEnvironmentConfig,
  appMode: AppMode
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Demo environment
  if (config.environment === "demo") {
    // Demo doesn't need real credentials
    return { valid: true, errors: [] };
  }

  // Sandbox environment
  if (config.environment === "sandbox") {
    if (!config.credentialsConfigured) {
      errors.push("Sandbox environment requires credentials (test credentials are acceptable)");
    }
    return { valid: errors.length === 0, errors };
  }

  // Production environment
  if (config.environment === "production") {
    if (appMode !== "production") {
      errors.push("Production environment requires APP_MODE=production");
    }
    if (!config.credentialsConfigured) {
      errors.push("Production environment requires credentials");
    }
    if (!config.webhooksConfigured) {
      errors.push("Production environment requires webhook configuration");
    }
    return { valid: errors.length === 0, errors };
  }

  errors.push(`Unknown environment: ${config.environment}`);
  return { valid: false, errors };
}

/**
 * Get a human-readable label for a provider environment.
 */
export function getEnvironmentLabel(environment: ProviderEnvironment): string {
  const labels: Record<ProviderEnvironment, string> = {
    demo: "Demo (Simulation)",
    sandbox: "Sandbox (Test)",
    production: "Production (Live)",
  };
  return labels[environment];
}

/**
 * Check if a provider environment allows actual phone calls.
 */
export function environmentAllowsCalls(environment: ProviderEnvironment): boolean {
  return environment === "production";
}

/**
 * Check if a provider environment requires real credentials.
 */
export function environmentRequiresCredentials(environment: ProviderEnvironment): boolean {
  return environment === "sandbox" || environment === "production";
}

/**
 * Create a summary of environment configuration (safe for logging).
 */
export function summarizeEnvironmentConfig(
  config: ProviderEnvironmentConfig
): Record<string, string | number | boolean> {
  return {
    providerId: config.providerId,
    environment: config.environment,
    isTest: config.isTest,
    apiBaseUrl: config.apiBaseUrl,
    credentialsConfigured: config.credentialsConfigured,
    webhooksConfigured: config.webhooksConfigured,
    mediaConfigured: config.mediaConfigured,
    testPhoneNumbersCount: config.testPhoneNumbers?.length ?? 0,
  };
}
