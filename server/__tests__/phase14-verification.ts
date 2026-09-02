/**
 * Phase 14 Verification Tests - Enterprise Connector Production Activation
 * 
 * Tests connector provider integration, credential security, connection testing,
 * schema discovery, field mapping, sync operations, and tenant isolation.
 */

import { createMemoryDb, type Db } from "../db/store";
import { createConnectorService, type ConnectorService } from "../services/connectors";
import {
  createConnectorProviderRegistry,
  type ConnectorProviderRegistry,
} from "../connectors/providers/registry";
import {
  createConnectorCredentialStore,
  type ConnectorCredentialStore,
} from "../connectors/credentials";
import {
  createConnectorSyncEngine,
  type ConnectorSyncEngine,
} from "../connectors/syncEngine";
import { createLogger } from "../lib/observability";

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

async function testProviderRegistry() {
  console.log("\n━━━ 1. Provider Registry ━━━");

  const logger = createLogger("error");
  const registry = createConnectorProviderRegistry(logger);

  // Test 1: Salesforce provider should be registered
  const salesforceProvider = registry.getProvider("salesforce");
  assert(salesforceProvider !== undefined, "Salesforce provider should be registered");

  // Test 2: Provider info should be safe for API responses
  const info = salesforceProvider!.info;
  assert(info.id === "salesforce", "Provider ID should be salesforce");
  assert(info.type === "CRM", "Provider type should be CRM");
  assert(info.capabilities.connectionTesting === true, "Should support connection testing");
  assert(info.capabilities.schemaDiscovery === true, "Should support schema discovery");
  assert(info.capabilities.inboundSync === true, "Should support inbound sync");
  assert(info.capabilities.outboundSync === true, "Should support outbound sync");

  // Test 3: List providers
  const providers = registry.listProviders();
  assert(providers.length >= 1, "Should have at least one provider");

  // Test 4: List providers by type
  const crmProviders = registry.listProvidersByType("CRM");
  assert(crmProviders.length >= 1, "Should have at least one CRM provider");

  // Test 5: Validate credentials
  const validCredentials = {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    username: "test@example.com",
    password: "test-password",
    securityToken: "test-token",
  };
  const isValid = salesforceProvider!.validateCredentials(validCredentials);
  assert(isValid === true, "Valid credentials should pass validation");

  // Test 6: Invalid credentials should fail validation
  const invalidCredentials = {
    clientId: "",
    clientSecret: "test",
  };
  const isInvalid = salesforceProvider!.validateCredentials(invalidCredentials);
  assert(isInvalid === false, "Invalid credentials should fail validation");
}

async function testCredentialStore() {
  console.log("\n━━━ 2. Credential Store ━━━");

  const credentialStore = createConnectorCredentialStore();
  const orgId = "org_test_1";
  const connectorId = "conn_test_1";

  // Test 1: Store credentials
  const credentials = {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    username: "test@example.com",
    password: "test-password",
    securityToken: "test-token",
  };

  await credentialStore.store(orgId, connectorId, credentials);

  // Test 2: Retrieve credentials
  const retrieved = await credentialStore.retrieve(orgId, connectorId);
  assert(retrieved !== undefined, "Credentials should be retrievable");
  assert(retrieved!.clientId === "test-client-id", "Retrieved credentials should match");

  // Test 3: Check existence
  const exists = await credentialStore.exists(orgId, connectorId);
  assert(exists === true, "Credentials should exist");

  // Test 4: Organization isolation
  const otherOrgExists = await credentialStore.exists("org_other", connectorId);
  assert(otherOrgExists === false, "Credentials should be organization-scoped");

  // Test 5: Delete credentials
  const deleted = await credentialStore.delete(orgId, connectorId);
  assert(deleted === true, "Credentials should be deletable");

  // Test 6: Verify deletion
  const existsAfterDelete = await credentialStore.exists(orgId, connectorId);
  assert(existsAfterDelete === false, "Credentials should be deleted");
}

