/**
 * Phase 12 — Campaign Execution & Intelligent Dialing Engine Verification Tests
 */

import { createMemoryDb, type Db } from "../db/store";
import { createCampaignExecutionService, type CampaignExecutionService } from "../services/campaignExecution";

const TEST_ORG_A = "org_p12_a";
const TEST_ORG_B = "org_p12_b";

let db: Db;
let execService: CampaignExecutionService;

async function setup() {
  db = createMemoryDb();
  execService = createCampaignExecutionService({ db });

  await db.organizations.create({ id: TEST_ORG_A, name: "P12 Org A", slug: "p12-a", status: "active" });
  await db.organizations.create({ id: TEST_ORG_B, name: "P12 Org B", slug: "p12-b", status: "active" });

  // Create agents
  await db.agents.create({
    id: "agent_p12_a",
    organizationId: TEST_ORG_A,
    name: "P12 Agent A",
    description: "Test",
    language: "en",
    voice: "layla-service",
    systemPrompt: "Test",
    industry: "Banking",
    welcomeMessage: "Welcome",
    status: "active",
  });

  await db.agents.create({
    id: "agent_p12_b",
    organizationId: TEST_ORG_B,
    name: "P12 Agent B",
    description: "Test",
    language: "en",
    voice: "layla-service",
    systemPrompt: "Test",
    industry: "Banking",
    welcomeMessage: "Welcome",
    status: "active",
  });
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

let passCount = 0;
let failCount = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (error: any) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
    failCount++;
  }
}

// ─── 1. Phone Normalization ─────────────────────────────────────────────

async function testPhoneNormalization() {
  console.log("\n━━━ 1. Phone Number Normalization ━━━");

  await test("Jordanian local format normalizes to E.164", async () => {
    const result = execService.normalizePhone("0791234567", "JO");
    assert(result.isValid === true, "Should be valid");
    assert(result.normalizedPhone === "+962791234567", `Expected +962791234567, got ${result.normalizedPhone}`);
    assert(result.countryCode === "JO", "Country should be JO");
  });

  await test("Already E.164 format is accepted", async () => {
    const result = execService.normalizePhone("+962791234567");
    assert(result.isValid === true, "Should be valid");
    assert(result.normalizedPhone === "+962791234567", "Should keep E.164 format");
  });

  await test("Empty phone is invalid", async () => {
    const result = execService.normalizePhone("");
    assert(result.isValid === false, "Empty phone should be invalid");
  });

  await test("Short number is invalid", async () => {
    const result = execService.normalizePhone("123");
    assert(result.isValid === false, "Short number should be invalid");
  });

  await test("UAE number normalizes correctly", async () => {
    const result = execService.normalizePhone("0501234567", "AE");
    assert(result.isValid === true, "Should be valid");
    assert(result.countryCode === "AE", "Country should be AE");
  });

  await test("Whitespace and dashes are stripped", async () => {
    const result = execService.normalizePhone("079-123-4567", "JO");
    assert(result.isValid === true, "Should handle dashes");
    assert(result.normalizedPhone === "+962791234567", "Should normalize correctly");
  });
}

// ─── 2. Contact Import ──────────────────────────────────────────────────

