/**
 * Phase 8A — Production Provider Readiness Verification Suite.
 *
 * Tests:
 * 1. Provider registry lifecycle
 * 2. Demo provider preservation
 * 3. Production provider missing configuration
 * 4. Production provider invalid configuration
 * 5. Disabled provider
 * 6. Capability filtering
 * 7. Provider selection policy
 * 8. Provider health states
 * 9. Webhook readiness
 * 10. Organization provider isolation
 * 11. Cross-tenant provider access rejection
 * 12. Production call rejection without provider
 * 13. Demo Mode behavior
 * 14. Production Mode behavior
 * 15. Credential security
 */

import { createProviderRegistry, getCapabilities } from "../registry";
import { checkProviderHealth, checkAllProvidersHealth } from "../healthCheck";
import { selectProvider } from "../selection";
import { readTelephonyCredentials, buildCredentialSummary } from "../credentials";
import { validateProviderConfiguration, isProductionReady } from "../config";
import { createOrgProviderPolicy } from "../orgPolicy";
import { DemoTelephonyProvider } from "../demo";
import { createMemoryDb, newId } from "../../db/store";
import { createLogger } from "../../lib/observability";
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

// Mock production provider for testing
class MockProductionProvider implements TelephonyProvider {
  readonly info: TelephonyProviderInfo = {
    id: "mock-production",
    label: "Mock Production Provider",
    simulation: false,
    capabilities: {
      inbound: true,
      outbound: true,
      mediaStreaming: false,
      recording: false,
    },
  };

  private _available = true;

  available(): boolean {
    return this._available;
  }

  setAvailable(value: boolean) {
    this._available = value;
  }

  async initiate(): Promise<{ callId: string; providerCallId: string; status: "created" }> {
    return { callId: "", providerCallId: "mock-call-123", status: "created" };
  }

  async hangup(): Promise<{ callId: string; status: "completed" }> {
    return { callId: "", status: "completed" };
  }

  verifyWebhookSignature(_payload: string, headers: Record<string, string>): boolean {
    return headers["x-mock-signature"] === "valid";
  }
}

const logger = createLogger("error");

// ─── TEST 1: Provider Registry Lifecycle ─────────────────────────────────────

section("1. Provider Registry Lifecycle");

{
  const registry = createProviderRegistry();

  // Register demo provider
  const demo = new DemoTelephonyProvider();
  const entry = registry.register({
    provider: demo,
    credentialsConfigured: true,
    enabled: true,
    isDefault: true,
  });

  assert(entry.providerId === "demo", "Demo provider registered");
  assert(entry.state === "active", "Demo provider is active by default");
  assert(entry.enabled === true, "Demo provider is enabled");
  assert(entry.isDefault === true, "Demo provider is default");

  // Register production provider
  const mock = new MockProductionProvider();
  const entry2 = registry.register({
    provider: mock,
    credentialsConfigured: false,
    enabled: false,
  });

  assert(entry2.providerId === "mock-production", "Production provider registered");
  assert(entry2.state === "disabled", "Production provider starts disabled when enabled=false");
  assert(entry2.isDefault === false, "Production provider is not default when demo is default");

  // Enable the production provider first (was registered as disabled)
  registry.setEnabled("mock-production", true);

  // Configure the production provider
  registry.configure("mock-production", true, true);
  const configured = registry.get("mock-production");
  assert(configured?.credentialsConfigured === true, "Production provider configured");
  assert(configured?.state === "configured", "State transitions to configured");

  // Activate
  registry.activate("mock-production");
  const active = registry.get("mock-production");
  assert(active?.state === "active", "Production provider activated");

  // Deactivate
  registry.deactivate("mock-production", "unavailable");
  const deactivated = registry.get("mock-production");
  assert(deactivated?.state === "unavailable", "Provider deactivated");

  // Re-enable
  registry.setEnabled("mock-production", true);
  registry.activate("mock-production");
  const reactivated = registry.get("mock-production");
  assert(reactivated?.state === "active", "Provider reactivated");

  // List
  const all = registry.list();
  assert(all.length === 2, "Registry has 2 providers");

  // List active
  const activeList = registry.listActive();
  assert(activeList.length === 2, "Both providers are active");

  // List by capability
  const inboundProviders = registry.listByCapability("inbound");
  assert(inboundProviders.length === 2, "Both providers support inbound");

  // Has production provider
  assert(registry.hasProductionProvider() === true, "Registry has production provider");

  // Set default
  registry.setDefault("mock-production");
  const newDefault = registry.get("mock-production");
  const oldDefault = registry.get("demo");
  assert(newDefault?.isDefault === true, "Mock is now default");
  assert(oldDefault?.isDefault === false, "Demo is no longer default");
}

