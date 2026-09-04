/**
 * Provider Readiness Validation Pipeline
 * 
 * Validates that a provider is ready for production activation.
 * Checks are performed in order, and all must pass for activation.
 * 
 * Pipeline:
 * 1. Configuration Valid
 * 2. Credentials Present
 * 3. Health Check Successful
 * 4. Webhook Ready
 * 5. Required Capabilities Available
 * 6. Provider Eligible
 * 7. Provider ACTIVE
 */

import type { TelephonyCapabilities, AppMode } from "../../../shared/contracts";
import type { TelephonyProvider } from "../provider";
import type { ProviderHealthCheckResult } from "./base/ProductionTelephonyProviderBase";
import type { ProviderErrorCode } from "./errorNormalizer";

/**
 * Result of a readiness check.
 */
export interface ReadinessCheckResult {
  /** Overall readiness status */
  ready: boolean;
  /** Individual check results */
  checks: ReadinessCheck[];
  /** Failure reason (if not ready) */
  failureReason?: string;
  /** Failure error code (if not ready) */
  failureCode?: ProviderErrorCode;
  /** Timestamp */
  timestamp: string;
}

/**
 * Individual readiness check result.
 */
export interface ReadinessCheck {
  /** Check name */
  name: string;
  /** Whether the check passed */
  passed: boolean;
  /** Check details */
  detail: string;
  /** Error code (if failed) */
  errorCode?: ProviderErrorCode;
}

/**
 * Configuration required for readiness validation.
 */
export interface ReadinessConfig {
  /** Provider instance */
  provider: TelephonyProvider;
  /** Whether credentials are configured (presence check only) */
  credentialsConfigured: boolean;
  /** Whether webhook is configured */
  webhookConfigured: boolean;
  /** Required capabilities for this provider to be useful */
  requiredCapabilities: (keyof TelephonyCapabilities)[];
  /** Health check result (if available) */
  healthCheck?: ProviderHealthCheckResult;
  /** Application mode */
  appMode: AppMode;
}

/**
 * Run the full readiness validation pipeline.
 * 
 * @param config - Readiness configuration
 * @returns Readiness check result
 */
export function validateProviderReadiness(config: ReadinessConfig): ReadinessCheckResult {
  const checks: ReadinessCheck[] = [];
  const timestamp = new Date().toISOString();

  // Check 1: Configuration Valid
  const configCheck = checkConfiguration(config);
  checks.push(configCheck);
  if (!configCheck.passed) {
    return {
      ready: false,
      checks,
      failureReason: configCheck.detail,
      failureCode: configCheck.errorCode,
      timestamp,
    };
  }

  // Check 2: Credentials Present
  const credsCheck = checkCredentials(config);
  checks.push(credsCheck);
  if (!credsCheck.passed) {
    return {
      ready: false,
      checks,
      failureReason: credsCheck.detail,
      failureCode: credsCheck.errorCode,
      timestamp,
    };
  }

  // Check 3: Health Check Successful
  if (config.healthCheck) {
    const healthCheckResult = checkHealth(config.healthCheck);
    checks.push(healthCheckResult);
    if (!healthCheckResult.passed) {
      return {
        ready: false,
        checks,
        failureReason: healthCheckResult.detail,
        failureCode: healthCheckResult.errorCode,
        timestamp,
      };
    }
  } else {
    // Health check not yet performed — not a failure, but note it
    checks.push({
      name: "Health Check",
      passed: true,
      detail: "Health check not yet performed",
    });
  }

  // Check 4: Webhook Ready
  const webhookCheck = checkWebhook(config);
  checks.push(webhookCheck);
  if (!webhookCheck.passed) {
    return {
      ready: false,
      checks,
      failureReason: webhookCheck.detail,
      failureCode: webhookCheck.errorCode,
      timestamp,
    };
  }

  // Check 5: Required Capabilities Available
  const capsCheck = checkCapabilities(config);
  checks.push(capsCheck);
  if (!capsCheck.passed) {
    return {
      ready: false,
      checks,
      failureReason: capsCheck.detail,
      failureCode: capsCheck.errorCode,
      timestamp,
    };
  }

  // Check 6: Provider Eligible (not simulation in production mode)
  const eligibleCheck = checkEligibility(config);
  checks.push(eligibleCheck);
  if (!eligibleCheck.passed) {
    return {
      ready: false,
      checks,
      failureReason: eligibleCheck.detail,
      failureCode: eligibleCheck.errorCode,
      timestamp,
    };
  }

  // All checks passed
  return {
    ready: true,
    checks,
    timestamp,
  };
}

