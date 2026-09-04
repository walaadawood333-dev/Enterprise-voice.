import { CONTROL_CENTER_STATUSES, DEMO_ORGANIZATION_ID, type RequestContext } from "../../shared/contracts";
import { createConnectorCredentialStore, scrubCredentials } from "../connectors/credentials";
import { createConnectorProviderRegistry } from "../connectors/providers/registry";
import { createMemoryDb } from "../db/store";
import { createApp } from "../http/router";
import { createLogger } from "../lib/observability";
import { createAuditService } from "../services/audit";
import { connectorControlStatus, createConnectorService } from "../services/connectors";
import { telephonyControlStatus } from "../services/providerControlCenter";

let passed = 0;
let failed = 0;
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
async function test(name: string, run: () => void | Promise<void>) {
  try { await run(); console.log(`  ✓ ${name}`); passed += 1; }
  catch (error) { console.error(`  ✗ ${name}: ${(error as Error).message}`); failed += 1; }
}

const logger = createLogger("error", () => undefined);
const context = (role: string, organizationId = DEMO_ORGANIZATION_ID): RequestContext => ({
  requestId: `p15_${Math.random().toString(36).slice(2)}`,
  organizationId,
  userId: "usr_prompt15",
  role: role as RequestContext["role"],
  authMode: "bearer",
  tokenPresented: true,
  at: new Date().toISOString(),
});