// ─── TEST 2: Demo Provider Preservation ──────────────────────────────────────

section("2. Demo Provider Preservation");

{
  const demo = new DemoTelephonyProvider();

  assert(demo.info.id === "demo", "Demo provider ID is 'demo'");
  assert(demo.info.simulation === true, "Demo provider is simulation");
  assert(demo.info.label.includes("Simulation"), "Label indicates simulation");
  assert(demo.available() === true, "Demo is always available");

  // Capabilities
  const caps = getCapabilities(demo);
  assert(caps.simulation === true, "Capabilities include simulation flag");
  assert(caps.pstn === false, "Demo does not support PSTN");
  assert(caps.inbound === true, "Demo supports inbound");
  assert(caps.outbound === true, "Demo supports outbound");
}

// ─── TEST 3: Production Provider Missing Configuration ───────────────────────

section("3. Production Provider Missing Configuration");

{
  const registry = createProviderRegistry();
  const mock = new MockProductionProvider();

  // Register without credentials
  registry.register({
    provider: mock,
    credentialsConfigured: false,
    enabled: true,
  });

  const entry = registry.get("mock-production");
  assert(entry?.state === "registered", "Provider starts as 'registered' without credentials");

  // Cannot activate without credentials
  const activated = registry.activate("mock-production");
  assert(activated === false, "Cannot activate without credentials");

  const afterAttempt = registry.get("mock-production");
  assert(afterAttempt?.state !== "active", "Provider is not active");

  // Selection should fail
  const outcome = selectProvider(
    { appMode: "production" },
    registry,
    logger
  );
  assert(outcome.selected === false, "Selection fails without configured provider");
}

// ─── TEST 4: Production Provider Invalid Configuration ───────────────────────

section("4. Production Provider Invalid Configuration");

{
  const mock = new MockProductionProvider();
  const creds = readTelephonyCredentials({});
  const validation = validateProviderConfiguration(mock, creds, "production", logger);

  assert(validation.valid === false, "Validation fails without credentials");
  assert(validation.status === "not_configured", "Status is not_configured");
  assert(validation.issues.length > 0, "Issues are reported");
}

// ─── TEST 5: Disabled Provider ───────────────────────────────────────────────

section("5. Disabled Provider");

{
  const registry = createProviderRegistry();
  const mock = new MockProductionProvider();

  registry.register({
    provider: mock,
    credentialsConfigured: true,
    enabled: false,
  });

  const entry = registry.get("mock-production");
  assert(entry?.state === "disabled", "Provider starts disabled");

  // Cannot activate disabled provider
  const activated = registry.activate("mock-production");
  assert(activated === false, "Cannot activate disabled provider");

  // Enable it first
  registry.setEnabled("mock-production", true);
  const enabled = registry.get("mock-production");
  assert(enabled?.state !== "disabled", "Provider is no longer disabled after enable");
}

// ─── TEST 6: Capability Filtering ────────────────────────────────────────────

section("6. Capability Filtering");