/**
 * Check 1: Configuration Valid
 */
function checkConfiguration(config: ReadinessConfig): ReadinessCheck {
  const provider = config.provider;
  
  // Provider must have valid info
  if (!provider.info.id || !provider.info.label) {
    return {
      name: "Configuration",
      passed: false,
      detail: "Provider configuration is invalid",
      errorCode: "TELEPHONY_CONFIGURATION_INVALID",
    };
  }

  return {
    name: "Configuration",
    passed: true,
    detail: "Provider configuration is valid",
  };
}

/**
 * Check 2: Credentials Present
 */
function checkCredentials(config: ReadinessConfig): ReadinessCheck {
  // Simulation providers don't need credentials
  if (config.provider.info.simulation) {
    return {
      name: "Credentials",
      passed: true,
      detail: "Simulation provider — no credentials required",
    };
  }

  // Production providers must have credentials configured
  if (!config.credentialsConfigured) {
    return {
      name: "Credentials",
      passed: false,
      detail: "Provider credentials are not configured",
      errorCode: "TELEPHONY_CONFIGURATION_INVALID",
    };
  }

  return {
    name: "Credentials",
    passed: true,
    detail: "Provider credentials are configured",
  };
}

/**
 * Check 3: Health Check Successful
 */
function checkHealth(healthCheck: ProviderHealthCheckResult): ReadinessCheck {
  if (!healthCheck.healthy) {
    return {
      name: "Health Check",
      passed: false,
      detail: `Health check failed: ${healthCheck.detail}`,
      errorCode: "TELEPHONY_PROVIDER_UNAVAILABLE",
    };
  }

  return {
    name: "Health Check",
    passed: true,
    detail: `Health check passed (latency: ${healthCheck.latencyMs}ms)`,
  };
}

/**
 * Check 4: Webhook Ready
 */
function checkWebhook(config: ReadinessConfig): ReadinessCheck {
  // Simulation providers don't need webhooks
  if (config.provider.info.simulation) {
    return {
      name: "Webhook",
      passed: true,
      detail: "Simulation provider — webhook not required",
    };
  }

  // Webhook is recommended but not strictly required
  if (!config.webhookConfigured) {
    return {
      name: "Webhook",
      passed: true, // Pass with warning
      detail: "Webhook not configured — inbound calls will not be received",
    };
  }

  return {
    name: "Webhook",
    passed: true,
    detail: "Webhook is configured",
  };
}

/**
 * Check 5: Required Capabilities Available
 */
function checkCapabilities(config: ReadinessConfig): ReadinessCheck {
  const provider = config.provider;
  const caps = provider.info.capabilities as Partial<Record<keyof TelephonyCapabilities, boolean>>;

  // Check each required capability
  const missingCaps: string[] = [];
  for (const cap of config.requiredCapabilities) {
    if (!caps[cap]) {
      missingCaps.push(cap);
    }
  }

  if (missingCaps.length > 0) {
    return {
      name: "Capabilities",
      passed: false,
      detail: `Missing required capabilities: ${missingCaps.join(", ")}`,
      errorCode: "TELEPHONY_CAPABILITY_NOT_SUPPORTED",
    };
  }

  return {
    name: "Capabilities",
    passed: true,
    detail: "All required capabilities are available",
  };
}

/**
 * Check 6: Provider Eligible
 */
function checkEligibility(config: ReadinessConfig): ReadinessCheck {
  // In production mode, simulation providers are not eligible for live calls
  if (config.appMode === "production" && config.provider.info.simulation) {
    return {
      name: "Eligibility",
      passed: false,
      detail: "Simulation providers cannot handle production calls",
      errorCode: "TELEPHONY_CAPABILITY_NOT_SUPPORTED",
    };
  }

  return {
    name: "Eligibility",
    passed: true,
    detail: "Provider is eligible for activation",
  };
}

/**
 * Run readiness checks on multiple providers.
 */
export function validateMultipleProvidersReadiness(
  configs: ReadinessConfig[]
): ReadinessCheckResult[] {
  return configs.map(validateProviderReadiness);
}

/**
 * Check if at least one provider is ready for production.
 */
export function hasProductionReadyProvider(configs: ReadinessConfig[]): boolean {
  return configs.some((config) => {
    const result = validateProviderReadiness(config);
    return result.ready && !config.provider.info.simulation;
  });
}
