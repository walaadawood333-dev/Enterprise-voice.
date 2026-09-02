/**
 * Provider Activation Gate
 * 
 * Enforces strict requirements before a provider can be activated in production.
 * A provider must pass ALL checks before activation is allowed.
 * 
 * Activation Requirements:
 * 1. Provider is certified (or demo provider in demo mode)
 * 2. Credentials are configured
 * 3. Health check is healthy
 * 4. Required capabilities are available
 * 5. Production environment is explicitly enabled
 * 
 * If any check fails, activation is rejected with a detailed diagnostic.
 */

import type { AppMode, TelephonyCapabilities } from "../../../../shared/contracts";
import type { TelephonyProvider } from "../provider";
import type { ProviderHealthCheckResult } from "./base/ProductionTelephonyProviderBase";
import type { ProviderCertification } from "./certificationChecklist";
import { isProviderCertified } from "./certificationChecklist";
import type { ProviderErrorCode } from "./errorNormalizer";

/**
 * Result of an activation gate check.
 */
export interface ActivationGateResult {
  /** Whether activation is allowed */
  allowed: boolean;
  /** Individual check results */
  checks: ActivationCheck[];
  /** Failure reason (if not allowed) */
  failureReason?: string;
  /** Failure error code (if not allowed) */
  failureCode?: ProviderErrorCode;
  /** Diagnostic information (safe for logging) */
  diagnostics: Record<string, string | number | boolean>;
  /** Timestamp */
  timestamp: string;
}

/**
 * Individual activation check result.
 */
