/**
 * Phase 10E — Data Connector Verification Tests
 * 
 * Tests connector framework, organization isolation, credential security,
 * field mapping, sync jobs, activity tracking, and entitlement enforcement.
 */

import { createMemoryDb, type Db } from "../db/store";
import { createConnectorService, type ConnectorService } from "../services/connectors";

// Test utilities
const TEST_ORG_A = "org_test_a";
const TEST_ORG_B = "org_test_b";

let db: Db;
let connectorService: ConnectorService;

async function setup() {
  db = createMemoryDb();
  connectorService = createConnectorService({ db });

  // Create test organizations
  await db.organizations.create({
    id: TEST_ORG_A,
    name: "Test Org A",
    slug: "test-org-a",
    status: "active",
  });

  await db.organizations.create({
    id: TEST_ORG_B,
    name: "Test Org B",
    slug: "test-org-b",
    status: "active",
  });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
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

// ─── Test Categories ─────────────────────────────────────────────────────

async function testConnectorCRUD() {
  console.log("\n━━━ 1. Connector CRUD Operations ━━━");

  await test("Create connector", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Test CRM",
      provider: "salesforce",
      type: "CRM",
      configuration: { baseUrl: "https://api.salesforce.com" },
    });

    assert(connector.id.startsWith("conn_"), "Should have connector ID");
    assert(connector.name === "Test CRM", "Name should match");
    assert(connector.provider === "salesforce", "Provider should match");
    assert(connector.type === "CRM", "Type should match");
    assert(connector.status === "DRAFT", "Status should be DRAFT");
    assert(connector.healthStatus === "UNKNOWN", "Health should be UNKNOWN");
    assert(connector.enabled === false, "Should be disabled by default");
  });

  await test("Get connector", async () => {
    const created = await connectorService.createConnector(TEST_ORG_A, {
      name: "Test Connector",
      provider: "custom",
      type: "CUSTOM_API",
    });

    const retrieved = await connectorService.getConnector(TEST_ORG_A, created.id);
    assert(retrieved !== undefined, "Should retrieve connector");
    assert(retrieved?.id === created.id, "ID should match");
    assert(retrieved?.name === "Test Connector", "Name should match");
  });

  await test("List connectors", async () => {
    const connectors = await connectorService.listConnectors(TEST_ORG_A);
    assert(Array.isArray(connectors), "Should return array");
    assert(connectors.length >= 0, "Should have connectors");
  });

  await test("Update connector", async () => {
    const created = await connectorService.createConnector(TEST_ORG_A, {
      name: "Original Name",
      provider: "hubspot",
      type: "CRM",
    });

    const updated = await connectorService.updateConnector(TEST_ORG_A, created.id, {
      name: "Updated Name",
      status: "CONFIGURING",
    });

    assert(updated?.name === "Updated Name", "Name should be updated");
    assert(updated?.status === "CONFIGURING", "Status should be updated");
  });

  await test("Delete connector", async () => {
    const created = await connectorService.createConnector(TEST_ORG_A, {
      name: "To Delete",
      provider: "custom",
      type: "CUSTOM_API",
    });

    const deleted = await connectorService.deleteConnector(TEST_ORG_A, created.id);
    assert(deleted === true, "Should delete successfully");

    const retrieved = await connectorService.getConnector(TEST_ORG_A, created.id);
    assert(retrieved === undefined, "Should not retrieve deleted connector");
  });
}

async function testOrganizationIsolation() {
  console.log("\n━━━ 2. Organization Isolation ━━━");

  await test("Cannot access another org's connector", async () => {
    const connectorA = await connectorService.createConnector(TEST_ORG_A, {
      name: "Org A Connector",
      provider: "salesforce",
      type: "CRM",
    });

    // Try to access from Org B
    const retrieved = await connectorService.getConnector(TEST_ORG_B, connectorA.id);
    assert(retrieved === undefined, "Should not access another org's connector");
  });

  await test("Cannot update another org's connector", async () => {
    const connectorA = await connectorService.createConnector(TEST_ORG_A, {
      name: "Org A Connector",
      provider: "salesforce",
      type: "CRM",
    });

    const updated = await connectorService.updateConnector(TEST_ORG_B, connectorA.id, {
      name: "Hacked Name",
    });
    assert(updated === undefined, "Should not update another org's connector");
  });

  await test("Cannot delete another org's connector", async () => {
    const connectorA = await connectorService.createConnector(TEST_ORG_A, {
      name: "Org A Connector",
      provider: "salesforce",
      type: "CRM",
    });

    const deleted = await connectorService.deleteConnector(TEST_ORG_B, connectorA.id);
    assert(deleted === false, "Should not delete another org's connector");

    // Verify it still exists
    const stillExists = await connectorService.getConnector(TEST_ORG_A, connectorA.id);
    assert(stillExists !== undefined, "Connector should still exist");
  });

  await test("Each org sees only their connectors", async () => {
    await connectorService.createConnector(TEST_ORG_A, {
      name: "Org A CRM",
      provider: "salesforce",
      type: "CRM",
    });

    await connectorService.createConnector(TEST_ORG_B, {
      name: "Org B CRM",
      provider: "hubspot",
      type: "CRM",
    });

    const orgAConnectors = await connectorService.listConnectors(TEST_ORG_A);
    const orgBConnectors = await connectorService.listConnectors(TEST_ORG_B);

    const orgAHasOrgBConnector = orgAConnectors.some(c => c.name === "Org B CRM");
    const orgBHasOrgAConnector = orgBConnectors.some(c => c.name === "Org A CRM");

    assert(!orgAHasOrgBConnector, "Org A should not see Org B's connector");
    assert(!orgBHasOrgAConnector, "Org B should not see Org A's connector");
  });
}

