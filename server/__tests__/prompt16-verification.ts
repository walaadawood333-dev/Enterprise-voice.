import type { PlanRow, RequestContext } from "../../shared/contracts";
import { createMemoryDb, type Db } from "../db/store";
import { createApp } from "../http/router";
import { ApiError, createLogger } from "../lib/observability";
import { createBillingService } from "../services/billing";
import { createEntitlementEngine, seedDefaultPlans } from "../services/entitlements";
import { createUsageFoundationService } from "../services/usageFoundation";

let passed = 0;
let failed = 0;
const logger = createLogger("error", () => undefined);
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
async function test(name: string, run: () => void | Promise<void>) {
  try { await run(); console.log(`  ✓ ${name}`); passed += 1; }
  catch (error) { console.error(`  ✗ ${name}: ${(error as Error).message}`); failed += 1; }
}

const context = (organizationId: string, role = "owner"): RequestContext => ({
  requestId: `p16_${Math.random().toString(36).slice(2)}`,
  organizationId,
  userId: "usr_prompt16",
  role: role as RequestContext["role"],
  authMode: "bearer",
  tokenPresented: true,
  at: new Date().toISOString(),
});

async function createOrganizationWithPlan(
  db: Db,
  organizationId: string,
  limits: PlanRow["limits"],
  features: PlanRow["features"] = ["ai_agents", "voice_calls", "campaigns", "data_connectors"]
) {
  await db.organizations.create({ id: organizationId, name: organizationId, slug: organizationId, status: "active" });
  const planId = `plan_${organizationId}`;
  await db.plans.create({ id: planId, name: `${organizationId} plan`, planType: "custom", status: "active", features, limits });
  await db.subscriptions.create({
    organizationId,
    planId,
    status: "active",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelledAt: null,
  });
}

const standardLimits = { maxUsers: 10, maxAgents: 10, maxMonthlyMinutes: 100, maxCampaigns: 10, maxConnectors: 10 };

