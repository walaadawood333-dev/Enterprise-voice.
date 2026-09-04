import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { RequestContext } from "../../shared/contracts";
import { createConnectorService } from "../services/connectors";
import { createMemoryDb } from "../db/store";
import { createDemoAuth } from "../http/auth/demo";
import { createFetchHandler } from "../http/middleware";
import { createApp } from "../http/router";
import { createLogger, redact, toApiError } from "../lib/observability";
import { createAuditService } from "../services/audit";
import { createBrandingSecurityService } from "../services/brandingSecurity";
import { createExternalUrlBrandingAssetStore } from "../services/tenantBranding";
import { createAuthorizationService } from "../services/authorization";
import { escapeCsvCell } from "../services/reports";
import { SalesforceProvider } from "../connectors/providers/salesforce";
import { resolveEnv } from "../config/env";
import { SignalWireProvider } from "../telephony/providers/signalwire";

let passed = 0;
let failed = 0;
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
async function test(name: string, run: () => void | Promise<void>) {
  try { await run(); console.log(`  ✓ ${name}`); passed += 1; }
  catch (error) { console.error(`  ✗ ${name}: ${(error as Error).message}`); failed += 1; }
}
const logger = createLogger("error", () => undefined);
const context = (organizationId: string, role = "owner"): RequestContext => ({
  requestId: `p17_${Math.random().toString(36).slice(2)}`,
  organizationId,
  userId: "usr_security",
  role: role as RequestContext["role"],
  authMode: "demo",
  tokenPresented: true,
  at: new Date().toISOString(),
});