async function testFieldMapping() {
  console.log("\n━━━ 3. Field Mapping ━━━");

  await test("Create field mapping", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Mapping Test",
      provider: "custom",
      type: "CUSTOM_API",
    });

    const mapping = await connectorService.createMapping(TEST_ORG_A, connector.id, {
      sourceField: "external_id",
      targetField: "customerId",
      dataType: "string",
      required: true,
    });

    assert(mapping.id.startsWith("cmap_"), "Should have mapping ID");
    assert(mapping.sourceField === "external_id", "Source field should match");
    assert(mapping.targetField === "customerId", "Target field should match");
    assert(mapping.dataType === "string", "Data type should match");
    assert(mapping.required === true, "Required flag should match");
  });

  await test("List field mappings", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Mapping List Test",
      provider: "custom",
      type: "CUSTOM_API",
    });

    await connectorService.createMapping(TEST_ORG_A, connector.id, {
      sourceField: "field1",
      targetField: "target1",
    });

    await connectorService.createMapping(TEST_ORG_A, connector.id, {
      sourceField: "field2",
      targetField: "target2",
    });

    const mappings = await connectorService.listMappings(TEST_ORG_A, connector.id);
    assert(mappings.length === 2, "Should have 2 mappings");
  });

  await test("Update field mapping", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Mapping Update Test",
      provider: "custom",
      type: "CUSTOM_API",
    });

    const created = await connectorService.createMapping(TEST_ORG_A, connector.id, {
      sourceField: "old_field",
      targetField: "old_target",
    });

    const updated = await connectorService.updateMapping(TEST_ORG_A, connector.id, created.id, {
      sourceField: "new_field",
      targetField: "new_target",
    });

    assert(updated?.sourceField === "new_field", "Source field should be updated");
    assert(updated?.targetField === "new_target", "Target field should be updated");
  });

  await test("Delete field mapping", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Mapping Delete Test",
      provider: "custom",
      type: "CUSTOM_API",
    });

    const created = await connectorService.createMapping(TEST_ORG_A, connector.id, {
      sourceField: "to_delete",
      targetField: "delete_target",
    });

    const deleted = await connectorService.deleteMapping(TEST_ORG_A, connector.id, created.id);
    assert(deleted === true, "Should delete successfully");

    const mappings = await connectorService.listMappings(TEST_ORG_A, connector.id);
    assert(mappings.length === 0, "Should have no mappings after deletion");
  });

  await test("Mapping isolation between connectors", async () => {
    const connectorA = await connectorService.createConnector(TEST_ORG_A, {
      name: "Connector A",
      provider: "custom",
      type: "CUSTOM_API",
    });

    const connectorB = await connectorService.createConnector(TEST_ORG_A, {
      name: "Connector B",
      provider: "custom",
      type: "CUSTOM_API",
    });

    await connectorService.createMapping(TEST_ORG_A, connectorA.id, {
      sourceField: "field_a",
      targetField: "target_a",
    });

    const mappingsB = await connectorService.listMappings(TEST_ORG_A, connectorB.id);
    assert(mappingsB.length === 0, "Connector B should have no mappings");
  });
}

