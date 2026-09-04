/**
 * Prompt 18 — End-to-end application activation verification.
 *
 * Exercises the application through the Fetch adapter wherever possible: identity issuance,
 * persisted organization/role resolution, tenant operations, isolation, and the platform control
 * plane. The final source-wiring test is deliberately limited to client routing contracts because
 * this repository has no browser runner or installed browser binary.
 */

import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { createMemoryDb } from "../db/store";
import { createDemoAuth } from "../http/auth/demo";
import { createFetchHandler } from "../http/middleware";
import { createApp } from "../http/router";
import { createLogger } from "../lib/observability";

let passed = 0;
let failed = 0;

async function test(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`  ✗ ${name}: ${(error as Error).message}`);
    failed += 1;
  }
}

interface SessionResult {
  bearerToken: string;
  session: {
    userId: string;
    organizationId: string;
    role: string;
    organization: { id: string; name: string };
  };
}

async function main() {
  console.log("\nCENTERAI Prompt 18 — End-to-End Application Activation\n");

  const db = createMemoryDb();
  const broker = createDemoAuth();
  const app = createApp({
    db,
    auth: broker,
    logger: createLogger("error", () => undefined),
    envSource: { RATE_LIMIT_MAX: "1000" },
  });
  await app.ready;
  const fetchHandler = createFetchHandler(app);

  const request = async (
    path: string,
    init: { method?: string; token?: string; body?: unknown; origin?: string } = {}
  ) => {
    const method = init.method ?? "GET";
    const headers = new Headers();
    if (init.token) headers.set("authorization", `Bearer ${init.token}`);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    if (!(["GET", "HEAD"].includes(method))) headers.set("origin", init.origin ?? "http://localhost:5173");
    return fetchHandler(new Request(`http://localhost:5173${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }));
  };

  const json = async <T>(response: Response): Promise<T> => response.json() as Promise<T>;
  const expectStatus = async (response: Response, expected: number, label: string) => {
    if (response.status !== expected) {
      const detail = await response.text().catch(() => "");
      assert.fail(`${label}: expected ${expected}, received ${response.status}: ${detail.slice(0, 300)}`);
    }
  };
  const register = async (email: string, organizationName: string): Promise<SessionResult> => {
    const response = await request("/api/auth/register", {
      method: "POST",
      body: { name: email.split("@")[0], email, password: "ActivationPass12345", organizationName },
    });
    await expectStatus(response, 201, `register ${email}`);
    const result = await json<SessionResult>(response);
    assert.ok(result.bearerToken, "registration did not issue a bearer token");
    return result;
  };

  let tenantA!: SessionResult;
  let tenantB!: SessionResult;
  let createdAgentId = "";
  let createdCampaignId = "";
  let createdSessionId = "";

  await test("anonymous public entry APIs work while every tenant API requires a session", async () => {
    for (const path of ["/api/health", "/api/public/branding", "/api/voice/capabilities", "/api/config"]) {
      await expectStatus(await request(path), 200, path);
    }
    for (const path of ["/api/auth/me", "/api/workspace/overview", "/api/agents", "/api/admin/overview"]) {
      await expectStatus(await request(path), 401, `anonymous ${path}`);
    }
  });

  await test("registration resolves an authenticated user into the persisted tenant workspace", async () => {
    tenantA = await register("activation-owner-a@example.com", "Activation Tenant A");
    tenantB = await register("activation-customer-b@example.com", "Activation Tenant B");

    const meResponse = await request("/api/auth/me", { token: tenantA.bearerToken });
    await expectStatus(meResponse, 200, "auth me");
    const me = await json<SessionResult["session"]>(meResponse);
    assert.equal(me.organizationId, tenantA.session.organizationId);
    assert.equal(me.userId, tenantA.session.userId);
    assert.equal(me.role, "owner");

    const bootstrapResponse = await request("/api/workspace/bootstrap", { token: tenantA.bearerToken });
    await expectStatus(bootstrapResponse, 200, "workspace bootstrap");
    const bootstrap = await json<{ organization: { id: string }; user: { id: string } }>(bootstrapResponse);
    assert.equal(bootstrap.organization.id, tenantA.session.organizationId);
    assert.equal(bootstrap.user.id, tenantA.session.userId);
  });

  await test("customer can traverse real read-only workspace modules but not admin surfaces", async () => {
    const orgB = tenantB.session.organizationId;
    await db.users.update(orgB, tenantB.session.userId, { role: "viewer" });
    const paths = [
      "/api/workspace/bootstrap",
      "/api/workspace/overview",
      "/api/workspace/calls",
      "/api/workspace/live",
      "/api/agents",
      "/api/workspace/agents/performance",
      "/api/workspace/campaigns",
      "/api/workspace/analytics",
      "/api/organizations",
    ];
    for (const path of paths) await expectStatus(await request(path, { token: tenantB.bearerToken }), 200, path);
    await expectStatus(
      await request("/api/agents", { method: "POST", token: tenantB.bearerToken, body: { name: "Denied" } }),
      403,
      "viewer agent create"
    );
    await expectStatus(await request("/api/admin/overview", { token: tenantB.bearerToken }), 403, "tenant admin denial");
  });

  await test("owner completes agent, session, campaign, telephony, analytics, and settings journeys", async () => {
    const orgId = tenantA.session.organizationId;
    const enterprise = await db.plans.get("plan_enterprise");
    assert.ok(enterprise, "enterprise plan seed is unavailable");
    await db.subscriptions.create({
      organizationId: orgId,
      planId: enterprise.id,
      status: "active",
      effectiveLimits: null,
      trialEndsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelledAt: null,
    });

    const agentResponse = await request("/api/agents", {
      method: "POST",
      token: tenantA.bearerToken,
      body: {
        name: "Activation Agent",
        description: "Prompt 18 operational journey",
        language: "en",
        industry: "Banking",
        voice: "layla-service",
        systemPrompt: "Be concise and never invent customer information.",
        welcomeMessage: "Welcome to the activation test.",
        status: "draft",
      },
    });
    await expectStatus(agentResponse, 201, "agent create");
    createdAgentId = (await json<{ id: string }>(agentResponse)).id;
    assert.ok(createdAgentId);

    const sessionResponse = await request("/api/voice/sessions", {
      method: "POST",
      token: tenantA.bearerToken,
      body: { agentId: createdAgentId, language: "en", testMode: true },
    });
    await expectStatus(sessionResponse, 201, "voice session create");
    const createdSession = await json<{ session: { id: string } }>(sessionResponse);
    createdSessionId = createdSession.session.id;
    assert.ok(createdSessionId);

    await expectStatus(await request(`/api/voice/sessions/${createdSessionId}/messages`, {
      method: "POST", token: tenantA.bearerToken, body: { text: "Please confirm this simulated session." },
    }), 200, "voice turn");
    await expectStatus(await request(`/api/voice/sessions/${createdSessionId}/end`, {
      method: "POST", token: tenantA.bearerToken, body: { outcome: "completed" },
    }), 200, "voice session end");

    const campaignResponse = await request("/api/workspace/campaigns", {
      method: "POST",
      token: tenantA.bearerToken,
      body: { name: "Activation Campaign", agentId: createdAgentId, direction: "outbound", totalContacts: 0 },
    });
    await expectStatus(campaignResponse, 201, "campaign create");
    createdCampaignId = (await json<{ id: string }>(campaignResponse)).id;
    assert.ok(createdCampaignId);

    const inbound = await request("/api/telephony/calls/simulate/inbound", {
      method: "POST", token: tenantA.bearerToken,
      body: { agentId: createdAgentId, fromNumber: "+962790000001", toNumber: "+96265000000" },
    });
    await expectStatus(inbound, 200, "simulated inbound call");
    assert.ok((await json<{ id: string; events: unknown[] }>(inbound)).events.length > 0);

    const outbound = await request("/api/telephony/calls/simulate/outbound", {
      method: "POST", token: tenantA.bearerToken,
      body: { agentId: createdAgentId, fromNumber: "+96265000000", toNumber: "+962790000002" },
    });
    await expectStatus(outbound, 200, "simulated outbound call");

    const settings = await request("/api/organizations", {
      method: "PATCH", token: tenantA.bearerToken, body: { name: "Activation Tenant A Updated" },
    });
    await expectStatus(settings, 200, "organization settings update");
    assert.equal((await json<{ name: string }>(settings)).name, "Activation Tenant A Updated");

    const analyticsResponse = await request("/api/workspace/analytics", { token: tenantA.bearerToken });
    await expectStatus(analyticsResponse, 200, "workspace analytics");
    const analytics = await json<{ sessions: { total: number }; calls: { total: number } }>(analyticsResponse);
    assert.equal(analytics.sessions.total, (await db.sessions.listByOrg(orgId)).length, "session metric is not database-backed");
    assert.equal(analytics.calls.total, (await db.calls.listByOrg(orgId)).length, "call metric is not database-backed");
    assert.ok(analytics.sessions.total >= 1 && analytics.calls.total >= 2);
  });

  await test("cross-tenant identifiers remain hidden across agents, campaigns, and sessions", async () => {
    const token = tenantB.bearerToken;
    for (const path of [
      `/api/agents/${createdAgentId}`,
      `/api/workspace/campaigns/${createdCampaignId}`,
      `/api/voice/sessions/${createdSessionId}`,
    ]) {
      await expectStatus(await request(path, { token }), 404, `cross-tenant ${path}`);
    }
  });

  await test("tenant administrator reaches team, settings, integrations, and compliance with scoped RBAC", async () => {
    const orgId = tenantA.session.organizationId;
    await db.users.update(orgId, tenantA.session.userId, { role: "admin" });
    const adminPaths = [
      "/api/users",
      "/api/organizations",
      "/api/connectors/control-center",
      "/api/workspace/compliance/policies",
      "/api/workspace/audit",
    ];
    for (const path of adminPaths) await expectStatus(await request(path, { token: tenantA.bearerToken }), 200, path);
    await expectStatus(await request("/api/organizations", {
      method: "PATCH", token: tenantA.bearerToken, body: { name: "Activation Tenant A Administered" },
    }), 200, "tenant administrator organization settings");
  });

  await test("platform administrator login reaches the complete control plane and no tenant API", async () => {
    const platformOrg = await db.organizations.create({
      id: "org_activation_platform",
      name: "CenterAI Platform Operations",
      slug: "activation-platform-operations",
      status: "active",
    });
    const platformUser = await db.users.create({
      organizationId: platformOrg.id,
      email: "activation-platform-admin@example.com",
      name: "Activation Platform Admin",
      role: "platform_admin",
      status: "active",
    });
    await db.users.setPassword(platformUser.id, await broker.hashPassword("PlatformPass12345"));

    const loginResponse = await request("/api/auth/login", {
      method: "POST",
      body: { email: "activation-platform-admin@example.com", password: "PlatformPass12345" },
    });
    await expectStatus(loginResponse, 200, "platform login");
    const platform = await json<SessionResult>(loginResponse);
    assert.equal(platform.session.role, "platform_admin");

    const controlPlanePaths = [
      "/api/admin/overview",
      "/api/admin/organizations",
      "/api/admin/v2/users?limit=100",
      "/api/admin/plans",
      "/api/admin/subscriptions",
      `/api/admin/entitlements?organizationId=${tenantA.session.organizationId}`,
      "/api/admin/providers",
      "/api/admin/usage",
      "/api/admin/v2/health",
      "/api/admin/v2/audit?limit=100",
    ];
    for (const path of controlPlanePaths) {
      await expectStatus(await request(path, { token: platform.bearerToken }), 200, path);
    }
    await expectStatus(
      await request("/api/workspace/overview", { token: platform.bearerToken }),
      403,
      "platform identity tenant-surface denial"
    );
  });

  await test("logout revokes the active customer session", async () => {
    const response = await request("/api/auth/logout", {
      method: "POST", token: tenantB.bearerToken, body: {},
    });
    await expectStatus(response, 200, "logout");
    await expectStatus(await request("/api/auth/me", { token: tenantB.bearerToken }), 401, "revoked session");
  });

  await test("client routing wires public, guest, tenant, admin, unavailable, and Demo states", async () => {
    const [appSource, guards, workspaceRoutes, workspaceNav, adminRoutes, adminNav, contacts, adminOps, authHook] =
      await Promise.all([
        readFile("src/App.tsx", "utf8"),
        readFile("src/auth/RouteGuards.tsx", "utf8"),
        readFile("src/workspace/WorkspaceApp.tsx", "utf8"),
        readFile("src/workspace/components/WorkspaceLayout.tsx", "utf8"),
        readFile("src/admin/AdminApp.tsx", "utf8"),
        readFile("src/admin/components/AdminLayout.tsx", "utf8"),
        readFile("src/workspace/pages/WorkspaceContacts.tsx", "utf8"),
        readFile("src/admin/pages/AdminOperationalPages.tsx", "utf8"),
        readFile("src/hooks/useAuth.ts", "utf8"),
      ]);
    for (const route of ['path="/"', 'path="/login"', 'path="/register"', 'path="/workspace/*"', 'path="/admin/*"']) {
      assert.ok(appSource.includes(route), `missing application route ${route}`);
    }
    assert.ok(guards.includes("authenticatedHome(session)"), "authenticated public-entry redirect is missing");
    assert.ok(authHook.includes('"/admin/overview"') && authHook.includes('"/workspace/overview"'), "role-safe home routing is missing");
    for (const route of ["overview", "calls", "live", "agents", "campaigns", "analytics", "team", "integrations", "compliance", "settings", "plan"]) {
      assert.ok(workspaceRoutes.includes(`path="${route}`), `workspace route ${route} is missing`);
      assert.ok(workspaceNav.includes(`/workspace/${route}`), `workspace navigation ${route} is missing`);
    }
    for (const route of ["overview", "organizations", "users", "plans", "subscriptions", "entitlements", "providers", "connectors", "usage", "health", "audit", "settings"]) {
      assert.ok(adminRoutes.includes(`path="${route}`), `admin route ${route} is missing`);
      assert.ok(adminNav.includes(`/admin/${route}`), `admin navigation ${route} is missing`);
    }
    assert.ok(workspaceNav.includes("DEMO MODE · simulated providers only"), "Demo Mode is not visibly labelled");
    assert.ok(contacts.includes("Not configured"), "contacts unavailable state is not explicit");
    assert.ok(adminOps.includes("Not configured"), "platform settings unavailable state is not explicit");
  });

  console.log(`\nPrompt 18 activation: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
