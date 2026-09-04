import { createMemoryDb } from "../db/store";
import { createLogger, ApiError } from "../lib/observability";
import { createAuditService } from "../services/audit";
import { createBillingService } from "../services/billing";
import { createEntitlementEngine, seedDefaultPlans } from "../services/entitlements";
import { createSaasControlPlaneService } from "../services/saasControlPlane";
import { createApp } from "../http/router";
import type { RequestContext } from "../../shared/contracts";

let passed = 0;
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`  ✓ ${message}`);
};
const rejectsWith = async (run: () => Promise<unknown>, code: string, message: string) => {
  try { await run(); }
  catch (error) {
    check(error instanceof ApiError && error.code === code, message);
    return;
  }
  throw new Error(`FAIL: ${message} (did not reject)`);
};

async function main() {
  const db = createMemoryDb();
  const logger = createLogger("error", () => undefined);
  await seedDefaultPlans(db);
  const entitlementEngine = createEntitlementEngine(db);
  const audit = createAuditService(db);
  const control = createSaasControlPlaneService({ db, entitlements: entitlementEngine, audit });
  const actor = { id: "usr_platform_admin", email: "platform@centerai.test" };

  console.log("\nSaaS plans, subscriptions & entitlements");
  const plans = await control.listPlans();
  check(plans.length === 3, "built-in plans are seeded idempotently");
  check(plans.every((plan) => ["draft", "active", "archived"].includes(plan.status)), "every plan has a lifecycle status");
  check(plans.every((plan) => !Object.prototype.hasOwnProperty.call(plan, "priceCents")), "plans contain no invented commercial amount");

  const orgA = await db.organizations.create({ id: "org_saas_alpha", name: "Alpha", slug: "saas-alpha", status: "active" });
  const orgB = await db.organizations.create({ id: "org_saas_bravo", name: "Bravo", slug: "saas-bravo", status: "active" });
  const starter = plans.find((plan) => plan.planType === "starter")!;
  await control.setSubscription(orgA.id, { planId: starter.id, status: "active" }, actor);
  await control.setSubscription(orgB.id, { planId: starter.id, status: "active" }, actor);
  check((await entitlementEngine.getSubscription(orgA.id))?.plan.id === starter.id, "organization subscription resolves its plan");
  check(await entitlementEngine.hasFeature(orgA.id, "voice_calls"), "plan feature is enabled by default");

  await control.setEntitlement(orgA.id, "voice_calls", { enabled: false, reason: "Contract restriction" }, actor);
  check(!(await entitlementEngine.hasFeature(orgA.id, "voice_calls")), "explicit entitlement revocation overrides the plan");
  check(await entitlementEngine.hasFeature(orgB.id, "voice_calls"), "entitlement override is isolated from other tenants");
  check((await db.entitlements.listByOrg(orgB.id)).length === 0, "tenant-scoped entitlement repository does not leak rows");

  await rejectsWith(
    () => entitlementEngine.assertFeature(orgA.id, "voice_calls"),
    "FORBIDDEN",
    "backend feature guard blocks disabled AI voice"
  );
  const noSubscriptionOrg = await db.organizations.create({ id: "org_saas_none", name: "None", slug: "saas-none", status: "active" });
  check((await entitlementEngine.getEnabledFeatures(noSubscriptionOrg.id)).length === 0, "missing subscription fails closed");
  check((await entitlementEngine.getEffectiveLimits(noSubscriptionOrg.id)).maxAgents === 0, "missing subscription receives zero limits");

  await db.agents.create({
    id: "agt_saas_alpha", organizationId: orgA.id, name: "Alpha agent", description: "", industry: "Banking",
    language: "en", voice: "layla-service", systemPrompt: "Be concise", welcomeMessage: "Welcome to Alpha support.", status: "active",
  });
  await db.agents.create({
    id: "agt_saas_bravo", organizationId: orgB.id, name: "Bravo agent", description: "", industry: "Banking",
    language: "en", voice: "layla-service", systemPrompt: "Be concise", welcomeMessage: "Welcome to Bravo support.", status: "active",
  });

  const app = createApp({ db, logger, envSource: {} });
  await rejectsWith(
    () => app.voiceEngine.createSession({ organizationId: orgA.id, userId: "usr_alpha", agentId: "agt_saas_alpha" }),
    "FORBIDDEN",
    "voice execution service cannot bypass revoked entitlement"
  );
  const allowedSession = await app.voiceEngine.createSession({ organizationId: orgB.id, userId: "usr_bravo", agentId: "agt_saas_bravo" });
  check(Boolean(allowedSession.session.id), "another entitled tenant can create a voice session");

  const tenantContext: RequestContext = {
    organizationId: orgA.id, userId: "usr_alpha", role: "owner", authMode: "bearer",
    tokenPresented: true, requestId: "req_tenant", at: new Date().toISOString(),
  };
  const productionApp = createApp({
    db,
    logger,
    envSource: {
      APP_MODE: "production",
      DATABASE_URL: "postgresql://example.invalid/centerai",
      JWT_SECRET: "test-only-secret-with-at-least-32-characters",
      OPENAI_API_KEY: "test-only-openai-key",
      CORS_ORIGINS: "https://centerai.test",
      SIGNALWIRE_PROJECT_ID: "test-project",
      SIGNALWIRE_API_TOKEN: "test-token",
      SIGNALWIRE_SPACE_URL: "test.signalwire.com",
      SIGNALWIRE_WEBHOOK_SECRET: "test-webhook-secret",
    },
  });
  await rejectsWith(
    () => productionApp.handle(
      { method: "POST", path: "/api/voice/realtime/session", headers: {}, query: {}, body: { language: "en" } },
      tenantContext
    ),
    "FORBIDDEN",
    "production realtime credential path blocks revoked AI voice entitlement"
  );
  await rejectsWith(
    () => app.handle({ method: "GET", path: "/api/admin/plans", headers: {}, query: {} }, tenantContext),
    "FORBIDDEN",
    "tenant owner cannot access platform commercial administration"
  );
  const adminContext = { ...tenantContext, userId: "usr_platform_admin", role: "super_admin" as never, requestId: "req_admin" };
  const adminPlans = await app.handle({ method: "GET", path: "/api/admin/plans", headers: {}, query: {} }, adminContext);
  check(adminPlans.status === 200 && Array.isArray(adminPlans.body), "platform admin can list plans");

  await Promise.all(Array.from({ length: 201 }, () => db.usage.record({
    organizationId: orgB.id,
    eventType: "audio_seconds",
    quantity: 1,
  })));
  const alphaSummary = await control.getTenantSummary(orgA.id);
  const bravoSummary = await control.getTenantSummary(orgB.id);
  check(alphaSummary.subscription?.organizationId === orgA.id, "tenant summary is scoped to requesting organization");
  check(bravoSummary.subscription?.organizationId === orgB.id, "second tenant receives only its subscription");
  check(bravoSummary.usage.monthlyMinutes === 3.4, "monthly usage aggregation is not truncated at repository page limits");
  check(alphaSummary.capabilities.find((item) => item.feature === "voice_calls")?.source === "override", "tenant UI receives effective entitlement source");
  check(alphaSummary.billing.status === "NOT_CONFIGURED" && alphaSummary.billing.provider === null, "payment provider is explicitly not configured");

  const billing = createBillingService({ db, logger });
  await rejectsWith(
    () => billing.generateInvoice({ organizationId: orgA.id, subscriptionId: "sub", periodStart: "2026-09-01", periodEnd: "2026-10-01" }),
    "PROVIDER_NOT_CONFIGURED",
    "invoice generation refuses to create fake billing data"
  );
  check((await db.invoices.listByOrg(orgA.id)).length === 0, "refused billing attempt creates no invoice");
  check((await db.payments.listByOrg(orgA.id)).length === 0, "refused billing attempt creates no payment");

  const events = await db.audit.listAll();
  check(events.some((event) => event.action === "SUBSCRIPTION_CREATED" && event.organizationId === orgA.id), "subscription changes are audited");
  check(events.some((event) => event.action === "ENTITLEMENT_CHANGED" && event.organizationId === orgA.id), "entitlement changes are audited");
  check(!events.some((event) => event.organizationId === orgB.id && event.metadata.feature === "voice_calls"), "entitlement audit events preserve tenant isolation");

  console.log(`\n${passed} SaaS control-plane checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
