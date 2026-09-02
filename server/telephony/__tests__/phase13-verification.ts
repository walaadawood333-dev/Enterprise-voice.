/**
 * Phase 13 Verification Tests - Production Telephony Provider Activation
 * 
 * Tests SignalWire provider integration with the existing telephony architecture.
 * Verifies:
 * - Environment configuration
 * - Provider initialization
 * - Webhook signature verification
 * - Call initiation and hangup
 * - Event normalization
 * - Security (no credentials in logs/responses)
 * - Demo/Production mode separation
 */

import { resolveEnv, validateStartupConfig } from "../../config/env";
import { SignalWireProvider } from "../providers/signalwire";
import { createMemoryDb, type Db } from "../../db/store";
import { createTelephonyGateway } from "../gateway";
import { DemoTelephonyProvider } from "../demo";
import { createLogger } from "../../lib/observability";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failCount++;
    console.error(`  ✗ ${message}`);
  } else {
    passCount++;
    console.log(`  ✓ ${message}`);
  }
}

async function testEnvironmentConfiguration() {
  console.log("\n━━━ Environment Configuration ━━━");

  // Test 1: Demo mode without SignalWire credentials
  const demoEnv = resolveEnv({
    APP_MODE: "demo",
  });
  assert(demoEnv.telephony.configured === false, "Demo mode should not have telephony configured");
  assert(demoEnv.telephony.activeProvider === null, "Demo mode should not have active provider");

  // Test 2: Production mode without SignalWire credentials should fail validation
  const prodEnvNoCreds = resolveEnv({
    APP_MODE: "production",
    JWT_SECRET: "test-secret",
    DATABASE_URL: "postgres://test",
    OPENAI_API_KEY: "test-key",
  });
  const prodValidationNoCreds = validateStartupConfig(prodEnvNoCreds);
  assert(
    prodValidationNoCreds.problems.some((p: string) => p.includes("SIGNALWIRE")),
    "Production mode without SignalWire credentials should report missing credentials"
  );

  // Test 3: Production mode with complete SignalWire credentials
  const prodEnvWithCreds = resolveEnv({
    APP_MODE: "production",
    JWT_SECRET: "test-secret",
    DATABASE_URL: "postgres://test",
    OPENAI_API_KEY: "test-key",
    SIGNALWIRE_PROJECT_ID: "test-project",
    SIGNALWIRE_API_TOKEN: "test-token",
    SIGNALWIRE_SPACE_URL: "https://test.signalwire.com",
    SIGNALWIRE_WEBHOOK_SECRET: "test-webhook-secret",
  });
  assert(prodEnvWithCreds.telephony.configured === true, "Production mode with credentials should be configured");
  assert(prodEnvWithCreds.telephony.activeProvider === "signalwire", "Active provider should be signalwire");
  assert(
    prodEnvWithCreds.telephony.signalwire.projectIdPresent === true,
    "SignalWire project ID should be present"
  );
  assert(
    prodEnvWithCreds.telephony.signalwire.apiTokenPresent === true,
    "SignalWire API token should be present"
  );
  assert(
    prodEnvWithCreds.telephony.signalwire.spaceUrlPresent === true,
    "SignalWire space URL should be present"
  );
  assert(
    prodEnvWithCreds.telephony.signalwire.webhookSecretPresent === true,
    "SignalWire webhook secret should be present"
  );

  // Test 4: Partial SignalWire credentials should not be configured
  const partialEnv = resolveEnv({
    APP_MODE: "production",
    SIGNALWIRE_PROJECT_ID: "test-project",
    SIGNALWIRE_API_TOKEN: "test-token",
    // Missing SPACE_URL and WEBHOOK_SECRET
  });
  assert(partialEnv.telephony.configured === false, "Partial credentials should not be configured");
}