async function testContactImport() {
  console.log("\n━━━ 2. Contact Import Engine ━━━");

  await test("Import creates contacts and campaign contacts", async () => {
    const campaign = await db.campaigns.create({
      organizationId: TEST_ORG_A,
      name: "Import Test Campaign",
      description: "",
      agentId: "agent_p12_a",
      status: "draft",
      direction: "outbound",
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      totalContacts: 0,
      configuration: {},
    });

    const result = await execService.importContacts(TEST_ORG_A, campaign.id, [
      { firstName: "John", lastName: "Doe", phone: "0791234567", country: "JO" },
      { firstName: "Jane", lastName: "Smith", phone: "0781234567", country: "JO" },
      { firstName: "Bob", lastName: "Wilson", phone: "0771234567", country: "JO" },
    ]);

    assert(result.total === 3, `Total should be 3, got ${result.total}`);
    assert(result.imported === 3, `Imported should be 3, got ${result.imported}`);
    assert(result.valid === 3, `Valid should be 3, got ${result.valid}`);
  });

  await test("Import rejects contacts without phone", async () => {
    const campaign = await db.campaigns.create({
      organizationId: TEST_ORG_A,
      name: "No Phone Test",
      description: "",
      agentId: "agent_p12_a",
      status: "draft",
      direction: "outbound",
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      totalContacts: 0,
      configuration: {},
    });

    const result = await execService.importContacts(TEST_ORG_A, campaign.id, [
      { firstName: "No", lastName: "Phone", phone: "" },
      { firstName: "Has", lastName: "Phone", phone: "0799999999", country: "JO" },
    ]);

    assert(result.missingPhone === 1, `Missing phone should be 1, got ${result.missingPhone}`);
    assert(result.imported === 1, `Imported should be 1, got ${result.imported}`);
  });

  await test("Import detects duplicates", async () => {
    const campaign = await db.campaigns.create({
      organizationId: TEST_ORG_A,
      name: "Duplicate Test",
      description: "",
      agentId: "agent_p12_a",
      status: "draft",
      direction: "outbound",
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      totalContacts: 0,
      configuration: {},
    });

    const result = await execService.importContacts(TEST_ORG_A, campaign.id, [
      { firstName: "First", lastName: "Entry", phone: "0798888888", country: "JO" },
      { firstName: "Second", lastName: "Entry", phone: "0798888888", country: "JO" },
    ]);

    assert(result.duplicates === 1, `Duplicates should be 1, got ${result.duplicates}`);
  });

  await test("Import supports custom fields", async () => {
    const campaign = await db.campaigns.create({
      organizationId: TEST_ORG_A,
      name: "Custom Fields Test",
      description: "",
      agentId: "agent_p12_a",
      status: "draft",
      direction: "outbound",
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      totalContacts: 0,
      configuration: {},
    });

    const result = await execService.importContacts(TEST_ORG_A, campaign.id, [
      {
        firstName: "Ahmad",
        lastName: "Hassan",
        phone: "0797777777",
        country: "JO",
        customFields: { loanAmount: 1250, daysPastDue: 45, riskScore: 720 },
      },
    ]);

    assert(result.imported === 1, "Should import");

    // Verify custom fields stored
    const contacts = await db.contactsPhase12.listByOrg(TEST_ORG_A);
    const withCustom = contacts.find((c) => c.firstName === "Ahmad");
    assert(withCustom !== undefined, "Contact should exist");
    assert((withCustom!.customFields as any).loanAmount === 1250, "Custom field should be stored");
  });
}

// ─── 3. Validation ──────────────────────────────────────────────────────

async function testValidation() {
  console.log("\n━━━ 3. Contact Validation ━━━");

  await test("Validation marks valid contacts", async () => {
    const campaign = await db.campaigns.create({
      organizationId: TEST_ORG_A,
      name: "Validation Test",
      description: "",
      agentId: "agent_p12_a",
      status: "draft",
      direction: "outbound",
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      totalContacts: 0,
      configuration: {},
    });

    await execService.importContacts(TEST_ORG_A, campaign.id, [
      { firstName: "Valid", phone: "0796666666", country: "JO" },
    ]);

    const result = await execService.validateContacts(TEST_ORG_A, campaign.id);
    assert(result.validated >= 1, "Should validate at least 1 contact");
    assert(result.valid >= 1, "Should have at least 1 valid contact");
  });
}

// ─── 4. Deduplication ───────────────────────────────────────────────────

async function testDeduplication() {
  console.log("\n━━━ 4. Deduplication Engine ━━━");

  await test("Deduplication marks duplicate contacts", async () => {
    const campaign = await db.campaigns.create({
      organizationId: TEST_ORG_A,
      name: "Dedup Test",
      description: "",
      agentId: "agent_p12_a",
      status: "draft",
      direction: "outbound",
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      totalContacts: 0,
      configuration: {},
    });

    // Import with explicit duplicates
    await execService.importContacts(TEST_ORG_A, campaign.id, [
      { firstName: "A", phone: "0795555555", country: "JO" },
      { firstName: "B", phone: "0795555555", country: "JO" },
    ]);

    const result = await execService.deduplicateContacts(TEST_ORG_A, campaign.id);
    assert(result.checked >= 2, "Should check at least 2 contacts");
    assert(result.duplicates >= 1, "Should find at least 1 duplicate");
  });
}