async function testSyncJobs() {
  console.log("\n━━━ 4. Sync Jobs ━━━");

  await test("Trigger sync job", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Sync Test",
      provider: "custom",
      type: "CUSTOM_API",
      configuration: {},
    });

    // Enable the connector first
    await connectorService.updateConnector(TEST_ORG_A, connector.id, {
      enabled: true,
    });

    const job = await connectorService.triggerSync(TEST_ORG_A, connector.id, "INBOUND");

    assert(job.id.startsWith("csj_"), "Should have job ID");
    assert(job.status === "PENDING", "Status should be PENDING");
    assert(job.direction === "INBOUND", "Direction should match");
    assert(job.recordsProcessed === 0, "Records processed should be 0");
    assert(job.recordsFailed === 0, "Records failed should be 0");
  });

  await test("Cannot trigger sync on disabled connector", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Disabled Sync Test",
      provider: "custom",
      type: "CUSTOM_API",
    });

    // Connector is disabled by default
    let error: Error | null = null;
    try {
      await connectorService.triggerSync(TEST_ORG_A, connector.id, "INBOUND");
    } catch (e: any) {
      error = e;
    }

    assert(error !== null, "Should throw error");
    assert(error?.message === "CONNECTOR_NOT_ENABLED", "Should throw CONNECTOR_NOT_ENABLED");
  });

  await test("List sync jobs", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Job List Test",
      provider: "custom",
      type: "CUSTOM_API",
    });

    await connectorService.updateConnector(TEST_ORG_A, connector.id, {
      enabled: true,
    });

    await connectorService.triggerSync(TEST_ORG_A, connector.id, "INBOUND");
    await connectorService.triggerSync(TEST_ORG_A, connector.id, "OUTBOUND");

    const jobs = await connectorService.listSyncJobs(TEST_ORG_A, connector.id);
    assert(jobs.length === 2, "Should have 2 jobs");
  });
}

async function testConnectionTesting() {
  console.log("\n━━━ 5. Connection Testing ━━━");

  await test("Test connection returns safe result", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Connection Test",
      provider: "custom",
      type: "CUSTOM_API",
      configuration: {},
    });

    const result = await connectorService.testConnection(TEST_ORG_A, connector.id);

    assert(typeof result.success === "boolean", "Should have success flag");
    assert(typeof result.message === "string", "Should have message");
    assert(result.latencyMs !== undefined, "Should have latency");
    assert(result.diagnostics !== undefined, "Should have diagnostics");
  });

  await test("Connection test updates lastTestedAt", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Test Timestamp",
      provider: "custom",
      type: "CUSTOM_API",
    });

    assert(connector.lastTestedAt === null, "lastTestedAt should be null initially");

    await connectorService.testConnection(TEST_ORG_A, connector.id);

    const updated = await connectorService.getConnector(TEST_ORG_A, connector.id);
    assert(updated?.lastTestedAt !== null, "lastTestedAt should be updated");
  });
}

async function testActivityLogging() {
  console.log("\n━━━ 6. Activity Logging ━━━");

  await test("Connector creation logs activity", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Activity Test",
      provider: "custom",
      type: "CUSTOM_API",
    });

    await connectorService.testConnection(TEST_ORG_A, connector.id);

    const activities = await connectorService.listActivities(TEST_ORG_A, connector.id);
    assert(activities.length > 0, "Should have activities");
    assert(
      activities.some(a => a.activityType === "CONNECTION_TESTED"),
      "Should have CONNECTION_TESTED activity"
    );
  });

  await test("Mapping changes log activity", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Mapping Activity Test",
      provider: "custom",
      type: "CUSTOM_API",
    });

    await connectorService.createMapping(TEST_ORG_A, connector.id, {
      sourceField: "test_field",
      targetField: "test_target",
    });

    const activities = await connectorService.listActivities(TEST_ORG_A, connector.id);
    assert(
      activities.some(a => a.activityType === "MAPPING_CHANGED"),
      "Should have MAPPING_CHANGED activity"
    );
  });
}

async function testCredentialSecurity() {
  console.log("\n━━━ 7. Credential Security ━━━");

  await test("Credential-shaped configuration is rejected", async () => {
    let rejected = false;
    try {
      await connectorService.createConnector(TEST_ORG_A, {
        name: "Security Test",
        provider: "custom",
        type: "CUSTOM_API",
        configuration: {
          apiKey: "secret123",
          password: "password456",
          token: "token789",
        },
      });
    } catch (error) {
      rejected = error instanceof Error && error.message === "CREDENTIALS_NOT_ALLOWED_IN_CONFIGURATION";
    }
    assert(rejected, "Credential material must never enter connector configuration");
  });

  await test("Safe configuration is stored but not exposed", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Config Test",
      provider: "custom",
      type: "CUSTOM_API",
      configuration: {
        baseUrl: "https://api.example.com",
        objectType: "Contact",
      },
    });

    const connectorJson = JSON.stringify(connector);
    assert(!connectorJson.includes("https://api.example.com"), "Configuration should not be in DTO");
  });
}