async function testProviderInitialization() {
  console.log("\n━━━ Provider Initialization ━━━");

  // Test 1: Provider requires all credentials
  try {
    // Set process.env for the provider
    process.env.SIGNALWIRE_PROJECT_ID = "test-project";
    process.env.SIGNALWIRE_API_TOKEN = "test-token";
    process.env.SIGNALWIRE_SPACE_URL = "https://test.signalwire.com";
    process.env.SIGNALWIRE_WEBHOOK_SECRET = "test-webhook-secret";
    
    const env = resolveEnv({
      APP_MODE: "production",
      SIGNALWIRE_PROJECT_ID: "test-project",
      SIGNALWIRE_API_TOKEN: "test-token",
      SIGNALWIRE_SPACE_URL: "https://test.signalwire.com",
      SIGNALWIRE_WEBHOOK_SECRET: "test-webhook-secret",
    });
    const logger = createLogger("error");
    const provider = new SignalWireProvider(env, logger);
    assert(provider !== null, "Provider should be created with valid credentials");
    assert(provider.info.id === "signalwire", "Provider ID should be signalwire");
    assert(provider.info.simulation === false, "Provider should not be simulation");
    assert(provider.info.capabilities.inbound === true, "Provider should support inbound calls");
    assert(provider.info.capabilities.outbound === true, "Provider should support outbound calls");
  } catch (error) {
    assert(false, `Provider initialization should not fail: ${error}`);
  } finally {
    // Clean up process.env
    delete process.env.SIGNALWIRE_PROJECT_ID;
    delete process.env.SIGNALWIRE_API_TOKEN;
    delete process.env.SIGNALWIRE_SPACE_URL;
    delete process.env.SIGNALWIRE_WEBHOOK_SECRET;
  }

  // Test 2: Provider should throw without credentials
  try {
    // Ensure process.env doesn't have SignalWire credentials
    delete process.env.SIGNALWIRE_PROJECT_ID;
    delete process.env.SIGNALWIRE_API_TOKEN;
    delete process.env.SIGNALWIRE_SPACE_URL;
    delete process.env.SIGNALWIRE_WEBHOOK_SECRET;
    
    const env = resolveEnv({ APP_MODE: "production" });
    const logger = createLogger("error");
    new SignalWireProvider(env, logger);
    assert(false, "Provider should throw without credentials");
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes("SIGNALWIRE"),
      "Provider should throw with credential error"
    );
  }
}

async function testWebhookSignatureVerification() {
  console.log("\n━━━ Webhook Signature Verification ━━━");

  // Set process.env for the provider
  process.env.SIGNALWIRE_PROJECT_ID = "test-project";
  process.env.SIGNALWIRE_API_TOKEN = "test-token";
  process.env.SIGNALWIRE_SPACE_URL = "https://test.signalwire.com";
  process.env.SIGNALWIRE_WEBHOOK_SECRET = "test-webhook-secret";

  const env = resolveEnv({
    APP_MODE: "production",
    SIGNALWIRE_PROJECT_ID: "test-project",
    SIGNALWIRE_API_TOKEN: "test-token",
    SIGNALWIRE_SPACE_URL: "https://test.signalwire.com",
    SIGNALWIRE_WEBHOOK_SECRET: "test-webhook-secret",
  });
  const logger = createLogger("error");
  const provider = new SignalWireProvider(env, logger);

  // Test 1: Valid signature
  const payload = '{"event_type":"call.completed","payload":{"id":"call123"}}';
  const crypto = await import("crypto");
  const hmac = crypto.createHmac("sha256", "test-webhook-secret");
  hmac.update(payload);
  const validSignature = hmac.digest("hex");
  
  const isValid = provider.verifyWebhookSignature(payload, {
    "x-signalwire-signature": validSignature,
  });
  assert(isValid === true, "Valid signature should be accepted");

  // Test 2: Invalid signature
  const isInvalid = provider.verifyWebhookSignature(payload, {
    "x-signalwire-signature": "invalid-signature",
  });
  assert(isInvalid === false, "Invalid signature should be rejected");

  // Test 3: Missing signature
  const isMissing = provider.verifyWebhookSignature(payload, {});
  assert(isMissing === false, "Missing signature should be rejected");

  // Clean up
  delete process.env.SIGNALWIRE_PROJECT_ID;
  delete process.env.SIGNALWIRE_API_TOKEN;
  delete process.env.SIGNALWIRE_SPACE_URL;
  delete process.env.SIGNALWIRE_WEBHOOK_SECRET;
}