async function main() {
  console.log("\nCENTERAI Prompt 15 — Providers & Connectors Control Center\n");

  await test("connector registry displays only actually registered adapters", () => {
    const registry = createConnectorProviderRegistry(logger);
    const registrations = registry.listRegistrations();
    assert(registrations.length === 1, "expected the one real connector adapter");
    assert(registrations[0]?.provider.info.id === "salesforce", "unexpected/fabricated connector adapter");
  });

  await test("recursive credential scrubbing covers arrays and key variants", () => {
    const value = scrubCredentials({
      safe: "visible",
      nested: [{ client_secret: "never", detail: { accessToken: "never-too", count: 2 } }],
      passwordHash: "never-three",
    });
    const serialized = JSON.stringify(value);
    assert(serialized.includes("visible") && serialized.includes("count"), "safe metadata was removed");
    assert(!serialized.includes("never"), "credential material survived recursive scrub");
  });

  await test("credential-shaped configuration is rejected before persistence", async () => {
    const db = createMemoryDb();
    const service = createConnectorService({ db });
    const before = await db.connectors.count("org_secret_test");
    let rejected = false;
    try {
      await service.createConnector("org_secret_test", {
        name: "Unsafe",
        provider: "custom",
        type: "CUSTOM_API",
        configuration: { nested: [{ clientSecret: "must-not-persist" }] },
      });
    } catch (error) {
      rejected = (error as Error).message === "CREDENTIALS_NOT_ALLOWED_IN_CONFIGURATION";
    }
    assert(rejected, "secret-bearing configuration was accepted");
    assert((await db.connectors.count("org_secret_test")) === before, "unsafe row was persisted");
  });

  await test("tenant connector reads and credentials are organization isolated", async () => {
    const db = createMemoryDb();
    const registry = createConnectorProviderRegistry(logger);
    const store = createConnectorCredentialStore();
    const service = createConnectorService({ db, providerRegistry: registry, credentialStore: store, logger });
    const connector = await service.createConnector("org_a", { name: "A", provider: "salesforce", type: "CRM" });
    await service.storeCredentials("org_a", connector.id, {
      clientId: "id", clientSecret: "secret-a", username: "user@example.com",
      password: "password-a", securityToken: "token-a",
    });
    assert(Boolean(await service.getConnector("org_a", connector.id)), "owner tenant cannot read connector");
    assert((await service.getConnector("org_b", connector.id)) === undefined, "foreign tenant read connector");
    assert(await service.hasCredentials("org_a", connector.id), "owner tenant credentials missing");
    assert(!(await service.hasCredentials("org_b", connector.id)), "foreign tenant discovered credentials");
  });

  await test("connection tests never infer success when no adapter supports a real test", async () => {
    const db = createMemoryDb();
    const service = createConnectorService({ db });
    const connector = await service.createConnector("org_test", { name: "No adapter", provider: "custom", type: "CUSTOM_API" });
    await db.connectors.update(connector.id, "org_test", { status: "CONNECTED", healthStatus: "HEALTHY", enabled: true });
    const result = await service.testConnection("org_test", connector.id);
    assert(result.success === false, "simulated/inferred connection success returned");
    assert(result.diagnostics?.error === "CONNECTION_TEST_UNAVAILABLE", "missing truthful unavailable diagnostic");
  });

  await test("connector lifecycle audits created, updated, tested, and disabled without secrets", async () => {
    const db = createMemoryDb();
    const registry = createConnectorProviderRegistry(logger);
    const store = createConnectorCredentialStore();
    const audit = createAuditService(db);
    const service = createConnectorService({ db, providerRegistry: registry, credentialStore: store, audit, logger });
    const connector = await service.createConnector("org_audit", { name: "Audited", provider: "salesforce", type: "CRM" });
    await service.testConnection("org_audit", connector.id);
    await service.storeCredentials("org_audit", connector.id, {
      clientId: "id-audit", clientSecret: "secret-audit", username: "audit@example.com",
      password: "password-audit", securityToken: "token-audit",
    });
    await service.updateConnector("org_audit", connector.id, { enabled: false });
    const events = await audit.listByOrg("org_audit");
    const actions = events.map((event) => event.action);
    assert(actions.includes("CONNECTOR_CREATED"), "created event missing");
    assert(actions.includes("CONNECTOR_UPDATED"), "updated event missing");
    assert(actions.includes("CONNECTOR_TESTED"), "tested event missing");
    assert(actions.includes("CONNECTOR_DISABLED"), "disabled event missing");
    const serialized = JSON.stringify(events);
    for (const secret of ["secret-audit", "password-audit", "token-audit"]) {
      assert(!serialized.includes(secret), `audit leaked ${secret}`);
    }
  });

  await test("tenant roles cannot access platform provider registry", async () => {
    const app = createApp({ envSource: {}, logger });
    let forbidden = false;
    try {
      await app.handle({ method: "GET", path: "/api/admin/providers", headers: {} }, context("owner"));
    } catch (error) {
      forbidden = (error as { code?: string }).code === "FORBIDDEN";
    }
    assert(forbidden, "tenant owner crossed platform provider boundary");
    const response = await app.handle(
      { method: "GET", path: "/api/admin/providers", headers: {} },
      context("platform_admin")
    );
    assert(response.status === 200, "platform admin could not read registry");
    const body = response.body as { telephonyProviders: unknown[]; connectorProviders: Array<{ id: string }> };
    assert(body.connectorProviders.length === 1 && body.connectorProviders[0]?.id === "salesforce", "admin registry was fabricated");
  });

  await test("viewer can read connector registry but cannot mutate connectors", async () => {
    const app = createApp({ envSource: {}, logger });
    await app.ready;
    const read = await app.handle({ method: "GET", path: "/api/connectors/providers", headers: {} }, context("viewer"));
    assert(read.status === 200, "viewer should be able to read safe registry metadata");
    let forbidden = false;
    try {
      await app.handle(
        { method: "POST", path: "/api/connectors", headers: {}, body: { name: "Denied", provider: "salesforce" } },
        context("viewer")
      );
    } catch (error) {
      forbidden = (error as { code?: string }).code === "FORBIDDEN";
    }
    assert(forbidden, "viewer mutated connector state");
  });

  await test("credential API responses never echo submitted values", async () => {
    const app = createApp({ envSource: {}, logger });
    await app.ready;
    const owner = context("owner");
    const created = await app.handle(
      { method: "POST", path: "/api/connectors", headers: {}, body: { name: "API redaction", provider: "salesforce" } },
      owner
    );
    const connectorId = (created.body as { id: string }).id;
    const credentials = {
      clientId: "api-id", clientSecret: "api-secret-value", username: "api@example.com",
      password: "api-password-value", securityToken: "api-token-value",
    };
    const stored = await app.handle(
      { method: "POST", path: `/api/connectors/${connectorId}/credentials`, headers: {}, body: credentials },
      owner
    );
    const read = await app.handle({ method: "GET", path: `/api/connectors/${connectorId}`, headers: {} }, owner);
    const serialized = JSON.stringify([stored.body, read.body, await app.audit.listByOrg(DEMO_ORGANIZATION_ID)]);
    Object.values(credentials).forEach((value) => assert(!serialized.includes(value), `API/audit leaked ${value}`));
  });

  await test("provider tests and disable operations are platform-scoped and audited", async () => {
    const app = createApp({ envSource: {}, logger });
    const admin = context("platform_admin");
    const providers = await app.handle({ method: "GET", path: "/api/admin/providers", headers: {} }, admin);
    const providerId = (providers.body as { telephonyProviders: Array<{ id: string }> }).telephonyProviders[0]?.id;
    assert(Boolean(providerId), "no registered provider available for lifecycle test");
    await app.handle({ method: "POST", path: `/api/admin/providers/${providerId}/test`, headers: {}, body: {} }, admin);
    await app.handle({ method: "PATCH", path: `/api/admin/providers/${providerId}`, headers: {}, body: { enabled: false } }, admin);
    const events = await app.audit.listAll();
    const metadata = events.map((event) => event.metadata);
    assert(metadata.some((item) => item.lifecycle === "tested"), "provider tested audit missing");
    assert(metadata.some((item) => item.lifecycle === "disabled"), "provider disabled audit missing");
  });

  await test("all control-center health states use the constrained vocabulary", async () => {
    const app = createApp({ envSource: {}, logger });
    const allowed = new Set<string>(CONTROL_CENTER_STATUSES);
    for (const entry of app.providerRegistry.list()) assert(allowed.has(telephonyControlStatus(entry)), "invalid provider status");
    const cases = [
      connectorControlStatus({ enabled: false, status: "DRAFT", healthStatus: "UNKNOWN" }, false),
      connectorControlStatus({ enabled: true, status: "CONNECTED", healthStatus: "HEALTHY" }, true),
      connectorControlStatus({ enabled: true, status: "ERROR", healthStatus: "DEGRADED" }, true),
      connectorControlStatus({ enabled: false, status: "DISABLED", healthStatus: "UNKNOWN" }, true),
    ];
    cases.forEach((status) => assert(allowed.has(status), `invalid connector status ${status}`));
    const response = await app.handle({ method: "GET", path: "/api/admin/providers", headers: {} }, context("platform_admin"));
    const serialized = JSON.stringify(response.body);
    for (const forbidden of ["HEALTHY", "DISABLED", "DRAFT", "CONFIGURING"]) {
      assert(!serialized.includes(`\"status\":\"${forbidden}\"`), `raw status ${forbidden} escaped`);
    }
  });

  console.log(`\nPrompt 15: ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}

void main();
