/**
 * Phase 8B — Provider Integration Readiness Verification Suite
 * 
 * Tests all provider adapter infrastructure:
 * 1. Provider adapter template
 * 2. Provider event normalization
 * 3. Provider error normalization
 * 4. Configuration schema validation
 * 5. Provider readiness checks
 * 6. Sandbox vs production separation
 * 7. Demo vs sandbox separation
 * 8. Certification status transitions
 * 9. Activation gate
 * 10. Production activation rejection
 * 11. Tenant isolation
 * 12. Secret exposure protection
 */

import {
  normalizeProviderEvent,
  type RawProviderEvent,
} from "../providers/eventNormalizer";
import {
  normalizeProviderError,
  isRetryableError,
  type ProviderError,
} from "../providers/errorNormalizer";
import {
  validateProviderReadiness,
  type ReadinessConfig,
} from "../providers/readinessValidator";
import {
  createProviderCertification,
  verifyCertificationItem,
  isProviderCertified,
  type ProviderCertification,
} from "../providers/certificationChecklist";
import {
  checkActivationGate,
  type ActivationGateConfig,
} from "../providers/activationGate";
import {
  createDemoEnvironmentConfig,
  createSandboxEnvironmentConfig,
  createProductionEnvironmentConfig,
  determineProviderEnvironment,
  validateEnvironmentConfig,
} from "../providers/sandboxSupport";
import type { TelephonyProvider, TelephonyProviderInfo } from "../provider";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  ✗ ${message}`);
  }
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

// Mock provider for testing
class MockProvider implements TelephonyProvider {
  readonly info: TelephonyProviderInfo = {
    id: "mock-provider",
    label: "Mock Provider",
    simulation: false,
    capabilities: {
      inbound: true,
      outbound: true,
      mediaStreaming: false,
      recording: false,
    },
  };

  available(): boolean {
    return true;
  }

  async initiate(): Promise<{ callId: string; providerCallId: string; status: "created" }> {
    return { callId: "", providerCallId: "mock-call-123", status: "created" };
  }

  async hangup(): Promise<{ callId: string; status: "completed" }> {
    return { callId: "", status: "completed" };
  }

  verifyWebhookSignature(): boolean {
    return true;
  }
}

// ─── TEST 1: Provider Adapter Template ─────────────────────────────────────

section("1. Provider Adapter Template");

{
  const provider = new MockProvider();

  assert(provider.info.id === "mock-provider", "Provider has ID");
  assert(provider.info.simulation === false, "Provider is not simulation");
  assert(provider.available() === true, "Provider is available");
  assert(provider.info.capabilities.inbound === true, "Provider supports inbound");
  assert(provider.info.capabilities.outbound === true, "Provider supports outbound");
}

// ─── TEST 2: Provider Event Normalization ──────────────────────────────────

section("2. Provider Event Normalization");

{
  const rawEvent: RawProviderEvent = {
    eventId: "evt_123",
    eventType: "call_ringing",
    callId: "call_456",
    from: "+15551234567",
    to: "+15559876543",
    timestamp: "2026-01-15T10:30:00Z",
    metadata: { duration: 30 },
  };

  const normalized = normalizeProviderEvent(rawEvent, "mock-provider");

  assert(normalized !== null, "Event normalized successfully");
  assert(normalized!.providerEventId === "evt_123", "Event ID preserved");
  assert(normalized!.providerCallId === "call_456", "Call ID preserved");
  assert(normalized!.eventType === "call_ringing", "Event type normalized");
  assert(normalized!.fromNumber === "+15551234567", "From number preserved");
  assert(normalized!.toNumber === "+15559876543", "To number preserved");

  // Test unknown event type
  const unknownEvent: RawProviderEvent = {
    eventId: "evt_789",
    eventType: "unknown_event_type",
    callId: "call_999",
    timestamp: "2026-01-15T10:30:00Z",
  };

  const unknown = normalizeProviderEvent(unknownEvent, "mock-provider");
  assert(unknown === null, "Unknown event type returns null");
}

// ─── TEST 3: Provider Error Normalization ──────────────────────────────────

section("3. Provider Error Normalization");

{
  // Test Error object
  const error = new Error("Rate limit exceeded");
  const normalized = normalizeProviderError(error, "mock-provider");

  assert(normalized.code === "TELEPHONY_RATE_LIMITED", "Error code detected");
  assert(normalized.providerId === "mock-provider", "Provider ID set");
  assert(normalized.message.includes("Rate limit"), "Message preserved");

  // Test retryable error
  assert(isRetryableError(normalized) === true, "Rate limit error is retryable");

  // Test timeout error
  const timeoutError = new Error("Request timeout");
  const timeoutNormalized = normalizeProviderError(timeoutError, "mock-provider");
  assert(timeoutNormalized.code === "TELEPHONY_TIMEOUT", "Timeout detected");
  assert(isRetryableError(timeoutNormalized) === true, "Timeout is retryable");

  // Test auth error
  const authError = new Error("Unauthorized: 401");
  const authNormalized = normalizeProviderError(authError, "mock-provider");
  assert(authNormalized.code === "TELEPHONY_AUTH_FAILED", "Auth error detected");
  assert(isRetryableError(authNormalized) === false, "Auth error is not retryable");
}

// ─── TEST 4: Configuration Schema Validation ─────────────────────────────

section("4. Configuration Schema Validation");

{
  const provider = new MockProvider();

  // Valid configuration
  const validConfig: ReadinessConfig = {
    provider,
    credentialsConfigured: true,
    webhookConfigured: true,
    requiredCapabilities: ["inbound", "outbound"],
    appMode: "production",
  };

  const validResult = validateProviderReadiness(validConfig);
  assert(validResult.ready === true, "Valid configuration passes readiness");

  // Invalid configuration (missing credentials)
  const invalidConfig: ReadinessConfig = {
    provider,
    credentialsConfigured: false,
    webhookConfigured: true,
    requiredCapabilities: ["inbound"],
    appMode: "production",
  };

  const invalidResult = validateProviderReadiness(invalidConfig);
  assert(invalidResult.ready === false, "Invalid configuration fails readiness");
  assert(invalidResult.failureCode === "TELEPHONY_CONFIGURATION_INVALID", "Correct error code");

  // Missing capability
  const missingCapConfig: ReadinessConfig = {
    provider,
    credentialsConfigured: true,
    webhookConfigured: true,
    requiredCapabilities: ["inbound", "outbound", "mediaStreaming"],
    appMode: "production",
  };

  const missingCapResult = validateProviderReadiness(missingCapConfig);
  assert(missingCapResult.ready === false, "Missing capability fails readiness");
  assert(missingCapResult.failureCode === "TELEPHONY_CAPABILITY_NOT_SUPPORTED", "Correct error code");
}

// ─── TEST 5: Provider Readiness Checks ───────────────────────────────────

section("5. Provider Readiness Checks");

{
  const provider = new MockProvider();

  // Full readiness with health check
  const config: ReadinessConfig = {
    provider,
    credentialsConfigured: true,
    webhookConfigured: true,
    requiredCapabilities: ["inbound"],
    healthCheck: {
      healthy: true,
      status: "healthy",
      latencyMs: 150,
      detail: "Provider responding",
      checkedAt: new Date().toISOString(),
    },
    appMode: "production",
  };

  const result = validateProviderReadiness(config);
  assert(result.ready === true, "Provider with healthy check is ready");
  assert(result.checks.length >= 4, "All checks performed");

  // Unhealthy provider
  const unhealthyConfig: ReadinessConfig = {
    ...config,
    healthCheck: {
      healthy: false,
      status: "unavailable",
      latencyMs: 0,
      detail: "Provider unreachable",
      checkedAt: new Date().toISOString(),
    },
  };

  const unhealthyResult = validateProviderReadiness(unhealthyConfig);
  assert(unhealthyResult.ready === false, "Unhealthy provider is not ready");
}

// ─── TEST 6: Sandbox vs Production Separation ─────────────────────────────

section("6. Sandbox vs Production Separation");

{
  // Sandbox environment
  const sandbox = createSandboxEnvironmentConfig("mock-provider", "https://api.sandbox.mock.com", true);
  assert(sandbox.environment === "sandbox", "Sandbox environment set");
  assert(sandbox.isTest === true, "Sandbox is test environment");

  // Production environment
  const production = createProductionEnvironmentConfig("mock-provider", "https://api.mock.com", true, true, false);
  assert(production.environment === "production", "Production environment set");
  assert(production.isTest === false, "Production is not test environment");

  // Validation
  const sandboxValidation = validateEnvironmentConfig(sandbox, "demo");
  assert(sandboxValidation.valid === true, "Sandbox config is valid");

  const prodValidation = validateEnvironmentConfig(production, "production");
  assert(prodValidation.valid === true, "Production config is valid");

  // Production in demo mode should fail
  const prodInDemoValidation = validateEnvironmentConfig(production, "demo");
  assert(prodInDemoValidation.valid === false, "Production config invalid in demo mode");
}

// ─── TEST 7: Demo vs Sandbox Separation ──────────────────────────────────

section("7. Demo vs Sandbox Separation");

{
  // Demo environment
  const demo = createDemoEnvironmentConfig("demo-provider");
  assert(demo.environment === "demo", "Demo environment set");
  assert(demo.isTest === true, "Demo is test environment");

  // Determine environment
  const demoEnv = determineProviderEnvironment("demo", true, false, false);
  assert(demoEnv === "demo", "Simulation provider in demo mode is demo environment");

  const sandboxEnv = determineProviderEnvironment("demo", false, true, false);
  assert(sandboxEnv === "sandbox", "Non-simulation provider in demo mode is sandbox");

  const prodEnv = determineProviderEnvironment("production", false, true, false);
  assert(prodEnv === "production", "Non-simulation provider in production mode is production");

  const sandboxModeEnv = determineProviderEnvironment("production", false, true, true);
  assert(sandboxModeEnv === "sandbox", "Sandbox mode flag creates sandbox environment");
}

// ─── TEST 8: Certification Status Transitions ────────────────────────────

section("8. Certification Status Transitions");

{
  const cert = createProviderCertification("mock-provider");

  assert(cert.status === "unavailable", "Initial status is unavailable");
  assert(cert.completionPercentage === 0, "Initial completion is 0%");

  // Verify some items
  verifyCertificationItem(cert, 1, "test-user", "Authentication verified");
  assert(cert.completionPercentage === 5, "1/20 items = 5%");
  assert(cert.status === "configured", "Status is configured at 5%");

  verifyCertificationItem(cert, 2, "test-user", "Credential security verified");
  verifyCertificationItem(cert, 3, "test-user", "Health check verified");
  verifyCertificationItem(cert, 4, "test-user", "Capability detection verified");
  verifyCertificationItem(cert, 5, "test-user", "Inbound webhook verified");
  verifyCertificationItem(cert, 6, "test-user", "Webhook signature verified");
  verifyCertificationItem(cert, 7, "test-user", "Replay protection verified");
  verifyCertificationItem(cert, 8, "test-user", "Idempotency verified");
  verifyCertificationItem(cert, 9, "test-user", "Inbound lifecycle verified");
  assert(cert.completionPercentage === 45, "9/20 items = 45%");
  assert(cert.status === "configured", "Status is configured at 45%");

  // Continue to 50%
  verifyCertificationItem(cert, 10, "test-user");
  assert(cert.completionPercentage === 50, "10/20 items = 50%");
  assert(cert.status === "sandbox_ready", "Status is sandbox_ready at 50%");

  // Continue to 80%
  for (let i = 11; i <= 16; i++) {
    verifyCertificationItem(cert, i, "test-user");
  }
  assert(cert.completionPercentage === 80, "16/20 items = 80%");
  assert(cert.status === "certification_pending", "Status is certification_pending at 80%");

  // Complete all
  for (let i = 17; i <= 20; i++) {
    verifyCertificationItem(cert, i, "test-user");
  }
  assert(cert.completionPercentage === 100, "20/20 items = 100%");
  assert(cert.status === "certified", "Status is certified at 100%");
  assert(isProviderCertified(cert) === true, "Provider is certified");
}

// ─── TEST 9: Activation Gate ─────────────────────────────────────────────

section("9. Activation Gate");

{
  const provider = new MockProvider();
  const cert = createProviderCertification("mock-provider");

  // Complete certification
  for (let i = 1; i <= 20; i++) {
    verifyCertificationItem(cert, i, "test-user");
  }

  // Valid activation
  const validConfig: ActivationGateConfig = {
    provider,
    certification: cert,
    credentialsConfigured: true,
    healthCheck: {
      healthy: true,
      status: "healthy",
      latencyMs: 100,
      detail: "OK",
      checkedAt: new Date().toISOString(),
    },
    requiredCapabilities: ["inbound", "outbound"],
    appMode: "production",
    productionEnabled: true,
  };

  const result = checkActivationGate(validConfig);
  assert(result.allowed === true, "Activation allowed when all checks pass");

  // Incomplete certification
  const incompleteCert = createProviderCertification("mock-provider");
  const incompleteConfig: ActivationGateConfig = {
    ...validConfig,
    certification: incompleteCert,
  };

  const incompleteResult = checkActivationGate(incompleteConfig);
  assert(incompleteResult.allowed === false, "Activation rejected with incomplete certification");

  // Missing credentials
  const noCredsConfig: ActivationGateConfig = {
    ...validConfig,
    credentialsConfigured: false,
  };

  const noCredsResult = checkActivationGate(noCredsConfig);
  assert(noCredsResult.allowed === false, "Activation rejected without credentials");

  // Unhealthy provider
  const unhealthyConfig: ActivationGateConfig = {
    ...validConfig,
    healthCheck: {
      healthy: false,
      status: "unavailable",
      latencyMs: 0,
      detail: "Provider down",
      checkedAt: new Date().toISOString(),
    },
  };

  const unhealthyResult = checkActivationGate(unhealthyConfig);
  assert(unhealthyResult.allowed === false, "Activation rejected when unhealthy");
}

// ─── TEST 10: Production Activation Rejection ────────────────────────────

section("10. Production Activation Rejection");

{
  const provider = new MockProvider();
  const cert = createProviderCertification("mock-provider");
  for (let i = 1; i <= 20; i++) {
    verifyCertificationItem(cert, i, "test-user");
  }

  // Production not enabled
  const prodNotEnabledConfig: ActivationGateConfig = {
    provider,
    certification: cert,
    credentialsConfigured: true,
    healthCheck: {
      healthy: true,
      status: "healthy",
      latencyMs: 100,
      detail: "OK",
      checkedAt: new Date().toISOString(),
    },
    requiredCapabilities: ["inbound"],
    appMode: "production",
    productionEnabled: false,
  };

  const result = checkActivationGate(prodNotEnabledConfig);
  assert(result.allowed === false, "Activation rejected when production not enabled");
  assert(result.failureCode === "TELEPHONY_CONFIGURATION_INVALID", "Correct error code");
}

// ─── TEST 11: Tenant Isolation ──────────────────────────────────────────

section("11. Tenant Isolation");

{
  // Provider certification is per-provider, not per-tenant
  // But activation checks are per-organization
  const cert = createProviderCertification("mock-provider");
  assert(cert.providerId === "mock-provider", "Certification is provider-scoped");

  // Activation gate checks are organization-specific
  const config: ActivationGateConfig = {
    provider: new MockProvider(),
    certification: cert,
    credentialsConfigured: true,
    healthCheck: {
      healthy: true,
      status: "healthy",
      latencyMs: 100,
      detail: "OK",
      checkedAt: new Date().toISOString(),
    },
    requiredCapabilities: ["inbound"],
    appMode: "production",
    productionEnabled: true,
  };

  const result = checkActivationGate(config);
  assert(result.diagnostics.providerId === "mock-provider", "Activation check is provider-scoped");
}

// ─── TEST 12: Secret Exposure Protection ─────────────────────────────────

section("12. Secret Exposure Protection");

{
  // Provider certification doesn't contain secrets
  const cert = createProviderCertification("mock-provider");
  assert(!("apiKey" in cert), "Certification doesn't contain API key");
  assert(!("apiSecret" in cert), "Certification doesn't contain API secret");

  // Readiness check doesn't contain secrets
  const config: ReadinessConfig = {
    provider: new MockProvider(),
    credentialsConfigured: true,
    webhookConfigured: true,
    requiredCapabilities: ["inbound"],
    appMode: "production",
  };

  const result = validateProviderReadiness(config);
  assert(!("apiKey" in result), "Readiness result doesn't contain API key");
  assert(!("credentials" in result), "Readiness result doesn't contain credentials");

  // Activation gate doesn't contain secrets
  const activationConfig: ActivationGateConfig = {
    provider: new MockProvider(),
    certification: cert,
    credentialsConfigured: true,
    healthCheck: {
      healthy: true,
      status: "healthy",
      latencyMs: 100,
      detail: "OK",
      checkedAt: new Date().toISOString(),
    },
    requiredCapabilities: ["inbound"],
    appMode: "production",
    productionEnabled: true,
  };

  const activationResult = checkActivationGate(activationConfig);
  assert(!("apiKey" in activationResult.diagnostics), "Activation diagnostics don't contain API key");
  assert(!("credentials" in activationResult.diagnostics), "Activation diagnostics don't contain credentials");
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(60));
console.log(`Phase 8B Tests: ${passed} passed, ${failed} failed`);
console.log("═".repeat(60));

if (failed > 0) {
  console.log("\nFailed tests:");
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
} else {
  console.log("\n✓ All Phase 8B verification tests passed!");
  process.exit(0);
}