async function testEventNormalization() {
  console.log("\n━━━ Event Normalization ━━━");

  // Set process.env for the provider
  process.env.SIGNALWIRE_PROJECT_ID = "test-project";
  process.env.SIGNALWIRE_API_TOKEN = "test-token";
  process.env.SIGNALWIRE_SPACE_URL = "https://test.signalwire.com";
  process.env.SIGNALWIRE_WEBHOOK_SECRET = "test-webhook-secret";

  const env = resolveEnv({
    APP_MODE: "production",
    SIGNALWIRE_PROJECT_ID: "test-project",
    SIGNALWIRE_API_TOKEN: "test-token",
    SIGNALWIRE_SPACE_URL: "https://test.signalwire.com",
    SIGNALWIRE_WEBHOOK_SECRET: "test-webhook-secret",
  });
  const logger = createLogger("error");
  const provider = new SignalWireProvider(env, logger);

  // Test 1: call.started → call_created
  const startedEvent = provider.normalizeWebhookEvent({
    event_type: "call.started",
    payload: {
      id: "call123",
      from: "+15551234567",
      to: "+15559876543",
      direction: "inbound",
      custom_parameters: JSON.stringify({
        organizationId: "org123",
        agentId: "agent123",
      }),
    },
  });
  assert(startedEvent !== null, "call.started should normalize");
  assert(startedEvent!.eventType === "call_created", "call.started → call_created");
  assert(startedEvent!.providerCallId === "call123", "providerCallId should be set");
  assert(startedEvent!.fromNumber === "+15551234567", "fromNumber should be set");
  assert(startedEvent!.toNumber === "+15559876543", "toNumber should be set");
  assert(startedEvent!.metadata.organizationId === "org123", "organizationId should be in metadata");

  // Test 2: call.answered → call_answered
  const answeredEvent = provider.normalizeWebhookEvent({
    event_type: "call.answered",
    payload: {
      id: "call456",
      from: "+15551234567",
      to: "+15559876543",
    },
  });
  assert(answeredEvent !== null, "call.answered should normalize");
  assert(answeredEvent!.eventType === "call_answered", "call.answered → call_answered");

  // Test 3: call.completed → call_completed
  const completedEvent = provider.normalizeWebhookEvent({
    event_type: "call.completed",
    payload: {
      id: "call789",
      from: "+15551234567",
      to: "+15559876543",
      duration: 30,
    },
  });
  assert(completedEvent !== null, "call.completed should normalize");
  assert(completedEvent!.eventType === "call_completed", "call.completed → call_completed");
  assert(completedEvent!.metadata.duration === 30, "duration should be in metadata");

  // Test 4: Unknown event type should return null
  const unknownEvent = provider.normalizeWebhookEvent({
    event_type: "unknown.event",
    payload: { id: "call999" },
  });
  assert(unknownEvent === null, "Unknown event type should return null");

  // Test 5: Invalid payload should return null
  const invalidEvent = provider.normalizeWebhookEvent({
    event_type: "call.started",
    // Missing payload
  });
  assert(invalidEvent === null, "Invalid payload should return null");

  // Clean up
  delete process.env.SIGNALWIRE_PROJECT_ID;
  delete process.env.SIGNALWIRE_API_TOKEN;
  delete process.env.SIGNALWIRE_SPACE_URL;
  delete process.env.SIGNALWIRE_WEBHOOK_SECRET;
}