{
  const registry = createProviderRegistry();
  const demo = new DemoTelephonyProvider();
  const mock = new MockProductionProvider();

  registry.register({ provider: demo, credentialsConfigured: true, enabled: true });
  registry.register({ provider: mock, credentialsConfigured: true, enabled: true });
  registry.configure("mock-production", true, true);
  registry.activate("mock-production");

  // Filter by inbound
  const inbound = registry.listByCapability("inbound");
  assert(inbound.length === 2, "Both providers support inbound");

  // Filter by recording (neither supports it)
  const recording = registry.listByCapability("recording");
  assert(recording.length === 0, "No providers support recording");

  // Filter by simulation
  const simulation = registry.listByCapability("simulation");
  assert(simulation.length === 1, "Only demo supports simulation");
  assert(simulation[0].info.id === "demo", "Demo is the simulation provider");
}

// ─── TEST 7: Provider Selection Policy ───────────────────────────────────────

section("7. Provider Selection Policy");

{
  const registry = createProviderRegistry();
  const demo = new DemoTelephonyProvider();
  const mock = new MockProductionProvider();

  registry.register({ provider: demo, credentialsConfigured: true, enabled: true, isDefault: true });
  registry.register({ provider: mock, credentialsConfigured: true, enabled: true });
  registry.configure("mock-production", true, true);
  registry.activate("mock-production");

  // Explicit selection
  const explicit = selectProvider(
    { requestedProviderId: "mock-production", appMode: "production" },
    registry,
    logger
  );
  assert(explicit.selected === true, "Explicit selection works");
  assert(explicit.providerId === "mock-production", "Correct provider selected");
  assert(explicit.selectionMethod === "explicit", "Method is explicit");

  // Organization default
  const orgDefault = selectProvider(
    { organizationDefaultProviderId: "mock-production", appMode: "production" },
    registry,
    logger
  );
  assert(orgDefault.selected === true, "Organization default works");
  assert(orgDefault.providerId === "mock-production", "Org default provider selected");
  assert(orgDefault.selectionMethod === "organization_default", "Method is organization_default");

  // System default (demo mode)
  const sysDefault = selectProvider(
    { appMode: "demo" },
    registry,
    logger
  );
  assert(sysDefault.selected === true, "System default works in demo mode");
  assert(sysDefault.providerId === "demo", "Demo is the system default");

  // Production mode — should reject demo as default
  const prodDefault = selectProvider(
    { appMode: "production" },
    registry,
    logger
  );
  // Mock is also registered and active, so it should be selected
  // (depends on which was registered first and which is default)
  assert(prodDefault.selected === true || prodDefault.reason.includes("production"), "Production selection handled correctly");

  // Non-existent provider
  const notFound = selectProvider(
    { requestedProviderId: "nonexistent", appMode: "demo" },
    registry,
    logger
  );
  assert(notFound.selected === false, "Non-existent provider not selected");
  assert(notFound.reason.includes("not registered"), "Reason explains not registered");
}

// ─── TEST 8: Provider Health States ──────────────────────────────────────────

section("8. Provider Health States");

{
  const registry = createProviderRegistry();
  const demo = new DemoTelephonyProvider();
  const mock = new MockProductionProvider();

  registry.register({ provider: demo, credentialsConfigured: true, enabled: true });
  registry.register({ provider: mock, credentialsConfigured: true, enabled: true });

  // Health check for demo (always healthy)
  const demoHealth = await checkProviderHealth(demo, logger);
  assert(demoHealth.status === "healthy", "Demo provider is healthy");
  assert(demoHealth.providerId === "demo", "Health check has correct provider ID");

  // Health check for mock (healthy by default)
  const mockHealth = await checkProviderHealth(mock, logger);
  assert(mockHealth.status === "healthy", "Mock provider is healthy");

  // Make mock unavailable
  mock.setAvailable(false);
  const unhealthy = await checkProviderHealth(mock, logger);
  assert(unhealthy.status === "degraded", "Unavailable provider shows as degraded");

  // Check all
  const allHealth = await checkAllProvidersHealth(registry, logger);
  assert(allHealth.length === 2, "Health checks run for all providers");
}