export interface ActivationCheck {
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
 * Configuration for activation gate.
 */
export interface ActivationGateConfig {
  /** Provider instance */
  provider: TelephonyProvider;
  /** Provider certification record */
  certification: ProviderCertification;
  /** Whether credentials are configured */
  credentialsConfigured: boolean;
  /** Latest health check result */
  healthCheck: ProviderHealthCheckResult;
  /** Required capabilities */
  requiredCapabilities: (keyof TelephonyCapabilities)[];
  /** Application mode */
  appMode: AppMode;
  /** Whether production mode is explicitly enabled */
  productionEnabled: boolean;
}

/**
 * Run the activation gate checks.
 * 
 * @param config - Activation gate configuration
 * @returns Activation gate result
 */
export function checkActivationGate(config: ActivationGateConfig): ActivationGateResult {
  const checks: ActivationCheck[] = [];
  const diagnostics: Record<string, string | number | boolean> = {
    providerId: config.provider.info.id,
    simulation: config.provider.info.simulation,
    appMode: config.appMode,
  };
  const timestamp = new Date().toISOString();

  // Check 1: Provider is certified (or demo in demo mode)
  const certCheck = checkCertification(config);
  checks.push(certCheck);
  diagnostics.certificationComplete = certCheck.passed;
  if (!certCheck.passed) {
    return {
      allowed: false,
      checks,
      failureReason: certCheck.detail,
      failureCode: certCheck.errorCode,
      diagnostics,
      timestamp,
    };
  }

  // Check 2: Credentials are configured
  const credsCheck = checkCredentials(config);
  checks.push(credsCheck);
  diagnostics.credentialsConfigured = credsCheck.passed;
  if (!credsCheck.passed) {
    return {
      allowed: false,
      checks,
      failureReason: credsCheck.detail,
      failureCode: credsCheck.errorCode,
      diagnostics,
      timestamp,
    };
  }

  // Check 3: Health check is healthy
  const healthCheck = checkHealth(config);
  checks.push(healthCheck);
  diagnostics.healthStatus = config.healthCheck.status;
  diagnostics.healthLatencyMs = config.healthCheck.latencyMs;
  if (!healthCheck.passed) {
    return {
      allowed: false,
      checks,
      failureReason: healthCheck.detail,
      failureCode: healthCheck.errorCode,
      diagnostics,
      timestamp,
    };
  }

  // Check 4: Required capabilities are available
  const capsCheck = checkCapabilities(config);
  checks.push(capsCheck);
  diagnostics.capabilitiesAvailable = capsCheck.passed;
  if (!capsCheck.passed) {
    return {
      allowed: false,
      checks,
      failureReason: capsCheck.detail,
      failureCode: capsCheck.errorCode,
      diagnostics,
      timestamp,
    };
  }

  // Check 5: Production environment is explicitly enabled
  const prodCheck = checkProductionEnabled(config);
  checks.push(prodCheck);
  diagnostics.productionEnabled = prodCheck.passed;
  if (!prodCheck.passed) {
    return {
      allowed: false,
      checks,
      failureReason: prodCheck.detail,
      failureCode: prodCheck.errorCode,
      diagnostics,
      timestamp,
    };
  }

  // All checks passed — activation allowed
  return {
    allowed: true,
    checks,
    diagnostics,
    timestamp,
  };
}

/**
 * Check 1: Provider is certified
 */
function checkCertification(config: ActivationGateConfig): ActivationCheck {
  // Demo providers in demo mode don't need certification
  if (config.provider.info.simulation && config.appMode === "demo") {
    return {
      name: "Certification",
      passed: true,
      detail: "Demo provider in demo mode — certification not required",
    };
  }

  // Production providers must be certified
  if (!isProviderCertified(config.certification)) {
    const completion = config.certification.completionPercentage;
    return {
      name: "Certification",
      passed: false,
      detail: `Provider certification is incomplete (${completion}% complete)`,
      errorCode: "TELEPHONY_CONFIGURATION_INVALID",
    };
  }

  return {
    name: "Certification",
    passed: true,
    detail: "Provider is fully certified",
  };
}

/**
 * Check 2: Credentials are configured
 */
function checkCredentials(config: ActivationGateConfig): ActivationCheck {
  // Demo providers don't need credentials
  if (config.provider.info.simulation) {
    return {
      name: "Credentials",
      passed: true,
      detail: "Demo provider — credentials not required",
    };
  }

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
 * Check 3: Health check is healthy
 */
function checkHealth(config: ActivationGateConfig): ActivationCheck {
  if (config.healthCheck.status !== "healthy") {
    return {
      name: "Health Check",
      passed: false,
      detail: `Provider health check failed: ${config.healthCheck.detail}`,
      errorCode: "TELEPHONY_PROVIDER_UNAVAILABLE",
    };
  }

  return {
    name: "Health Check",
    passed: true,
    detail: `Provider is healthy (latency: ${config.healthCheck.latencyMs}ms)`,
  };
}

/**
 * Check 4: Required capabilities are available
 */
function checkCapabilities(config: ActivationGateConfig): ActivationCheck {
  const provider = config.provider;
  const caps = provider.info.capabilities;

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
 * Check 5: Production environment is explicitly enabled
 */
function checkProductionEnabled(config: ActivationGateConfig): ActivationCheck {
  // Demo mode doesn't need production enabled
  if (config.appMode === "demo") {
    return {
      name: "Production Enabled",
      passed: true,
      detail: "Demo mode — production enablement not required",
    };
  }

  // Production mode requires explicit enablement
  if (!config.productionEnabled) {
    return {
      name: "Production Enabled",
      passed: false,
      detail: "Production mode is not explicitly enabled",
      errorCode: "TELEPHONY_CONFIGURATION_INVALID",
    };
  }

  return {
    name: "Production Enabled",
    passed: true,
    detail: "Production mode is explicitly enabled",
  };
}

/**
 * Create a detailed activation gate diagnostic report.
 * Safe for logging and displaying to operators.
 */
export function createActivationDiagnostic(result: ActivationGateResult): string {
  const lines: string[] = [
    `=== Provider Activation Gate ===`,
    `Provider: ${result.diagnostics.providerId}`,
    `Allowed: ${result.allowed}`,
    `Timestamp: ${result.timestamp}`,
    ``,
    `Checks:`,
  ];

  for (const check of result.checks) {
    const status = check.passed ? "✓" : "✗";
    lines.push(`  ${status} ${check.name}: ${check.detail}`);
  }

  if (!result.allowed && result.failureReason) {
    lines.push(``, `Failure: ${result.failureReason}`);
    if (result.failureCode) {
      lines.push(`Error Code: ${result.failureCode}`);
    }
  }

  lines.push(``, `Diagnostics:`);
  for (const [key, value] of Object.entries(result.diagnostics)) {
    lines.push(`  ${key}: ${value}`);
  }

  return lines.join("\n");
}
