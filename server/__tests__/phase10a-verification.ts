/**
 * Phase 10A — SaaS Architecture Verification Suite
 *
 * Tests:
 * 1. Entitlement engine initialization
 * 2. Default plans seeded
 * 3. Feature entitlement checks
 * 4. Effective limits calculation
 * 5. Limit enforcement
 * 6. Workspace bootstrap API
 * 7. Platform admin role detection
 * 8. Subscription status checks
 * 9. Branding configuration
 * 10. Audit event creation
 * 11. Existing functionality preserved
 */

import { createMemoryDb, newId } from "../db/store";
import { createEntitlementEngine, seedDefaultPlans, DEFAULT_PLANS } from "../services/entitlements";
import { createWorkspaceBootstrapService } from "../services/workspace";

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

async function runTests() {
  // ─── TEST 1: Entitlement Engine Initialization ───────────────────────
  section("1. Entitlement Engine Initialization");

  const db = createMemoryDb();
  const engine = createEntitlementEngine(db);

  assert(engine !== null, "Entitlement engine created");
  assert(typeof engine.hasFeature === "function", "hasFeature method exists");
  assert(typeof engine.getEnabledFeatures === "function", "getEnabledFeatures method exists");
  assert(typeof engine.getEffectiveLimits === "function", "getEffectiveLimits method exists");
  assert(typeof engine.checkLimit === "function", "checkLimit method exists");
  assert(typeof engine.getSubscription === "function", "getSubscription method exists");
  assert(typeof engine.isSubscriptionActive === "function", "isSubscriptionActive method exists");

  // ─── TEST 2: Default Plans Seeded ────────────────────────────────────
  section("2. Default Plans Seeded");

  await seedDefaultPlans(db);
  const plans = await db.plans.list();

  assert(plans.length === 3, "Three default plans created");
  assert(plans.some((p) => p.planType === "starter"), "Starter plan exists");
  assert(plans.some((p) => p.planType === "professional"), "Professional plan exists");
  assert(plans.some((p) => p.planType === "enterprise"), "Enterprise plan exists");

  // Test idempotency — seeding again should not create duplicates
  await seedDefaultPlans(db);
  const plans2 = await db.plans.list();
  assert(plans2.length === 3, "Seeding is idempotent");

  // ─── TEST 3: Feature Entitlement Checks ──────────────────────────────
  section("3. Feature Entitlement Checks");

  // Create a test organization and subscription
  const orgId = newId("org");
  await db.organizations.create({ id: orgId, name: "Test Org", slug: "test-org" });

  const starterPlan = plans.find((p) => p.planType === "starter")!;
  const subId = newId("sub");
  await db.subscriptions.create({
    id: subId,
    organizationId: orgId,
    planId: starterPlan.id,
    status: "ACTIVE",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelledAt: null,
  });

  // Starter plan has ai_agents, voice_calls, analytics
  const hasAiAgents = await engine.hasFeature(orgId, "ai_agents");
  assert(hasAiAgents === true, "Starter plan has ai_agents feature");

  const hasVoiceCalls = await engine.hasFeature(orgId, "voice_calls");
  assert(hasVoiceCalls === true, "Starter plan has voice_calls feature");

  const hasCampaigns = await engine.hasFeature(orgId, "campaigns");
  assert(hasCampaigns === false, "Starter plan does NOT have campaigns feature");

  const hasCustomBranding = await engine.hasFeature(orgId, "custom_branding");
  assert(hasCustomBranding === false, "Starter plan does NOT have custom_branding");

  // Test non-existent org
  const hasFeatureNoOrg = await engine.hasFeature("nonexistent", "ai_agents");
  assert(hasFeatureNoOrg === false, "Non-existent org has no features");

  // ─── TEST 4: Effective Limits Calculation ────────────────────────────
  section("4. Effective Limits Calculation");

  const limits = await engine.getEffectiveLimits(orgId);
  assert(limits.maxUsers === 5, "Starter plan maxUsers is 5");
  assert(limits.maxAgents === 3, "Starter plan maxAgents is 3");
  assert(limits.maxMonthlyMinutes === 1000, "Starter plan maxMonthlyMinutes is 1000");
  assert(limits.maxCampaigns === 0, "Starter plan maxCampaigns is 0");

  // Test custom effective limits override
  const orgId2 = newId("org");
  await db.organizations.create({ id: orgId2, name: "Custom Org", slug: "custom-org" });
  const proPlan = plans.find((p) => p.planType === "professional")!;
  await db.subscriptions.create({
    id: newId("sub"),
    organizationId: orgId2,
    planId: proPlan.id,
    status: "ACTIVE",
    effectiveLimits: {
      maxUsers: 100,
      maxAgents: 50,
      maxMonthlyMinutes: 50000,
      maxCampaigns: 20,
      maxConnectors: 10,
    },
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelledAt: null,
  });

  const customLimits = await engine.getEffectiveLimits(orgId2);
  assert(customLimits.maxUsers === 100, "Custom limits override: maxUsers is 100");
  assert(customLimits.maxAgents === 50, "Custom limits override: maxAgents is 50");

  // ─── TEST 5: Limit Enforcement ───────────────────────────────────────
  section("5. Limit Enforcement");

  const limitCheck1 = await engine.checkLimit(orgId, "maxAgents", 2);
  assert(limitCheck1.allowed === true, "Under limit: 2 agents with max 3");

  const limitCheck2 = await engine.checkLimit(orgId, "maxAgents", 3);
  assert(limitCheck2.allowed === false, "At limit: 3 agents with max 3");

  const limitCheck3 = await engine.checkLimit(orgId, "maxAgents", 5);
  assert(limitCheck3.allowed === false, "Over limit: 5 agents with max 3");

  // ─── TEST 6: Workspace Bootstrap API ─────────────────────────────────
  section("6. Workspace Bootstrap API");

  const bootstrap = createWorkspaceBootstrapService(db, engine);
  assert(bootstrap !== null, "Workspace bootstrap service created");

  // Create a test user
  const userId = newId("usr");
  const user = await db.users.create({
    organizationId: orgId,
    email: "test@example.com",
    name: "Test User",
    role: "owner",
  });
  const org = await db.organizations.get(orgId);
  assert(org !== undefined, "Organization exists for bootstrap");

  const bootstrapResult = await bootstrap.getBootstrap(user, org!);
  assert(bootstrapResult !== null, "Bootstrap result generated");
  assert(bootstrapResult.user.id === user.id, "Bootstrap has correct user");
  assert(bootstrapResult.organization.id === orgId, "Bootstrap has correct organization");
  assert(bootstrapResult.subscription.planType === "starter", "Bootstrap has correct plan type");
  assert(Array.isArray(bootstrapResult.entitlements), "Bootstrap has entitlements array");
  assert(bootstrapResult.entitlements.includes("ai_agents"), "Bootstrap entitlements include ai_agents");
  assert(!bootstrapResult.entitlements.includes("campaigns"), "Bootstrap entitlements exclude campaigns");
  assert(Array.isArray(bootstrapResult.enabledModules), "Bootstrap has enabledModules");
  assert(bootstrapResult.enabledModules.includes("overview"), "Bootstrap includes overview module");
  assert(bootstrapResult.enabledModules.includes("agents"), "Bootstrap includes agents module");
  assert(!bootstrapResult.enabledModules.includes("campaigns"), "Bootstrap excludes campaigns module");
  assert(!bootstrapResult.user.isPlatformAdmin, "Regular user is not platform admin");

  // Check branding defaults
  assert(bootstrapResult.organization.branding.primaryColor === "#000000", "Default primary color");
  assert(bootstrapResult.organization.branding.accentColor === "#3b82f6", "Default accent color");
  assert(bootstrapResult.organization.branding.theme === "light", "Default theme is light");

  // ─── TEST 7: Platform Admin Role Detection ───────────────────────────
  section("7. Platform Admin Role Detection");

  // Create a platform admin user
  const adminUserId = newId("usr");
  const adminUser = await db.users.create({
    organizationId: orgId,
    email: "admin@centerai.jo",
    name: "Platform Admin",
    role: "super_admin" as any,
  });

  const adminBootstrap = await bootstrap.getBootstrap(adminUser, org!);
  assert(adminBootstrap.user.isPlatformAdmin === true, "Platform admin detected correctly");

  // ─── TEST 8: Subscription Status Checks ──────────────────────────────
  section("8. Subscription Status Checks");

  const isActive = await engine.isSubscriptionActive(orgId);
  assert(isActive === true, "ACTIVE subscription is active");

  // Create a suspended subscription
  const orgId3 = newId("org");
  await db.organizations.create({ id: orgId3, name: "Suspended Org", slug: "suspended-org" });
  await db.subscriptions.create({
    id: newId("sub"),
    organizationId: orgId3,
    planId: starterPlan.id,
    status: "SUSPENDED",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelledAt: null,
  });

  const isSuspendedActive = await engine.isSubscriptionActive(orgId3);
  assert(isSuspendedActive === false, "SUSPENDED subscription is not active");

  const suspendedFeatures = await engine.getEnabledFeatures(orgId3);
  assert(suspendedFeatures.length === 0, "Suspended org has no features");

  // Test TRIAL status
  const orgId4 = newId("org");
  await db.organizations.create({ id: orgId4, name: "Trial Org", slug: "trial-org" });
  await db.subscriptions.create({
    id: newId("sub"),
    organizationId: orgId4,
    planId: starterPlan.id,
    status: "TRIAL",
    effectiveLimits: null,
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelledAt: null,
  });

  const isTrialActive = await engine.isSubscriptionActive(orgId4);
  assert(isTrialActive === true, "TRIAL subscription is active");

  // ─── TEST 9: Branding Configuration ──────────────────────────────────
  section("9. Branding Configuration");

  // Create branding for org
  const branding = await db.branding.upsert({
    id: newId("brand"),
    organizationId: orgId,
    displayName: "Custom Display Name",
    logoUrl: null,
    primaryColor: "#ff6600",
    accentColor: "#00ff66",
    theme: "dark",
  });

  assert(branding.displayName === "Custom Display Name", "Custom display name saved");
  assert(branding.primaryColor === "#ff6600", "Custom primary color saved");
  assert(branding.theme === "dark", "Custom theme saved");

  // Bootstrap should reflect branding
  const brandedBootstrap = await bootstrap.getBootstrap(user, org!);
  assert(brandedBootstrap.organization.branding.displayName === "Custom Display Name", "Bootstrap reflects custom branding");
  assert(brandedBootstrap.organization.branding.primaryColor === "#ff6600", "Bootstrap reflects custom color");
  assert(brandedBootstrap.organization.branding.theme === "dark", "Bootstrap reflects custom theme");

  // ─── TEST 10: Audit Event Creation ───────────────────────────────────
  section("10. Audit Event Creation");

  const auditEvent = await db.audit.create({
    organizationId: orgId,
    actorId: userId,
    actorEmail: "test@example.com",
    action: "ORGANIZATION_UPDATED",
    metadata: { field: "name", oldValue: "Old", newValue: "New" },
    ipAddress: null,
  });

  assert(auditEvent.id !== null, "Audit event created with ID");
  assert(auditEvent.action === "ORGANIZATION_UPDATED", "Audit event has correct action");
  assert(auditEvent.organizationId === orgId, "Audit event is scoped to organization");
  assert(auditEvent.actorEmail === "test@example.com", "Audit event has actor email");

  // Verify no secrets in metadata
  const meta = auditEvent.metadata as Record<string, any>;
  assert(!("password" in meta), "No password in audit metadata");
  assert(!("secret" in meta), "No secret in audit metadata");
  assert(!("apiKey" in meta), "No apiKey in audit metadata");

  // List audit events
  const auditList = await db.audit.listByOrg(orgId);
  assert(auditList.length >= 1, "Audit events listed for organization");

  // ─── TEST 11: Existing Functionality Preserved ───────────────────────
  section("11. Existing Functionality Preserved");

  // Verify organizations still work
  const orgList = await db.organizations.list();
  assert(orgList.length >= 4, "Organizations list works");

  // Verify users still work
  const userList = await db.users.listByOrg(orgId);
  assert(userList.length >= 1, "Users list works");

  // Verify agents still work
  const agentList = await db.agents.listByOrg(orgId);
  assert(Array.isArray(agentList), "Agents list works");

  // Verify usage still works
  const usageSummary = await db.usage.summarize(orgId);
  assert(typeof usageSummary.sessions === "number", "Usage summary works");

  // ─── SUMMARY ─────────────────────────────────────────────────────────

  console.log("\n" + "═".repeat(60));
  console.log(`Phase 10A Tests: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(60));

  if (failed > 0) {
    console.log("\nFailed tests:");
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    process.exit(1);
  } else {
    console.log("\n✓ All Phase 10A verification tests passed!");
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