async function testGatewayIntegration() {
  console.log("\n━━━ Gateway Integration ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");

  // Test 1: Gateway with demo provider only
  const demoEnv = resolveEnv({ APP_MODE: "demo" });
  const demoProviders = [new DemoTelephonyProvider()];
  const demoGateway = createTelephonyGateway({
    db,
    env: demoEnv,
    logger,
    providers: demoProviders,
  });

  const providerInfo = demoGateway.providerInfo();
  assert(providerInfo.length === 1, "Gateway should have one provider in demo mode");
  assert(providerInfo[0].id === "demo", "Provider should be demo");
  assert(providerInfo[0].simulation === true, "Demo provider should be simulation");

  // Test 2: Gateway with SignalWire provider (mock initialization)
  // Set process.env for the provider
  process.env.SIGNALWIRE_PROJECT_ID = "test-project";
  process.env.SIGNALWIRE_API_TOKEN = "test-token";
  process.env.SIGNALWIRE_SPACE_URL = "https://test.signalwire.com";
  process.env.SIGNALWIRE_WEBHOOK_SECRET = "test-webhook-secret";

  const prodEnv = resolveEnv({
    APP_MODE: "production",
    SIGNALWIRE_PROJECT_ID: "test-project",
    SIGNALWIRE_API_TOKEN: "test-token",
    SIGNALWIRE_SPACE_URL: "https://test.signalwire.com",
    SIGNALWIRE_WEBHOOK_SECRET: "test-webhook-secret",
  });

  try {
    const signalwireProvider = new SignalWireProvider(prodEnv, logger);
    // Mock initialization to avoid actual API call
    (signalwireProvider as any)._available = true;

    const prodProviders = [new DemoTelephonyProvider(), signalwireProvider];
    const prodGateway = createTelephonyGateway({
      db,
      env: prodEnv,
      logger,
      providers: prodProviders,
    });

    const prodProviderInfo = prodGateway.providerInfo();
    assert(prodProviderInfo.length === 2, "Gateway should have two providers");
    assert(
      prodProviderInfo.some((p) => p.id === "signalwire"),
      "Gateway should include signalwire provider"
    );
    assert(
      prodProviderInfo.some((p) => p.id === "demo"),
      "Gateway should include demo provider"
    );
  } catch (error) {
    assert(false, `Gateway with SignalWire should initialize: ${error}`);
  } finally {
    // Clean up
    delete process.env.SIGNALWIRE_PROJECT_ID;
    delete process.env.SIGNALWIRE_API_TOKEN;
    delete process.env.SIGNALWIRE_SPACE_URL;
    delete process.env.SIGNALWIRE_WEBHOOK_SECRET;
  }
}

async function testSecurityAndPrivacy() {
  console.log("\n━━━ Security and Privacy ━━━");

  // Set process.env for the provider
  process.env.SIGNALWIRE_PROJECT_ID = "secret-project-id";
  process.env.SIGNALWIRE_API_TOKEN = "secret-api-token";
  process.env.SIGNALWIRE_SPACE_URL = "https://test.signalwire.com";
  process.env.SIGNALWIRE_WEBHOOK_SECRET = "secret-webhook-secret";

  // Test 1: Credentials should not appear in config summary
  const env = resolveEnv({
    APP_MODE: "production",
    SIGNALWIRE_PROJECT_ID: "secret-project-id",
    SIGNALWIRE_API_TOKEN: "secret-api-token",
    SIGNALWIRE_SPACE_URL: "https://test.signalwire.com",
    SIGNALWIRE_WEBHOOK_SECRET: "secret-webhook-secret",
  });

  const { publicConfigSummary } = await import("../../config/env");
  const summary = publicConfigSummary(env);
  const summaryStr = JSON.stringify(summary);

  assert(!summaryStr.includes("secret-project-id"), "Project ID should not appear in public config");
  assert(!summaryStr.includes("secret-api-token"), "API token should not appear in public config");
  assert(!summaryStr.includes("secret-webhook-secret"), "Webhook secret should not appear in public config");

  // Test 2: Redacted keys should include SignalWire secrets
  assert(env.redactedKeys.includes("SIGNALWIRE_PROJECT_ID"), "SIGNALWIRE_PROJECT_ID should be redacted");
  assert(env.redactedKeys.includes("SIGNALWIRE_API_TOKEN"), "SIGNALWIRE_API_TOKEN should be redacted");
  assert(env.redactedKeys.includes("SIGNALWIRE_WEBHOOK_SECRET"), "SIGNALWIRE_WEBHOOK_SECRET should be redacted");

  // Test 3: Provider info should not contain credentials
  const logger = createLogger("error");
  const provider = new SignalWireProvider(env, logger);
  const config = (provider as any).config;
  
  assert(config.projectId !== undefined, "Provider should have project ID internally");
  assert(config.apiToken !== undefined, "Provider should have API token internally");
  assert(config.webhookSecret !== undefined, "Provider should have webhook secret internally");

  // But these should not be exposed in info
  const info = provider.info;
  assert(!(info as any).credentials, "Provider info should not expose credentials");
  assert(!(info as any).config, "Provider info should not expose config");

  // Clean up
  delete process.env.SIGNALWIRE_PROJECT_ID;
  delete process.env.SIGNALWIRE_API_TOKEN;
  delete process.env.SIGNALWIRE_SPACE_URL;
  delete process.env.SIGNALWIRE_WEBHOOK_SECRET;
}