async function testConnectorCRUD() {
  console.log("\n━━━ 3. Connector CRUD ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const providerRegistry = createConnectorProviderRegistry(logger);
  const credentialStore = createConnectorCredentialStore();
  const syncEngine = createConnectorSyncEngine(db, providerRegistry, credentialStore, logger);

  const connectorService = createConnectorService({
    db,
    providerRegistry,
    credentialStore,
    syncEngine,
    logger,
  });

  // Create test organization
  await db.organizations.create({
    id: "org_test_1",
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  // Test 1: Create connector
  const connector = await connectorService.createConnector("org_test_1", {
    name: "Test Salesforce CRM",
    provider: "salesforce",
    type: "CRM",
    configuration: { apiVersion: "v59.0" },
  });

  assert(connector.id.startsWith("conn_"), "Should have connector ID");
  assert(connector.name === "Test Salesforce CRM", "Name should match");
  assert(connector.provider === "salesforce", "Provider should match");
  assert(connector.type === "CRM", "Type should match");
  assert(connector.status === "DRAFT", "Status should be DRAFT");

  // Test 2: Get connector
  const retrieved = await connectorService.getConnector("org_test_1", connector.id);
  assert(retrieved !== undefined, "Should retrieve connector");
  assert(retrieved!.id === connector.id, "ID should match");

  // Test 3: List connectors
  const connectors = await connectorService.listConnectors("org_test_1");
  assert(Array.isArray(connectors), "Should return array");
  assert(connectors.length >= 1, "Should have at least one connector");

  // Test 4: Update connector
  const updated = await connectorService.updateConnector("org_test_1", connector.id, {
    name: "Updated Salesforce CRM",
    status: "CONFIGURING",
  });
  assert(updated !== undefined, "Should update connector");
  assert(updated!.name === "Updated Salesforce CRM", "Name should be updated");
  assert(updated!.status === "CONFIGURING", "Status should be updated");

  // Test 5: Organization isolation
  const otherOrgConnectors = await connectorService.listConnectors("org_other");
  assert(otherOrgConnectors.length === 0, "Other org should not see connectors");
}

async function testCredentialManagement() {
  console.log("\n━━━ 4. Credential Management ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const providerRegistry = createConnectorProviderRegistry(logger);
  const credentialStore = createConnectorCredentialStore();
  const syncEngine = createConnectorSyncEngine(db, providerRegistry, credentialStore, logger);

  const connectorService = createConnectorService({
    db,
    providerRegistry,
    credentialStore,
    syncEngine,
    logger,
  });

  // Create test organization and connector
  await db.organizations.create({
    id: "org_test_1",
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  const connector = await connectorService.createConnector("org_test_1", {
    name: "Test Salesforce",
    provider: "salesforce",
    type: "CRM",
  });

  // Test 1: Check credentials don't exist initially
  const hasCredsBefore = await connectorService.hasCredentials("org_test_1", connector.id);
  assert(hasCredsBefore === false, "Should not have credentials initially");

  // Test 2: Store credentials
  const credentials = {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    username: "test@example.com",
    password: "test-password",
    securityToken: "test-token",
  };

  await connectorService.storeCredentials("org_test_1", connector.id, credentials);

  // Test 3: Check credentials exist
  const hasCredsAfter = await connectorService.hasCredentials("org_test_1", connector.id);
  assert(hasCredsAfter === true, "Should have credentials after storing");

  // Test 4: Store invalid credentials should fail
  try {
    await connectorService.storeCredentials("org_test_1", connector.id, {
      clientId: "",
      clientSecret: "",
    });
    assert(false, "Should reject invalid credentials");
  } catch (error) {
    assert(error instanceof Error && error.message === "INVALID_CREDENTIALS", "Should throw INVALID_CREDENTIALS");
  }

  // Test 5: Organization isolation
  const otherOrgHasCreds = await connectorService.hasCredentials("org_other", connector.id);
  assert(otherOrgHasCreds === false, "Other org should not see credentials");
}

async function testConnectionTesting() {
  console.log("\n━━━ 5. Connection Testing ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const providerRegistry = createConnectorProviderRegistry(logger);
  const credentialStore = createConnectorCredentialStore();
  const syncEngine = createConnectorSyncEngine(db, providerRegistry, credentialStore, logger);

  const connectorService = createConnectorService({
    db,
    providerRegistry,
    credentialStore,
    syncEngine,
    logger,
  });

  // Create test organization and connector
  await db.organizations.create({
    id: "org_test_1",
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  const connector = await connectorService.createConnector("org_test_1", {
    name: "Test Salesforce",
    provider: "salesforce",
    type: "CRM",
  });

  // Test 1: Test connection without credentials should fail
  try {
    const result = await connectorService.testConnection("org_test_1", connector.id);
    assert(result.success === false, "Should fail without credentials");
    assert(result.diagnostics?.error === "CREDENTIALS_NOT_FOUND", "Should report missing credentials");
  } catch (error) {
    // Expected to throw
  }

  // Test 2: Store credentials (will fail in real test due to invalid credentials)
  // In a real test, we would use valid Salesforce credentials
  // For now, we just verify the structure

  // Test 3: Test connection with invalid credentials
  await connectorService.storeCredentials("org_test_1", connector.id, {
    clientId: "invalid-client-id",
    clientSecret: "invalid-client-secret",
    username: "invalid@example.com",
    password: "invalid-password",
    securityToken: "invalid-token",
  });

  const result = await connectorService.testConnection("org_test_1", connector.id);
  assert(result.success === false, "Should fail with invalid credentials");
  assert(result.latencyMs > 0, "Should have latency");
  assert(result.diagnostics?.provider === "salesforce", "Should include provider in diagnostics");

  // Test 4: Result should not contain credentials
  const resultStr = JSON.stringify(result);
  assert(!resultStr.includes("invalid-client-secret"), "Result should not contain secrets");
}

async function testSchemaDiscovery() {
  console.log("\n━━━ 6. Schema Discovery ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const providerRegistry = createConnectorProviderRegistry(logger);
  const credentialStore = createConnectorCredentialStore();
  const syncEngine = createConnectorSyncEngine(db, providerRegistry, credentialStore, logger);

  const connectorService = createConnectorService({
    db,
    providerRegistry,
    credentialStore,
    syncEngine,
    logger,
  });

  // Create test organization and connector
  await db.organizations.create({
    id: "org_test_1",
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  const connector = await connectorService.createConnector("org_test_1", {
    name: "Test Salesforce",
    provider: "salesforce",
    type: "CRM",
  });

  // Test 1: Schema discovery without credentials should fail
  try {
    const schema = await connectorService.discoverSchema("org_test_1", connector.id);
    assert(schema === undefined, "Should return undefined without credentials");
  } catch (error) {
    assert(error instanceof Error && error.message.includes("Credentials not configured"), "Should throw credential error");
  }
}

async function testFieldMapping() {
  console.log("\n━━━ 7. Field Mapping ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const providerRegistry = createConnectorProviderRegistry(logger);
  const credentialStore = createConnectorCredentialStore();
  const syncEngine = createConnectorSyncEngine(db, providerRegistry, credentialStore, logger);

  const connectorService = createConnectorService({
    db,
    providerRegistry,
    credentialStore,
    syncEngine,
    logger,
  });

  // Create test organization and connector
  await db.organizations.create({
    id: "org_test_1",
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  const connector = await connectorService.createConnector("org_test_1", {
    name: "Test Salesforce",
    provider: "salesforce",
    type: "CRM",
  });

  // Test 1: Create mapping
  const mapping = await connectorService.createMapping("org_test_1", connector.id, {
    sourceField: "FirstName",
    targetField: "firstName",
    dataType: "string",
    required: true,
    transformerType: "TRIM",
  });

  assert(mapping.id.startsWith("cmap_"), "Should have mapping ID");
  assert(mapping.sourceField === "FirstName", "Source field should match");
  assert(mapping.targetField === "firstName", "Target field should match");

  // Test 2: List mappings
  const mappings = await connectorService.listMappings("org_test_1", connector.id);
  assert(mappings.length === 1, "Should have one mapping");

  // Test 3: Update mapping
  const updatedMapping = await connectorService.updateMapping("org_test_1", connector.id, mapping.id, {
    targetField: "first_name",
  });
  assert(updatedMapping !== undefined, "Should update mapping");
  assert(updatedMapping!.targetField === "first_name", "Target field should be updated");

  // Test 4: Delete mapping
  const deleted = await connectorService.deleteMapping("org_test_1", connector.id, mapping.id);
  assert(deleted === true, "Should delete mapping");

  // Test 5: Organization isolation
  const otherOrgMappings = await connectorService.listMappings("org_other", connector.id);
  assert(otherOrgMappings.length === 0, "Other org should not see mappings");
}

async function testSyncLifecycle() {
  console.log("\n━━━ 8. Sync Lifecycle ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const providerRegistry = createConnectorProviderRegistry(logger);
  const credentialStore = createConnectorCredentialStore();
  const syncEngine = createConnectorSyncEngine(db, providerRegistry, credentialStore, logger);

  const connectorService = createConnectorService({
    db,
    providerRegistry,
    credentialStore,
    syncEngine,
    logger,
  });

  // Create test organization and connector
  await db.organizations.create({
    id: "org_test_1",
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  const connector = await connectorService.createConnector("org_test_1", {
    name: "Test Salesforce",
    provider: "salesforce",
    type: "CRM",
  });

  // Enable connector
  await connectorService.updateConnector("org_test_1", connector.id, {
    enabled: true,
  });

  // Create mapping
  await connectorService.createMapping("org_test_1", connector.id, {
    sourceField: "FirstName",
    targetField: "firstName",
  });

  // Store credentials
  await connectorService.storeCredentials("org_test_1", connector.id, {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    username: "test@example.com",
    password: "test-password",
    securityToken: "test-token",
  });

  // Test 1: Trigger sync
  const syncJob = await connectorService.triggerSync("org_test_1", connector.id, "INBOUND");
  assert(syncJob.id.startsWith("csj_"), "Should have sync job ID");
  assert(syncJob.direction === "INBOUND", "Direction should match");
  assert(syncJob.status === "PENDING" || syncJob.status === "RUNNING", "Status should be PENDING or RUNNING");

  // Test 2: List sync jobs
  const syncJobs = await connectorService.listSyncJobs("org_test_1", connector.id);
  assert(syncJobs.length >= 1, "Should have at least one sync job");

  // Test 3: Get sync job
  const retrievedJob = await connectorService.getSyncJob("org_test_1", syncJob.id);
  assert(retrievedJob !== undefined, "Should retrieve sync job");
  assert(retrievedJob!.id === syncJob.id, "Job ID should match");

  // Test 4: Organization isolation
  const otherOrgJobs = await connectorService.listSyncJobs("org_other", connector.id);
  assert(otherOrgJobs.length === 0, "Other org should not see sync jobs");
}

async function testCredentialSecurity() {
  console.log("\n━━━ 9. Credential Security ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const providerRegistry = createConnectorProviderRegistry(logger);
  const credentialStore = createConnectorCredentialStore();
  const syncEngine = createConnectorSyncEngine(db, providerRegistry, credentialStore, logger);

  const connectorService = createConnectorService({
    db,
    providerRegistry,
    credentialStore,
    syncEngine,
    logger,
  });

  // Create test organization and connector
  await db.organizations.create({
    id: "org_test_1",
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  const connector = await connectorService.createConnector("org_test_1", {
    name: "Test Salesforce",
    provider: "salesforce",
    type: "CRM",
  });

  const credentials = {
    clientId: "super-secret-client-id",
    clientSecret: "super-secret-client-secret",
    username: "test@example.com",
    password: "super-secret-password",
    securityToken: "super-secret-token",
  };

  await connectorService.storeCredentials("org_test_1", connector.id, credentials);

  // Test 1: Get connector should not return credentials
  const retrievedConnector = await connectorService.getConnector("org_test_1", connector.id);
  const connectorStr = JSON.stringify(retrievedConnector);
  assert(!connectorStr.includes("super-secret-client-secret"), "Connector DTO should not contain credentials");
  assert(!connectorStr.includes("super-secret-password"), "Connector DTO should not contain passwords");

  // Test 2: List connectors should not return credentials
  const connectors = await connectorService.listConnectors("org_test_1");
  const connectorsStr = JSON.stringify(connectors);
  assert(!connectorsStr.includes("super-secret-client-secret"), "Connector list should not contain credentials");

  // Test 3: Test connection result should not contain credentials
  const testResult = await connectorService.testConnection("org_test_1", connector.id);
  const testResultStr = JSON.stringify(testResult);
  assert(!testResultStr.includes("super-secret-client-secret"), "Test result should not contain credentials");
  assert(!testResultStr.includes("super-secret-password"), "Test result should not contain passwords");
}

async function testTenantIsolation() {
  console.log("\n━━━ 10. Tenant Isolation ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const providerRegistry = createConnectorProviderRegistry(logger);
  const credentialStore = createConnectorCredentialStore();
  const syncEngine = createConnectorSyncEngine(db, providerRegistry, credentialStore, logger);

  const connectorService = createConnectorService({
    db,
    providerRegistry,
    credentialStore,
    syncEngine,
    logger,
  });

  // Create two test organizations
  await db.organizations.create({
    id: "org_a",
    name: "Org A",
    slug: "org-a",
    status: "active",
  });

  await db.organizations.create({
    id: "org_b",
    name: "Org B",
    slug: "org-b",
    status: "active",
  });

  // Create connector in Org A
  const connectorA = await connectorService.createConnector("org_a", {
    name: "Org A Salesforce",
    provider: "salesforce",
    type: "CRM",
  });

  // Create connector in Org B
  const connectorB = await connectorService.createConnector("org_b", {
    name: "Org B Salesforce",
    provider: "salesforce",
    type: "CRM",
  });

  // Test 1: Org A should only see its own connectors
  const orgAConnectors = await connectorService.listConnectors("org_a");
  assert(orgAConnectors.length === 1, "Org A should have one connector");
  assert(orgAConnectors[0].id === connectorA.id, "Org A should see its own connector");

  // Test 2: Org B should only see its own connectors
  const orgBConnectors = await connectorService.listConnectors("org_b");
  assert(orgBConnectors.length === 1, "Org B should have one connector");
  assert(orgBConnectors[0].id === connectorB.id, "Org B should see its own connector");

  // Test 3: Org A should not access Org B's connector
  try {
    const orgBConnectorFromA = await connectorService.getConnector("org_a", connectorB.id);
    assert(orgBConnectorFromA === undefined, "Org A should not access Org B's connector");
  } catch (error) {
    // Expected to throw or return undefined
  }

  // Test 4: Credential isolation
  await connectorService.storeCredentials("org_a", connectorA.id, {
    clientId: "org-a-client-id",
    clientSecret: "org-a-secret",
    username: "orga@example.com",
    password: "org-a-password",
    securityToken: "org-a-token",
  });

  const orgAHasCreds = await connectorService.hasCredentials("org_a", connectorA.id);
  const orgBHasCreds = await connectorService.hasCredentials("org_b", connectorA.id);
  assert(orgAHasCreds === true, "Org A should have credentials");
  assert(orgBHasCreds === false, "Org B should not see Org A's credentials");
}

async function runAllTests() {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("Phase 14 Verification Tests - Enterprise Connector Production Activation");
  console.log("════════════════════════════════════════════════════════════");

  await testProviderRegistry();
  await testCredentialStore();
  await testConnectorCRUD();
  await testCredentialManagement();
  await testConnectionTesting();
  await testSchemaDiscovery();
  await testFieldMapping();
  await testSyncLifecycle();
  await testCredentialSecurity();
  await testTenantIsolation();

  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`Phase 14 Tests: ${passCount} passed, ${failCount} failed`);
  console.log("════════════════════════════════════════════════════════════");

  if (failCount > 0) {
    console.log("❌ Some tests failed!");
    process.exit(1);
  } else {
    console.log("✅ All Phase 14 verification tests passed!");
    process.exit(0);
  }
}

runAllTests().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});