async function main() {
  console.log("\nCENTERAI Prompt 16 — Usage, Limits & Billing Foundation\n");

  const db = createMemoryDb();
  await seedDefaultPlans(db);
  await createOrganizationWithPlan(db, "org_usage_a", standardLimits);
  await createOrganizationWithPlan(db, "org_usage_b", standardLimits);

  await db.sessions.create({
    id: "session_usage_a", organizationId: "org_usage_a", agentId: "agent_a", userId: null,
    language: "en", mode: "production", engine: "openai",
  });
  const call = await db.calls.create({
    id: "call_usage_a", organizationId: "org_usage_a", agentId: null, voiceSessionId: "session_usage_a",
    provider: "registered-provider", providerCallId: null, direction: "outbound", status: "created",
    fromNumber: null, toNumber: null,
  });
  await db.calls.update(call.id, "org_usage_a", { status: "completed", durationSeconds: 75, endedAt: new Date().toISOString() });
  const campaign = await db.campaigns.create({
    organizationId: "org_usage_a", name: "Persisted campaign", description: "", agentId: null,
    status: "running", direction: "outbound", scheduledAt: null, startedAt: new Date().toISOString(),
    completedAt: null, totalContacts: 12, configuration: {},
  });
  await db.campaigns.update(campaign.id, "org_usage_a", { processedContacts: 7, completedCalls: 5, failedCalls: 2 });
  await db.usage.record({ organizationId: "org_usage_a", sessionId: "session_usage_a", eventType: "audio_seconds", quantity: 90 });

  const entitlements = createEntitlementEngine(db);
  const usage = createUsageFoundationService({ db, entitlements });

  await test("tenant usage is calculated from persisted events and domain rows", async () => {
    const report = await usage.tenant("org_usage_a");
    assert(report.usage.voice.audioSeconds === 90 && report.usage.voice.minutes === 1.5, "voice usage mismatch");
    assert(report.usage.sessions.total === 1, "session usage mismatch");
    assert(report.usage.calls.total === 1 && report.usage.calls.durationSeconds === 75, "call usage mismatch");
    assert(report.usage.campaigns.total === 1 && report.usage.campaigns.processedContacts === 7, "campaign usage mismatch");
    assert(report.empty === false, "non-empty report marked empty");
  });

  await test("empty tenants return explicit zero-valued empty state", async () => {
    const report = await usage.tenant("org_usage_b");
    assert(report.empty, "empty tenant was not marked empty");
    assert(report.usage.voice.audioSeconds === 0 && report.usage.sessions.total === 0, "empty metrics were fabricated");
  });

  await test("tenant endpoint ignores client-supplied organization identifiers", async () => {
    const app = createApp({ db, logger });
    await app.ready;
    const response = await app.handle(
      {
        method: "GET", path: "/api/usage/foundation", headers: {},
        query: { organizationId: "org_usage_b" },
      },
      context("org_usage_a")
    );
    assert(response.status === 200, "tenant usage endpoint failed");
    assert((response.body as { organizationId: string }).organizationId === "org_usage_a", "tenant selected another organization");
  });

  await test("platform aggregation is admin-only and totals all tenant rows", async () => {
    const app = createApp({ db, logger });
    await app.ready;
    let forbidden = false;
    try {
      await app.handle({ method: "GET", path: "/api/admin/usage", headers: {} }, context("org_usage_a", "owner"));
    } catch (error) {
      forbidden = error instanceof ApiError && error.code === "FORBIDDEN";
    }
    assert(forbidden, "tenant accessed platform aggregate");
    const response = await app.handle(
      { method: "GET", path: "/api/admin/usage", headers: {} },
      context("org_usage_a", "platform_admin")
    );
    const report = response.body as Awaited<ReturnType<typeof usage.platform>>;
    assert(report.totals.voice.audioSeconds === 90, "platform voice aggregate mismatch");
    assert(report.totals.calls.total === 1 && report.totals.campaigns.total === 1, "platform domain aggregate mismatch");
    assert(report.byOrganization.some((row) => row.organizationId === "org_usage_b" && row.empty), "empty tenant missing from aggregate");
  });

  await test("authoritative limit usage comes from backend repositories", async () => {
    const state = await entitlements.getCurrentLimitUsage("org_usage_a");
    assert(state.maxMonthlyMinutes === 1.5, "monthly voice usage was not persisted usage");
    assert(state.maxCampaigns === 1, "campaign count was not repository-backed");
    const limit = await entitlements.checkCurrentLimit("org_usage_a", "maxMonthlyMinutes");
    assert(limit.current === 1.5 && limit.limit === 100 && limit.allowed, "plan limit did not resolve");
  });

  await test("concurrent API requests cannot exceed an agent limit", async () => {
    const limitDb = createMemoryDb();
    await createOrganizationWithPlan(limitDb, "org_limit_agents", { ...standardLimits, maxAgents: 1 });
    const app = createApp({ db: limitDb, logger });
    await app.ready;
    const responses = await Promise.allSettled([
      app.handle({ method: "POST", path: "/api/agents", headers: {}, body: { name: "Agent one" } }, context("org_limit_agents")),
      app.handle({ method: "POST", path: "/api/agents", headers: {}, body: { name: "Agent two" } }, context("org_limit_agents")),
    ]);
    assert(responses.filter((result) => result.status === "fulfilled").length === 1, "concurrent creates bypassed maxAgents");
    assert((await limitDb.agents.listByOrg("org_limit_agents")).length === 1, "more than one agent was persisted");
  });

  await test("campaign and connector API limits fail closed", async () => {
    const limitDb = createMemoryDb();
    await createOrganizationWithPlan(limitDb, "org_limit_resources", {
      ...standardLimits, maxCampaigns: 0, maxConnectors: 0,
    });
    const app = createApp({ db: limitDb, logger });
    await app.ready;
    for (const request of [
      { method: "POST" as const, path: "/api/workspace/campaigns", headers: {}, body: { name: "Blocked campaign" } },
      { method: "POST" as const, path: "/api/connectors", headers: {}, body: { name: "Blocked connector", provider: "salesforce" } },
    ]) {
      let forbidden = false;
      try { await app.handle(request, context("org_limit_resources")); }
      catch (error) { forbidden = error instanceof ApiError && error.code === "FORBIDDEN"; }
      assert(forbidden, `${request.path} bypassed a zero limit`);
    }
    assert(await limitDb.campaigns.count("org_limit_resources") === 0, "blocked campaign persisted");
    assert(await limitDb.connectors.count("org_limit_resources") === 0, "blocked connector persisted");
  });

  await test("voice and telephony APIs enforce persisted monthly usage", async () => {
    const limitDb = createMemoryDb();
    await createOrganizationWithPlan(limitDb, "org_limit_voice", { ...standardLimits, maxMonthlyMinutes: 1 });
    await limitDb.usage.record({ organizationId: "org_limit_voice", eventType: "audio_seconds", quantity: 60 });
    const app = createApp({ db: limitDb, logger });
    await app.ready;
    for (const request of [
      { method: "POST" as const, path: "/api/voice/session", headers: {}, body: { agentId: "any", language: "en" } },
      { method: "POST" as const, path: "/api/telephony/calls", headers: {}, body: { agentId: "any", toNumber: "+962700000000" } },
      { method: "POST" as const, path: "/api/telephony/calls/simulate/outbound", headers: {}, body: { agentId: "any" } },
    ]) {
      let forbidden = false;
      try { await app.handle(request, context("org_limit_voice")); }
      catch (error) { forbidden = error instanceof ApiError && error.code === "FORBIDDEN"; }
      assert(forbidden, `${request.path} bypassed monthly persisted usage limit`);
    }
  });

  await test("feature entitlements remain independent from numeric limits", async () => {
    const noFeatureDb = createMemoryDb();
    await createOrganizationWithPlan(noFeatureDb, "org_no_campaign_feature", standardLimits, ["ai_agents"]);
    const app = createApp({ db: noFeatureDb, logger });
    await app.ready;
    let forbidden = false;
    try {
      await app.handle(
        { method: "POST", path: "/api/workspace/campaigns", headers: {}, body: { name: "No feature" } },
        context("org_no_campaign_feature")
      );
    } catch (error) { forbidden = error instanceof ApiError && error.code === "FORBIDDEN"; }
    assert(forbidden, "numeric capacity bypassed missing entitlement");
  });

  await test("billing is explicitly NOT_CONFIGURED and creates no financial rows", async () => {
    const billing = createBillingService({ db, logger });
    const status = await billing.getBillingConfig("org_usage_a");
    assert(status.status === "NOT_CONFIGURED" && status.paymentProvider === null, "billing status was ambiguous");
    let refused = false;
    try {
      await billing.generateInvoice({
        organizationId: "org_usage_a", subscriptionId: "sub_fake",
        periodStart: new Date(0).toISOString(), periodEnd: new Date().toISOString(),
      });
    } catch (error) { refused = error instanceof ApiError && error.code === "PROVIDER_NOT_CONFIGURED"; }
    assert(refused, "invoice generation did not fail closed");
    assert((await db.invoices.listByOrg("org_usage_a")).length === 0, "fake invoice persisted");
    assert((await db.payments.listByOrg("org_usage_a")).length === 0, "fake payment persisted");
  });

  console.log(`\nPrompt 16: ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}

void main();