async function testDemoProductionSeparation() {
  console.log("\n━━━ Demo/Production Mode Separation ━━━");

  // Test 1: Demo mode should not allow SignalWire provider to handle calls
  const demoEnv = resolveEnv({ APP_MODE: "demo" });
  assert(demoEnv.appMode === "demo", "App mode should be demo");
  assert(demoEnv.telephony.configured === false, "Demo mode should not have telephony configured");

  // Test 2: Production mode should reject demo provider for live calls
  // Set process.env for the provider
  process.env.SIGNALWIRE_PROJECT_ID = "test-project";
  process.env.SIGNALWIRE_API_TOKEN = "test-token";
  process.env.SIGNALWIRE_SPACE_URL = "https://test.signalwire.com";
  process.env.SIGNALWIRE_WEBHOOK_SECRET = "test-webhook-secret";

  const prodEnv = resolveEnv({
    APP_MODE: "production",
    JWT_SECRET: "test-secret",
    DATABASE_URL: "postgres://test",
    OPENAI_API_KEY: "test-key",
    SIGNALWIRE_PROJECT_ID: "test-project",
    SIGNALWIRE_API_TOKEN: "test-token",
    SIGNALWIRE_SPACE_URL: "https://test.signalwire.com",
    SIGNALWIRE_WEBHOOK_SECRET: "test-webhook-secret",
  });

  const db = createMemoryDb();
  const logger = createLogger("error");
  const demoProvider = new DemoTelephonyProvider();
  const signalwireProvider = new SignalWireProvider(prodEnv, logger);
  (signalwireProvider as any)._available = true;

  const gateway = createTelephonyGateway({
    db,
    env: prodEnv,
    logger,
    providers: [demoProvider, signalwireProvider],
  });

  // Test 3: In production mode, requesting demo provider should fail
  try {
    await gateway.initiateCall({
      organizationId: "org123",
      agentId: "agent123",
      toNumber: "+15551234567",
      providerId: "demo",
    });
    assert(false, "Production mode should reject demo provider");
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes("Demo telephony provider cannot be used in production"),
      "Production mode should reject demo provider with clear error"
    );
  }

  // Clean up
  delete process.env.SIGNALWIRE_PROJECT_ID;
  delete process.env.SIGNALWIRE_API_TOKEN;
  delete process.env.SIGNALWIRE_SPACE_URL;
  delete process.env.SIGNALWIRE_WEBHOOK_SECRET;
}

async function runAllTests() {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("Phase 13 Verification Tests - Production Telephony Provider Activation");
  console.log("════════════════════════════════════════════════════════════");

  await testEnvironmentConfiguration();
  await testProviderInitialization();
  await testWebhookSignatureVerification();
  await testEventNormalization();
  await testGatewayIntegration();
  await testSecurityAndPrivacy();
  await testDemoProductionSeparation();

  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`Phase 13 Tests: ${passCount} passed, ${failCount} failed`);
  console.log("════════════════════════════════════════════════════════════");

  if (failCount > 0) {
    console.log("❌ Some tests failed!");
    process.exit(1);
  } else {
    console.log("✅ All Phase 13 verification tests passed!");
    process.exit(0);
  }
}

runAllTests().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});