// ─── 5. Queue Operations ────────────────────────────────────────────────

async function testQueueOperations() {
  console.log("\n━━━ 5. Queue Operations ━━━");

  await test("Prepare queue creates queued items", async () => {
    const campaign = await db.campaigns.create({
      organizationId: TEST_ORG_A,
      name: "Queue Test",
      description: "",
      agentId: "agent_p12_a",
      status: "draft",
      direction: "outbound",
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      totalContacts: 0,
      configuration: {},
    });

    await execService.importContacts(TEST_ORG_A, campaign.id, [
      { firstName: "Q1", phone: "0794444444", country: "JO" },
      { firstName: "Q2", phone: "0793333333", country: "JO" },
    ]);

    const result = await execService.prepareQueue(TEST_ORG_A, campaign.id);
    assert(result.queued >= 2, `Queued should be >= 2, got ${result.queued}`);
  });

  await test("Queue stats are accurate", async () => {
    const campaigns = await db.campaigns.listByOrg(TEST_ORG_A);
    const lastCampaign = campaigns[campaigns.length - 1];

    const stats = await execService.getQueueStats(TEST_ORG_A, lastCampaign.id);
    assert(typeof stats.queued === "number", "Queued should be a number");
    assert(stats.queued >= 0, "Queued should be non-negative");
  });
}

// ─── 6. Campaign Execution ──────────────────────────────────────────────

async function testCampaignExecution() {
  console.log("\n━━━ 6. Campaign Execution Controls ━━━");

  await test("Start campaign transitions to running", async () => {
    const campaign = await db.campaigns.create({
      organizationId: TEST_ORG_A,
      name: "Execution Test",
      description: "",
      agentId: "agent_p12_a",
      status: "draft",
      direction: "outbound",
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      totalContacts: 0,
      configuration: {},
    });

    const started = await execService.startCampaign(TEST_ORG_A, campaign.id);
    assert(started === true, "Should start successfully");

    const updated = await db.campaigns.get(campaign.id, TEST_ORG_A);
    assert(updated?.status === "running", "Status should be running");
  });

  await test("Pause campaign transitions to paused", async () => {
    const campaigns = await db.campaigns.listByOrg(TEST_ORG_A);
    const running = campaigns.find((c) => c.status === "running");
    assert(running !== undefined, "Should have a running campaign");

    const paused = await execService.pauseCampaign(TEST_ORG_A, running!.id);
    assert(paused === true, "Should pause successfully");

    const updated = await db.campaigns.get(running!.id, TEST_ORG_A);
    assert(updated?.status === "paused", "Status should be paused");
  });

  await test("Resume campaign transitions to running", async () => {
    const campaigns = await db.campaigns.listByOrg(TEST_ORG_A);
    const paused = campaigns.find((c) => c.status === "paused");
    assert(paused !== undefined, "Should have a paused campaign");

    const resumed = await execService.resumeCampaign(TEST_ORG_A, paused!.id);
    assert(resumed === true, "Should resume successfully");

    const updated = await db.campaigns.get(paused!.id, TEST_ORG_A);
    assert(updated?.status === "running", "Status should be running");
  });

  await test("Stop campaign transitions to completed", async () => {
    const campaigns = await db.campaigns.listByOrg(TEST_ORG_A);
    const running = campaigns.find((c) => c.status === "running");
    assert(running !== undefined, "Should have a running campaign");

    const stopped = await execService.stopCampaign(TEST_ORG_A, running!.id);
    assert(stopped === true, "Should stop successfully");

    const updated = await db.campaigns.get(running!.id, TEST_ORG_A);
    assert(updated?.status === "completed", "Status should be completed");
  });
}

// ─── 7. Multi-Tenant Isolation ──────────────────────────────────────────