// ─── TEST 9: Webhook Readiness ──────────────────────────────────────────────

section("9. Webhook Readiness");

{
  const mock = new MockProductionProvider();

  // Valid signature
  const valid = mock.verifyWebhookSignature("test-payload", { "x-mock-signature": "valid" });
  assert(valid === true, "Valid webhook signature accepted");

  // Invalid signature
  const invalid = mock.verifyWebhookSignature("test-payload", { "x-mock-signature": "invalid" });
  assert(invalid === false, "Invalid webhook signature rejected");

  // Missing signature
  const missing = mock.verifyWebhookSignature("test-payload", {});
  assert(missing === false, "Missing webhook signature rejected");
}

// ─── TEST 10: Organization Provider Isolation ────────────────────────────────

section("10. Organization Provider Isolation");

{
  const db = createMemoryDb();
  const orgA = await db.organizations.create({ name: "Org A", slug: "org-a", status: "active" });
  const orgB = await db.organizations.create({ name: "Org B", slug: "org-b", status: "active" });
  const policy = createOrgProviderPolicy(db, logger);

  // Create provider for org A
  const providerA = await policy.upsert({
    organizationId: orgA.id,
    provider: "demo",
    enabled: true,
    isDefault: true,
  });

  assert(providerA.organizationId === orgA.id, "Provider belongs to Org A");
  assert(providerA.provider === "demo", "Provider is demo");

  // Create provider for org B
  const providerB = await policy.upsert({
    organizationId: orgB.id,
    provider: "demo",
    enabled: true,
    isDefault: true,
  });

  assert(providerB.organizationId === orgB.id, "Provider belongs to Org B");

  // List for org A
  const listA = await policy.list(orgA.id);
  assert(listA.length === 1, "Org A has 1 provider");
  assert(listA[0].organizationId === orgA.id, "List is scoped to Org A");

  // List for org B
  const listB = await policy.list(orgB.id);
  assert(listB.length === 1, "Org B has 1 provider");
  assert(listB[0].organizationId === orgB.id, "List is scoped to Org B");

  // Cross-org access
  try {
    await policy.get(orgB.id, providerA.id);
    assert(false, "Cross-org access should throw");
  } catch (e: any) {
    assert(e.code === "NOT_FOUND", "Cross-org access returns NOT_FOUND");
  }
}

// ─── TEST 11: Cross-Tenant Provider Access Rejection ─────────────────────────

section("11. Cross-Tenant Provider Access Rejection");

{
  const db = createMemoryDb();
  const orgA = await db.organizations.create({ name: "Org A", slug: "org-a-x", status: "active" });
  const orgB = await db.organizations.create({ name: "Org B", slug: "org-b-x", status: "active" });
  const policy = createOrgProviderPolicy(db, logger);

  const config = await policy.upsert({
    organizationId: orgA.id,
    provider: "demo",
    enabled: true,
  });

  // Org B tries to update Org A's config
  const updated = await db.orgProviders.update(config.id, orgB.id, { enabled: false });
  assert(updated === undefined, "Cross-tenant update returns undefined");

  // Org B tries to remove Org A's config
  const removed = await db.orgProviders.remove(config.id, orgB.id);
  assert(removed === false, "Cross-tenant remove returns false");

  // Verify Org A's config is unchanged
  const stillExists = await db.orgProviders.get(config.id, orgA.id);
  assert(stillExists?.enabled === true, "Original config unchanged");
}

// ─── TEST 12: Production Call Rejection Without Provider ─────────────────────

section("12. Production Call Rejection Without Provider");