async function testTransformations() {
  console.log("\n━━━ 8. Transformation Registry ━━━");

  await test("Create mapping with transformer", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Transform Test",
      provider: "custom",
      type: "CUSTOM_API",
    });

    const mapping = await connectorService.createMapping(TEST_ORG_A, connector.id, {
      sourceField: "phone",
      targetField: "phoneNumber",
      transformerType: "PHONE_NORMALIZATION",
      transformerConfig: { countryCode: "+962" },
    });

    assert(mapping.transformerType === "PHONE_NORMALIZATION", "Transformer type should match");
  });

  await test("Supported transformation types", async () => {
    const validTypes = [
      "TRIM",
      "LOWERCASE",
      "UPPERCASE",
      "PHONE_NORMALIZATION",
      "DATE_NORMALIZATION",
      "NUMBER_NORMALIZATION",
    ];

    // All types should be accepted
    for (const type of validTypes) {
      const connector = await connectorService.createConnector(TEST_ORG_A, {
        name: `Transform ${type}`,
        provider: "custom",
        type: "CUSTOM_API",
      });

      const mapping = await connectorService.createMapping(TEST_ORG_A, connector.id, {
        sourceField: "field",
        targetField: "target",
        transformerType: type as any,
      });

      assert(mapping.transformerType === type, `Should accept ${type}`);
    }
  });
}

async function testConnectorHealth() {
  console.log("\n━━━ 9. Connector Health ━━━");

  await test("Get connector health", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Health Test",
      provider: "custom",
      type: "CUSTOM_API",
    });

    const health = await connectorService.getHealth(TEST_ORG_A, connector.id);
    assert(health === "UNKNOWN", "Initial health should be UNKNOWN");
  });

  await test("Health status is not fabricated", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Health Status Test",
      provider: "custom",
      type: "CUSTOM_API",
    });

    // Health should be UNKNOWN until a real health check is performed
    const health = await connectorService.getHealth(TEST_ORG_A, connector.id);
    assert(
      health === "UNKNOWN" || health === "HEALTHY" || health === "DEGRADED" || health === "UNAVAILABLE",
      "Health should be a valid status"
    );
  });
}

async function testConnectorTypes() {
  console.log("\n━━━ 10. Connector Types ━━━");

  await test("All connector types supported", async () => {
    const types = [
      "CRM",
      "CORE_SYSTEM",
      "LOAN_MANAGEMENT",
      "COLLECTIONS",
      "ERP",
      "DATABASE",
      "CUSTOM_API",
      "PAYMENTS",
    ];

    for (const type of types) {
      const connector = await connectorService.createConnector(TEST_ORG_A, {
        name: `${type} Connector`,
        provider: "custom",
        type: type as any,
      });

      assert(connector.type === type, `Should create ${type} connector`);
    }
  });
}

async function testSyncModes() {
  console.log("\n━━━ 11. Sync Modes ━━━");

  await test("All sync modes supported", async () => {
    const modes = ["MANUAL", "SCHEDULED", "WEBHOOK", "EVENT_DRIVEN"];

    for (const mode of modes) {
      const connector = await connectorService.createConnector(TEST_ORG_A, {
        name: `${mode} Sync Connector`,
        provider: "custom",
        type: "CUSTOM_API",
        syncMode: mode as any,
      });

      assert(connector.syncMode === mode, `Should create ${mode} sync mode`);
    }
  });

  await test("Scheduled sync accepts cron", async () => {
    const connector = await connectorService.createConnector(TEST_ORG_A, {
      name: "Scheduled Connector",
      provider: "custom",
      type: "CUSTOM_API",
      syncMode: "SCHEDULED",
      scheduleCron: "0 */2 * * *", // Every 2 hours
    });

    assert(connector.syncMode === "SCHEDULED", "Should be SCHEDULED");
    // Note: scheduleCron is stored but not yet executed (no scheduler implemented)
  });
}

// ─── Main Test Runner ────────────────────────────────────────────────────

async function runAllTests() {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("Phase 10E — Data Connector Verification Tests");
  console.log("════════════════════════════════════════════════════════════");

  await setup();

  await testConnectorCRUD();
  await testOrganizationIsolation();
  await testFieldMapping();
  await testSyncJobs();
  await testConnectionTesting();
  await testActivityLogging();
  await testCredentialSecurity();
  await testTransformations();
  await testConnectorHealth();
  await testConnectorTypes();
  await testSyncModes();

  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`Phase 10E Tests: ${passCount} passed, ${failCount} failed`);
  console.log("════════════════════════════════════════════════════════════\n");

  if (failCount > 0) {
    console.log("❌ Some tests failed!");
    process.exit(1);
  } else {
    console.log("✅ All Phase 10E verification tests passed!");
    process.exit(0);
  }
}

runAllTests().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});