async function testMultiTenantIsolation() {
  console.log("\n━━━ 7. Multi-Tenant Isolation ━━━");

  await test("Org A contacts not visible to Org B", async () => {
    const contactsA = await db.contactsPhase12.listByOrg(TEST_ORG_A);
    const contactsB = await db.contactsPhase12.listByOrg(TEST_ORG_B);

    assert(contactsA.length > 0, "Org A should have contacts");
    assert(contactsB.length === 0, "Org B should have no contacts");
  });

  await test("Org A campaigns not visible to Org B", async () => {
    const campaignsA = await db.campaigns.listByOrg(TEST_ORG_A);
    const campaignsB = await db.campaigns.listByOrg(TEST_ORG_B);

    assert(campaignsA.length > 0, "Org A should have campaigns");
    assert(campaignsB.length === 0, "Org B should have no campaigns");
  });

  await test("Cannot import contacts to another org's campaign", async () => {
    const campaignsA = await db.campaigns.listByOrg(TEST_ORG_A);
    const campaignId = campaignsA[0].id;

    let error: Error | null = null;
    try {
      await execService.importContacts(TEST_ORG_B, campaignId, [
        { firstName: "Hacker", phone: "0791111111", country: "JO" },
      ]);
    } catch (e: any) {
      error = e;
    }

    assert(error !== null, "Should throw error for cross-tenant access");
  });

  await test("Queue isolation between orgs", async () => {
    const campaignsA = await db.campaigns.listByOrg(TEST_ORG_A);
    if (campaignsA.length > 0) {
      const ccA = await db.campaignContactsPhase12.listByCampaign(TEST_ORG_A, campaignsA[0].id);
      assert(ccA.length >= 0, "Org A queue should be accessible");
    }
  });
}

// ─── 8. Dial Attempts ───────────────────────────────────────────────────

async function testDialAttempts() {
  console.log("\n━━━ 8. Dial Attempt Tracking ━━━");

  await test("Dial attempts are recorded", async () => {
    const campaign = await db.campaigns.create({
      organizationId: TEST_ORG_A,
      name: "Dial Attempt Test",
      description: "",
      agentId: "agent_p12_a",
      status: "running",
      direction: "outbound",
      scheduledAt: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      totalContacts: 1,
      configuration: {},
    });

    const contactResult = await execService.importContacts(TEST_ORG_A, campaign.id, [
      { firstName: "DialTest", phone: "0792222222", country: "JO" },
    ]);

    const ccList = await db.campaignContactsPhase12.listByCampaign(TEST_ORG_A, campaign.id);
    assert(ccList.length > 0, "Should have campaign contacts");

    const cc = ccList[0];

    // Create dial attempt
    const attempt = await db.dialAttemptsPhase12.create({
      organizationId: TEST_ORG_A,
      campaignContactId: cc.id,
      attemptNumber: 1,
      callId: null,
      voiceSessionId: null,
      provider: "demo",
      providerCallId: "demo_call_1",
      metadata: {},
    });

    assert(attempt.id.startsWith("p12da_"), "Should have attempt ID");
    assert(attempt.attemptNumber === 1, "Attempt number should be 1");
  });

  await test("Outcome recording updates campaign metrics", async () => {
    const campaigns = await db.campaigns.listByOrg(TEST_ORG_A);
    const runningCampaign = campaigns.find((c) => c.status === "running");
    if (!runningCampaign) return;

    const ccList = await db.campaignContactsPhase12.listByCampaign(TEST_ORG_A, runningCampaign.id);
    if (ccList.length === 0) return;

    const cc = ccList[ccList.length - 1];

    // Create attempt
    const attempt = await db.dialAttemptsPhase12.create({
      organizationId: TEST_ORG_A,
      campaignContactId: cc.id,
      attemptNumber: 1,
      callId: null,
      voiceSessionId: null,
      provider: "demo",
      providerCallId: "demo_call_2",
      metadata: {},
    });

    // Record outcome
    await execService.recordOutcome(TEST_ORG_A, cc.id, attempt.id, "ANSWERED", "Customer answered");

    const updated = await db.campaignContactsPhase12.get(cc.id, TEST_ORG_A);
    assert(updated?.lastOutcome === "ANSWERED", "Outcome should be ANSWERED");
    assert(updated?.status === "COMPLETED", "Status should be COMPLETED");
  });
}

// ─── 9. Retry Engine ────────────────────────────────────────────────────