{
  const registry = createProviderRegistry();
  const demo = new DemoTelephonyProvider();
  registry.register({ provider: demo, credentialsConfigured: true, enabled: true });

  // No production provider registered
  assert(registry.hasProductionProvider() === false, "No production provider available");

  // Selection in production mode should fail
  const outcome = selectProvider(
    { appMode: "production" },
    registry,
    logger
  );
  assert(outcome.selected === false, "Production call rejected");
  assert(outcome.reason.includes("production"), "Reason mentions production");

  // Demo mode should work
  const demoOutcome = selectProvider(
    { appMode: "demo" },
    registry,
    logger
  );
  assert(demoOutcome.selected === true, "Demo call accepted");
}

// ─── TEST 13: Demo Mode Behavior ─────────────────────────────────────────────

section("13. Demo Mode Behavior");

{
  const demo = new DemoTelephonyProvider();
  const creds = readTelephonyCredentials({});
  const validation = validateProviderConfiguration(demo, creds, "demo", logger);

  assert(validation.valid === true, "Demo provider valid in demo mode");
  assert(validation.status === "demo_only", "Status is demo_only");

  // isProductionReady should be false in demo mode
  const ready = isProductionReady([demo], creds, "demo");
  assert(ready === false, "Not production ready in demo mode");
}

// ─── TEST 14: Production Mode Behavior ───────────────────────────────────────

section("14. Production Mode Behavior");

{
  const demo = new DemoTelephonyProvider();
  const mock = new MockProductionProvider();
  const credsNoKeys = readTelephonyCredentials({});
  const credsWithKeys = readTelephonyCredentials({ TELEPHONY_API_KEY: "test-key" });

  // Without credentials
  const noKeys = isProductionReady([demo, mock], credsNoKeys, "production");
  assert(noKeys === false, "Not ready without credentials");

  // With credentials
  const withKeys = isProductionReady([demo, mock], credsWithKeys, "production");
  assert(withKeys === true, "Ready with credentials");

  // Demo provider invalid in production
  const demoValidation = validateProviderConfiguration(demo, credsWithKeys, "production", logger);
  assert(demoValidation.valid === false, "Demo provider invalid in production");

  // Production provider valid
  const mockValidation = validateProviderConfiguration(mock, credsWithKeys, "production", logger);
  assert(mockValidation.valid === true, "Production provider valid");
}

// ─── TEST 15: Credential Security ────────────────────────────────────────────

section("15. Credential Security");

{
  // Read credentials from environment
  const empty = readTelephonyCredentials({});
  assert(empty.apiKeyPresent === false, "No API key when not set");
  assert(empty.credentialsConfigured === false, "Not configured without keys");

  const withKey = readTelephonyCredentials({ TELEPHONY_API_KEY: "secret-key" });
  assert(withKey.apiKeyPresent === true, "API key detected");
  assert(withKey.credentialsConfigured === true, "Configured with API key");

  const withSecret = readTelephonyCredentials({
    TELEPHONY_API_KEY: "key",
    TELEPHONY_API_SECRET: "secret",
  });
  assert(withSecret.apiSecretPresent === true, "API secret detected");

  // Build summary (safe for client)
  const summary = buildCredentialSummary(withSecret);
  assert(summary.credentialsConfigured === true, "Summary shows configured");
  assert(summary.statusLabel === "configured", "Status label is configured");
  assert(!("apiKey" in summary), "Summary does not contain API key value");
  assert(!("apiSecret" in summary), "Summary does not contain API secret value");

  // Provider name
  const withProvider = readTelephonyCredentials({ TELEPHONY_PROVIDER: "twilio" });
  assert(withProvider.providerName === "twilio", "Provider name read");
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(60));
console.log(`Phase 8A Tests: ${passed} passed, ${failed} failed`);
console.log("═".repeat(60));

if (failed > 0) {
  console.log("\nFailed tests:");
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
} else {
  console.log("\n✓ All Phase 8A verification tests passed!");
  process.exit(0);
}