async function main() {
  console.log("\nCENTERAI Prompt 17 — Enterprise Security Regression Suite\n");

  await test("production and Demo Mode refuse anonymous tenant requests", async () => {
    for (const [production, envSource] of [
      [true, { APP_MODE: "production", APP_URL: "https://app.centerai.test", CORS_ORIGINS: "https://app.centerai.test" }],
      [false, {}],
    ] as const) {
      const app = createApp({ envSource, auth: createDemoAuth(), logger });
      const response = await app.handleSafe({ method: "GET", path: "/api/agents", headers: {}, ip: "anonymous" });
      assert(response.status === 503 || response.status === 401, "anonymous request received a tenant identity");
      if (production) assert(app.auth === undefined, "production retained a demo identity broker");
    }
  });

  await test("actual HTTP auth supports register, logout, login, and token revocation", async () => {
    const app = createApp({ envSource: {}, auth: createDemoAuth(), logger });
    const fetchHandler = createFetchHandler(app);
    const register = await fetchHandler(new Request("http://localhost:5173/api/auth/register", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ name: "Security Owner", email: "security@example.com", password: "SecurePass12345", organizationName: "Security Org" }),
    }));
    assert(register.status === 201, `register returned ${register.status}`);
    const registered = await register.json() as { bearerToken?: string };
    assert(Boolean(registered.bearerToken), "demo registration did not issue an in-memory token");
    const auth = { authorization: `Bearer ${registered.bearerToken}` };
    const me = await fetchHandler(new Request("http://localhost:5173/api/auth/me", { headers: auth }));
    assert(me.status === 200, "issued token did not authenticate");
    const logout = await fetchHandler(new Request("http://localhost:5173/api/auth/logout", {
      method: "POST", headers: { ...auth, "content-type": "application/json" }, body: "{}",
    }));
    assert(logout.status === 200, "logout failed");
    const revoked = await fetchHandler(new Request("http://localhost:5173/api/auth/me", { headers: auth }));
    assert(revoked.status === 401, "logged-out token remained valid");
    const login = await fetchHandler(new Request("http://localhost:5173/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ email: "security@example.com", password: "SecurePass12345" }),
    }));
    assert(login.status === 200, "login after logout failed");
  });

  await test("Demo Mode uses the same RBAC matrix as production", async () => {
    const authz = createAuthorizationService({ db: createMemoryDb(), logger });
    assert(!authz.hasPermission("viewer", "demo", "agent.create"), "demo viewer bypassed authorization");
    const app = createApp({ envSource: {}, logger });
    let denied = false;
    try {
      await app.handle({ method: "POST", path: "/api/agents", headers: {}, body: { name: "Denied" } }, context("org_demo", "viewer"));
    } catch (error) { denied = (error as { code?: string }).code === "FORBIDDEN"; }
    assert(denied, "viewer mutation reached the route");
  });

  await test("tenant resource identifiers are resolved against server-side ownership", async () => {
    const db = createMemoryDb();
    await db.organizations.create({ id: "org_security_a", name: "A", slug: "security-a", status: "active" });
    await db.organizations.create({ id: "org_security_b", name: "B", slug: "security-b", status: "active" });
    await db.agents.create({ id: "agent_security_b", organizationId: "org_security_b", name: "Foreign", description: "", language: "en", industry: "Banking", voice: "voice", systemPrompt: "safe", welcomeMessage: "hello", status: "draft" });
    const app = createApp({ db, logger });
    await app.ready;
    let hidden = false;
    try {
      await app.handle({ method: "GET", path: "/api/agents/agent_security_b", headers: {} }, context("org_security_a"));
    } catch (error) { hidden = (error as { code?: string }).code === "NOT_FOUND"; }
    assert(hidden, "foreign agent identifier was disclosed");
  });

  await test("connector mappings validate their parent before mutation", async () => {
    const db = createMemoryDb();
    const service = createConnectorService({ db });
    const one = await service.createConnector("org_mapping", { name: "One", provider: "custom", type: "CUSTOM_API" });
    const two = await service.createConnector("org_mapping", { name: "Two", provider: "custom", type: "CUSTOM_API" });
    const mapping = await service.createMapping("org_mapping", one.id, { sourceField: "Name", targetField: "name" });
    const result = await service.updateMapping("org_mapping", two.id, mapping.id, { targetField: "attacker" });
    const unchanged = await service.getMapping("org_mapping", one.id, mapping.id);
    assert(result === undefined && unchanged?.targetField === "name", "wrong-parent update mutated a mapping");
  });

  await test("cookie-authenticated mutations enforce trusted Origin and CORS allow-lists", async () => {
    const app = createApp({ envSource: { APP_URL: "https://app.centerai.test", CORS_ORIGINS: "https://app.centerai.test" }, logger });
    const handler = createFetchHandler(app);
    const rejected = await handler(new Request("https://app.centerai.test/api/auth/logout", {
      method: "POST", headers: { cookie: "centerai_session=fake", origin: "https://evil.example", "content-type": "application/json" }, body: "{}",
    }));
    assert(rejected.status === 403, "cross-origin cookie mutation was accepted");
    assert(!rejected.headers.has("access-control-allow-origin"), "untrusted origin received CORS permission");
    const trusted = await handler(new Request("https://app.centerai.test/api/health", { headers: { origin: "https://app.centerai.test" } }));
    assert(trusted.headers.get("access-control-allow-origin") === "https://app.centerai.test", "trusted origin was not allowed");
    assert(trusted.headers.get("x-frame-options") === "DENY", "security headers missing");
  });

  await test("body parsing rejects oversized, malformed, and unsupported input", async () => {
    const app = createApp({ envSource: { MAX_BODY_BYTES: "64" }, logger });
    const handler = createFetchHandler(app);
    const cases: Array<[Request, number]> = [
      [new Request("http://localhost:5173/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }), 400],
      [new Request("http://localhost:5173/api/auth/login", { method: "POST", headers: { "content-type": "text/plain" }, body: "hello" }), 400],
      [new Request("http://localhost:5173/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "x".repeat(200) }) }), 413],
    ];
    for (const [request, status] of cases) assert((await handler(request)).status === status, "invalid body was accepted");
  });

  await test("rate limiting blocks repeated requests", async () => {
    const app = createApp({ envSource: { RATE_LIMIT_MAX: "2", RATE_LIMIT_WINDOW_MS: "60000" }, logger });
    const one = await app.handleSafe({ method: "GET", path: "/api/health", headers: {}, ip: "same" });
    const two = await app.handleSafe({ method: "GET", path: "/api/health", headers: {}, ip: "same" });
    const three = await app.handleSafe({ method: "GET", path: "/api/health", headers: {}, ip: "same" });
    assert(one.status === 200 && two.status === 200 && three.status === 429, "rate limit did not enforce its bucket");
  });

  await test("public configuration, logger fields, and audit metadata redact secrets", async () => {
    const lines: string[] = [];
    const redactingLogger = createLogger("debug", (line) => lines.push(line));
    const secret = "super-sensitive-token-value";
    redactingLogger.error("provider_failed", { detail: `Authorization: Bearer ${secret}`, nested: { error: `password=${secret}` } });
    assert(!lines.join("\n").includes(secret), "embedded log secret leaked");
    assert(!JSON.stringify(redact({ token: secret, safe: "yes" })).includes(secret), "key redaction failed");

    const db = createMemoryDb();
    const audit = createAuditService(db);
    const event = await audit.record({ organizationId: "org_audit_security", action: "ORGANIZATION_UPDATED", metadata: { detail: `access_token=${secret}`, password: secret } });
    assert(!JSON.stringify(event).includes(secret), "audit record leaked credential material");
    const app = createApp({ envSource: { OPENAI_API_KEY: secret, JWT_SECRET: secret.repeat(2), DATABASE_URL: `postgres://${secret}@db/x` }, logger });
    const config = await app.handleSafe({ method: "GET", path: "/api/config", headers: {}, ip: "config" });
    assert(!JSON.stringify(config.body).includes(secret), "public config exposed a secret value");
  });

  await test("XSS, upload boundaries, and unexpected errors fail safely", () => {
    const brandingSecurity = createBrandingSecurityService();
    const sanitized = brandingSecurity.sanitizeText('<img src=x onerror="alert(1)"><script>steal()</script>Safe', 100);
    assert(!/script|onerror|<|>/.test(sanitized), "branding sanitizer retained executable markup");
    const assets = createExternalUrlBrandingAssetStore(brandingSecurity);
    assert(assets.uploads === "not_configured", "upload storage was represented as configured");
    let unsafeUrlRejected = false;
    try { assets.normalizeExternalUrl("data:text/html,<script>alert(1)</script>"); }
    catch { unsafeUrlRejected = true; }
    assert(unsafeUrlRejected, "unsafe pseudo-upload URL was accepted");
    const publicError = toApiError(new Error("password=private-error-secret"), logger).toPublicBody();
    assert(!JSON.stringify(publicError).includes("private-error-secret"), "unexpected error detail reached the response");
  });

  await test("CSV exports neutralize spreadsheet formulas", () => {
    for (const value of ["=2+2", "+cmd", "-1+1", "@SUM(A1:A2)", "  =HYPERLINK(\"x\")"]) {
      assert(escapeCsvCell(value).replace(/^\"/, "").startsWith("'"), `formula prefix was not neutralized: ${value}`);
    }
  });

  await test("Salesforce validates SOQL identifiers, timestamps, limits, and login hosts", async () => {
    const provider = new SalesforceProvider(logger);
    assert(!provider.validateCredentials({ clientId: "a", clientSecret: "b", username: "c", password: "d", securityToken: "e", instanceUrl: "https://attacker.example" }), "Salesforce SSRF host accepted");
    let fetches = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { fetches += 1; throw new Error("should not fetch"); }) as typeof fetch;
    try {
      const result = await provider.syncInbound({
        organizationId: "org_sf", connectorId: "connector_sf", credentials: { clientId: "a", clientSecret: "b", username: "c", password: "d", securityToken: "e" },
        configuration: {}, direction: "INBOUND", objectType: "Contact WHERE Name != null", since: "2024-01-01T00:00:00Z OR Id != null", limit: 99999,
        mappings: [{ id: "map_sf", connectorId: "connector_sf", sourceField: "Name, Password__c", targetField: "name", dataType: "string", required: false, transformerType: null, displayOrder: 0 }],
      });
      assert(!result.success && fetches === 0, "invalid SOQL input reached the provider network");
      assert(!JSON.stringify(result).includes("SELECT"), "SOQL query was disclosed in the result");
    } finally { globalThis.fetch = originalFetch; }
  });

  await test("all SignalWire callback routes require signatures over exact raw bytes", async () => {
    const previous = { ...process.env };
    const secret = "signalwire-webhook-secret-value";
    Object.assign(process.env, {
      SIGNALWIRE_PROJECT_ID: "project-security",
      SIGNALWIRE_API_TOKEN: "api-token-security",
      SIGNALWIRE_SPACE_URL: "https://security-space.signalwire.com",
      SIGNALWIRE_WEBHOOK_SECRET: secret,
    });
    const envSource = {
      APP_MODE: "production", NODE_ENV: "production", APP_URL: "https://app.centerai.test",
      CORS_ORIGINS: "https://app.centerai.test", DATABASE_URL: "postgres://db.example/centerai",
      JWT_SECRET: "jwt-secret-with-at-least-thirty-two-characters", OPENAI_API_KEY: "openai-security-key",
      SIGNALWIRE_PROJECT_ID: "project-security", SIGNALWIRE_API_TOKEN: "api-token-security",
      SIGNALWIRE_SPACE_URL: "https://security-space.signalwire.com", SIGNALWIRE_WEBHOOK_SECRET: secret,
    };
    try {
      const env = resolveEnv(envSource);
      const provider = new SignalWireProvider(env, logger);
      const app = createApp({ envSource, db: createMemoryDb(), telephonyProviders: [provider], logger });
      const handler = createFetchHandler(app);
      const payload = JSON.stringify({ event_type: "call.started", payload: { id: "provider_call_security", direction: "inbound", custom_parameters: JSON.stringify({ organizationId: "org_demo" }) } }, null, 2);
      const signature = createHmac("sha256", secret).update(payload).digest("hex");
      const valid = await handler(new Request("https://app.centerai.test/api/telephony/signalwire/webhook", { method: "POST", headers: { "content-type": "application/json", "x-signalwire-signature": signature }, body: payload }));
      assert(valid.status === 200, `exact-byte signed webhook returned ${valid.status}`);
      const callsBeforeReplay = await app.db.calls.listByOrg("org_demo");
      const eventsBeforeReplay = callsBeforeReplay.length
        ? await app.db.callEvents.listByCall(callsBeforeReplay[0]!.id)
        : [];
      const replay = await handler(new Request("https://app.centerai.test/api/telephony/signalwire/webhook", { method: "POST", headers: { "content-type": "application/json", "x-signalwire-signature": signature }, body: payload }));
      assert(replay.status === 200 && (await replay.json() as { duplicate?: boolean }).duplicate === true, "authenticated replay was not idempotent");
      assert((await app.db.calls.listByOrg("org_demo")).length === callsBeforeReplay.length, "replay created a duplicate call");
      assert((await app.db.callEvents.listByCall(callsBeforeReplay[0]!.id)).length === eventsBeforeReplay.length, "replay created a duplicate event");
      const forgedReplay = await handler(new Request("https://app.centerai.test/api/telephony/signalwire/webhook", { method: "POST", headers: { "content-type": "application/json", "x-signalwire-signature": "0".repeat(64) }, body: payload }));
      assert(forgedReplay.status === 401, "a known event id bypassed signature verification");
      for (const path of ["webhook", "laml", "voice"]) {
        const invalid = await handler(new Request(`https://app.centerai.test/api/telephony/signalwire/${path}`, { method: "POST", headers: { "content-type": "application/json", "x-signalwire-signature": "invalid" }, body: "{}" }));
        assert(invalid.status === 401, `${path} accepted an invalid signature`);
      }
      const lamlBody = "CallSid=call_security&From=%2B962700000000";
      const lamlSignature = createHmac("sha256", secret).update(lamlBody).digest("hex");
      const laml = await handler(new Request("https://app.centerai.test/api/telephony/signalwire/laml", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-signalwire-signature": lamlSignature }, body: lamlBody }));
      assert(laml.status === 200 && (await laml.text()).startsWith("<?xml"), "signed LaML did not return raw XML");
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
      Object.assign(process.env, previous);
    }
  });

  await test("client source does not persist sessions or import server credential values", async () => {
    const source = await readFile(new URL("../../src/api/index.ts", import.meta.url), "utf8");
    assert(!/localStorage\.setItem|sessionStorage\.setItem/.test(source), "client persisted a session token in web storage");
    assert(!/process\.env\.(?:OPENAI_API_KEY|JWT_SECRET|SIGNALWIRE_API_TOKEN)/.test(source), "client referenced server secret values");
  });

  console.log(`\nPrompt 17 security: ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}

void main();