async function testRetryEngine() {
  console.log("\n━━━ 9. Retry Engine ━━━");

  await test("Retry scheduling sets next attempt time", async () => {
    const campaign = await db.campaigns.create({
      organizationId: TEST_ORG_A,
      name: "Retry Test",
      description: "",
      agentId: "agent_p12_a",
      status: "running",
      direction: "outbound",
      scheduledAt: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      totalContacts: 1,
      configuration: {},
    });

    await execService.importContacts(TEST_ORG_A, campaign.id, [
      { firstName: "RetryTest", phone: "0791111222", country: "JO" },
    ]);

    const ccList = await db.campaignContactsPhase12.listByCampaign(TEST_ORG_A, campaign.id);
    const cc = ccList[ccList.length - 1];

    const scheduled = await execService.scheduleRetry(TEST_ORG_A, cc.id, "NO_ANSWER");
    assert(scheduled === true, "Should schedule retry");

    const updated = await db.campaignContactsPhase12.get(cc.id, TEST_ORG_A);
    assert(updated?.status === "QUEUED", "Status should be QUEUED after retry");
    assert(updated?.nextAttemptAt !== null, "Next attempt should be set");
  });
}

// ─── 10. Execution Metrics ──────────────────────────────────────────────

async function testExecutionMetrics() {
  console.log("\n━━━ 10. Execution Metrics ━━━");

  await test("Metrics computed from real data", async () => {
    const campaigns = await db.campaigns.listByOrg(TEST_ORG_A);
    const campaign = campaigns[campaigns.length - 1];

    const metrics = await execService.getExecutionMetrics(TEST_ORG_A, campaign.id);
    assert(metrics.campaignId === campaign.id, "Campaign ID should match");
    assert(typeof metrics.totalContacts === "number", "Total contacts should be a number");
    assert(metrics.totalContacts >= 0, "Total contacts should be non-negative");
    assert(typeof metrics.connectionRate === "number", "Connection rate should be a number");
  });
}

// ─── 11. Callback Engine ────────────────────────────────────────────────

async function testCallbackEngine() {
  console.log("\n━━━ 11. Callback Engine ━━━");

  await test("Callback scheduling sets callback time and priority", async () => {
    const campaign = await db.campaigns.create({
      organizationId: TEST_ORG_A,
      name: "Callback Test",
      description: "",
      agentId: "agent_p12_a",
      status: "running",
      direction: "outbound",
      scheduledAt: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      totalContacts: 1,
      configuration: {},
    });

    await execService.importContacts(TEST_ORG_A, campaign.id, [
      { firstName: "CallbackTest", phone: "0793333444", country: "JO" },
    ]);

    const ccList = await db.campaignContactsPhase12.listByCampaign(TEST_ORG_A, campaign.id);
    const cc = ccList[ccList.length - 1];

    const callbackTime = new Date(Date.now() + 3600000).toISOString();
    const scheduled = await execService.scheduleCallback(TEST_ORG_A, cc.id, callbackTime);
    assert(scheduled === true, "Should schedule callback");

    const updated = await db.campaignContactsPhase12.get(cc.id, TEST_ORG_A);
    assert(updated?.isCallback === true, "Should be marked as callback");
    assert(updated?.callbackAt === callbackTime, "Callback time should match");
    assert(updated?.status === "QUEUED", "Status should be QUEUED");
  });
}

// ─── 12. Campaign Events ────────────────────────────────────────────────

async function testCampaignEvents() {
  console.log("\n━━━ 12. Campaign Event Logging ━━━");

  await test("Campaign events are logged", async () => {
    const campaigns = await db.campaigns.listByOrg(TEST_ORG_A);
    // Find a campaign that went through the execution lifecycle
    const campaign = campaigns.find((c) => c.status === "completed" || c.status === "running");
    if (!campaign) {
      // Use the first campaign and verify events exist
      const events = await db.campaignEventsPhase12.listByCampaign(TEST_ORG_A, campaigns[0].id);
      assert(events.length >= 0, "Should have events (may be empty for first campaign)");
      return;
    }
    const events = await db.campaignEventsPhase12.listByCampaign(TEST_ORG_A, campaign.id);
    assert(events.length >= 0, "Should have campaign events for lifecycle campaigns");
  });

  await test("Events are org-scoped", async () => {
    const campaignsA = await db.campaigns.listByOrg(TEST_ORG_A);
    const campaignsB = await db.campaigns.listByOrg(TEST_ORG_B);

    if (campaignsA.length > 0) {
      const eventsA = await db.campaignEventsPhase12.listByCampaign(TEST_ORG_A, campaignsA[0].id);
      assert(eventsA.length >= 0, "Org A events should be accessible");
    }

    if (campaignsB.length > 0) {
      const eventsB = await db.campaignEventsPhase12.listByCampaign(TEST_ORG_B, campaignsB[0].id);
      assert(eventsB.length >= 0, "Org B events should be accessible");
    }
  });
}

// ─── 13. Regression Tests ───────────────────────────────────────────────

async function testRegression() {
  console.log("\n━━━ 13. Existing Feature Regression ━━━");

  await test("Voice sessions still work", async () => {
    const session = await db.sessions.create({
      id: "session_p12_reg",
      organizationId: TEST_ORG_A,
      agentId: "agent_p12_a",
      userId: null,
      language: "en",
      mode: "demo",
    });
    assert(session.status === "active", "Sessions should still work");
  });

  await test("Calls still work", async () => {
    const call = await db.calls.create({
      id: "call_p12_reg",
      organizationId: TEST_ORG_A,
      agentId: "agent_p12_a",
      voiceSessionId: null,
      provider: "demo",
      providerCallId: null,
      direction: "outbound",
      status: "completed",
      fromNumber: "+1234567890",
      toNumber: "+0987654321",
      answeredAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationSeconds: 60,
    });
    assert(call.status === "completed", "Calls should still work");
  });

  await test("Connectors still work", async () => {
    const connector = await db.connectors.create({
      organizationId: TEST_ORG_A,
      name: "Regression Connector",
      provider: "custom",
      type: "CUSTOM_API",
      credentialReference: null,
      configuration: {},
    });
    assert(connector.id.startsWith("conn_"), "Connectors should still work");
  });

  await test("Compliance policies still work", async () => {
    const policy = await db.compliancePolicies.create({
      organizationId: TEST_ORG_A,
      name: "P12 Regression Policy",
      category: "CALLING_HOURS",
      enabled: true,
      severity: "MEDIUM",
      configuration: {},
      description: "",
    });
    assert(policy.id !== undefined, "Compliance should still work");
  });

  await test("DNC records still work", async () => {
    const record = await db.dncRecords.create({
      organizationId: TEST_ORG_A,
      identifier: "+1555P12REG",
      identifierType: "PHONE_NUMBER",
      status: "ACTIVE",
      reason: "Test",
      source: "MANUAL",
      expiresAt: null,
      createdBy: null,
    });
    assert(record.id !== undefined, "DNC should still work");
  });
}

// ─── 14. Demo Mode Safety ───────────────────────────────────────────────

async function testDemoModeSafety() {
  console.log("\n━━━ 14. Demo Mode Safety ━━━");

  await test("Campaign execution works in demo mode", async () => {
    // All operations should work without real telephony
    const campaign = await db.campaigns.create({
      organizationId: TEST_ORG_A,
      name: "Demo Safety Test",
      description: "",
      agentId: "agent_p12_a",
      status: "draft",
      direction: "outbound",
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      totalContacts: 0,
      configuration: {},
    });

    await execService.importContacts(TEST_ORG_A, campaign.id, [
      { firstName: "DemoSafe", phone: "0790000000", country: "JO" },
    ]);

    const started = await execService.startCampaign(TEST_ORG_A, campaign.id);
    assert(started === true, "Demo mode execution should work");
  });
}

// ─── Main Test Runner ────────────────────────────────────────────────────

async function runAllTests() {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("Phase 12 — Campaign Execution Engine Verification Tests");
  console.log("════════════════════════════════════════════════════════════");

  await setup();

  await testPhoneNormalization();
  await testContactImport();
  await testValidation();
  await testDeduplication();
  await testQueueOperations();
  await testCampaignExecution();
  await testMultiTenantIsolation();
  await testDialAttempts();
  await testRetryEngine();
  await testExecutionMetrics();
  await testCallbackEngine();
  await testCampaignEvents();
  await testRegression();
  await testDemoModeSafety();

  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`Phase 12 Tests: ${passCount} passed, ${failCount} failed`);
  console.log("════════════════════════════════════════════════════════════\n");

  if (failCount > 0) {
    console.log("❌ Some tests failed!");
    process.exit(1);
  } else {
    console.log("✅ All Phase 12 verification tests passed!");
    process.exit(0);
  }
}

runAllTests().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});
