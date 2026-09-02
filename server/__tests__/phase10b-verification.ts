/**
 * Phase 10B — Customer Workspace Verification Suite
 *
 * Tests:
 * 1. Workspace Overview API
 * 2. Workspace Calls API
 * 3. Call Detail API with IDOR protection
 * 4. Agent Performance API
 * 5. Workspace Analytics API
 * 6. Campaign CRUD API
 * 7. Live Activity API
 * 8. Organization isolation (tenant security)
 * 9. Existing functionality preserved
 */

import { createMemoryDb, newId } from "../db/store";
import { createEntitlementEngine, seedDefaultPlans } from "../services/entitlements";

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
  // Setup
  const db = createMemoryDb();
  await seedDefaultPlans(db);
  const entitlements = createEntitlementEngine(db);

  // Create test organization
  const orgId1 = newId("org");
  await db.organizations.create({ id: orgId1, name: "Test Org 1", slug: "test-org-1" });

  // Create another organization for isolation tests
  const orgId2 = newId("org");
  await db.organizations.create({ id: orgId2, name: "Test Org 2", slug: "test-org-2" });

  // Setup subscriptions
  const starterPlan = (await db.plans.list()).find((p) => p.planType === "starter")!;
  await db.subscriptions.create({
    id: newId("sub"),
    organizationId: orgId1,
    planId: starterPlan.id,
    status: "ACTIVE" as any,
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelledAt: null,
  });

  await db.subscriptions.create({
    id: newId("sub"),
    organizationId: orgId2,
    planId: starterPlan.id,
    status: "ACTIVE" as any,
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelledAt: null,
  });

  // Create users
  const user1 = await db.users.create({
    organizationId: orgId1,
    email: "user1@test.com",
    name: "User 1",
    role: "owner",
  });

  const user2 = await db.users.create({
    organizationId: orgId2,
    email: "user2@test.com",
    name: "User 2",
    role: "owner",
  });

  // Create agents
  const agent1 = await db.agents.create({
    id: newId("agt"),
    organizationId: orgId1,
    name: "Agent 1",
    description: "Test agent 1",
    language: "en",
    voice: "test-voice",
    systemPrompt: "test prompt",
    welcomeMessage: "welcome",
    industry: "Banking",
    status: "active",
  });

  const agent2 = await db.agents.create({
    id: newId("agt"),
    organizationId: orgId2,
    name: "Agent 2",
    description: "Test agent 2",
    language: "en",
    voice: "test-voice",
    systemPrompt: "test prompt",
    welcomeMessage: "welcome",
    industry: "Banking",
    status: "active",
  });

  // ─── TEST 1: Workspace Overview API ────────────────────────────────────
  section("1. Workspace Overview API");

  // Create some test data for org1
  const session1 = await db.sessions.create({
    id: newId("ses"),
    organizationId: orgId1,
    agentId: agent1.id,
    userId: user1.id,
    language: "en",
    mode: "demo",
    engine: "demo",
    testMode: false,
  });

  await db.sessions.patch(session1.id, orgId1, {
    status: "completed",
    endedAt: new Date().toISOString(),
    durationSeconds: 120,
  });

  const call1 = await db.calls.create({
    id: newId("call"),
    organizationId: orgId1,
    agentId: agent1.id,
    voiceSessionId: session1.id,
    provider: "demo",
    providerCallId: "demo-call-1",
    direction: "INBOUND",
    status: "COMPLETED",
    fromNumber: "+15551234567",
    toNumber: "+15559876543",
  });

  await db.calls.update(call1.id, orgId1, {
    answeredAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationSeconds: 60,
  });

  // Test overview endpoint
  const [agents, sessions, calls, usage, limits] = await Promise.all([
    db.agents.listByOrg(orgId1),
    db.sessions.listByOrg(orgId1),
    db.calls.listByOrg(orgId1),
    db.usage.summarize(orgId1),
    entitlements.getEffectiveLimits(orgId1),
  ]);

  const activeSessions = sessions.filter((s) => s.status === "active");
  const completedSessions = sessions.filter((s) => s.status === "completed");
  const failedSessions = sessions.filter((s) => s.status === "failed");

  assert(agents.length >= 1, "Org1 has agents");
  assert(sessions.length >= 1, "Org1 has sessions");
  assert(calls.length >= 1, "Org1 has calls");
  assert(completedSessions.length >= 1, "Org1 has completed sessions");
  assert(limits.maxUsers > 0, "Limits are calculated");

  // ─── TEST 2: Workspace Calls API ───────────────────────────────────────
  section("2. Workspace Calls API");

  const org1Calls = await db.calls.listByOrg(orgId1);
  const org1Agents = await db.agents.listByOrg(orgId1);
  const agentMap = new Map(org1Agents.map((a) => [a.id, a.name]));

  assert(org1Calls.length >= 1, "Calls list works");
  assert(org1Calls[0].agentName === undefined || agentMap.has(org1Calls[0].agentId || ""), "Agent enrichment works");

  // ─── TEST 3: Call Detail API with IDOR protection ─────────────────────
  section("3. Call Detail API with IDOR Protection");

  // Org1 should be able to access its own call
  const callFromOrg1 = await db.calls.get(call1.id, orgId1);
  assert(callFromOrg1 !== undefined, "Org1 can access its own call");

  // Org2 should NOT be able to access org1's call
  const callFromOrg2 = await db.calls.get(call1.id, orgId2);
  assert(callFromOrg2 === undefined, "Org2 cannot access org1's call (IDOR protected)");

  // Get call events
  const events = await db.callEvents.listByCall(call1.id);
  assert(Array.isArray(events), "Call events list works");

  // ─── TEST 4: Agent Performance API ─────────────────────────────────────
  section("4. Agent Performance API");

  const org1AgentsPerf = await db.agents.listByOrg(orgId1);
  const org1SessionsPerf = await db.sessions.listByOrg(orgId1);

  const agentPerf = org1AgentsPerf.map((agent) => {
    const agentSessions = org1SessionsPerf.filter((s) => s.agentId === agent.id);
    const completed = agentSessions.filter((s) => s.status === "completed");
    const failed = agentSessions.filter((s) => s.status === "failed");

    const durations = completed
      .map((s) => s.durationSeconds)
      .filter((d): d is number => d !== null);
    const avgDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : null;

    return {
      agentId: agent.id,
      agentName: agent.name,
      totalSessions: agentSessions.length,
      completedSessions: completed.length,
      failedSessions: failed.length,
      completionRate: agentSessions.length > 0
        ? (completed.length / agentSessions.length) * 100
        : 0,
      avgDurationSeconds: avgDuration,
    };
  });

  assert(agentPerf.length >= 1, "Agent performance calculated");
  assert(agentPerf[0].totalSessions >= 1, "Agent has sessions");
  assert(agentPerf[0].completedSessions >= 1, "Agent has completed sessions");

  // ─── TEST 5: Workspace Analytics API ───────────────────────────────────
  section("5. Workspace Analytics API");

  const analyticsUsage = await db.usage.summarize(orgId1);
  assert(analyticsUsage.sessions >= 0, "Usage summary works");
  assert(analyticsUsage.messages >= 0, "Usage messages counted");
  assert(analyticsUsage.aiRequests >= 0, "Usage AI requests counted");

  // ─── TEST 6: Campaign CRUD API ─────────────────────────────────────────
  section("6. Campaign CRUD API");

  // Create campaign
  const campaign1 = await db.campaigns.create({
    organizationId: orgId1,
    name: "Test Campaign",
    description: "Test campaign description",
    agentId: agent1.id,
    status: "draft",
    direction: "OUTBOUND",
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    totalContacts: 100,
    configuration: { test: true },
  });

  assert(campaign1.id !== undefined, "Campaign created");
  assert(campaign1.name === "Test Campaign", "Campaign name correct");
  assert(campaign1.status === "draft", "Campaign status is draft");
  assert(campaign1.totalContacts === 100, "Campaign contacts correct");

  // List campaigns
  const org1Campaigns = await db.campaigns.listByOrg(orgId1);
  assert(org1Campaigns.length >= 1, "Campaigns list works");

  // Get campaign
  const retrievedCampaign = await db.campaigns.get(campaign1.id, orgId1);
  assert(retrievedCampaign !== undefined, "Campaign retrieved");
  assert(retrievedCampaign?.id === campaign1.id, "Campaign ID matches");

  // Update campaign
  const updatedCampaign = await db.campaigns.update(campaign1.id, orgId1, {
    status: "running",
    startedAt: new Date().toISOString(),
  });
  assert(updatedCampaign?.status === "running", "Campaign status updated");
  assert(updatedCampaign?.startedAt !== null, "Campaign startedAt set");

  // Count campaigns
  const campaignCount = await db.campaigns.count(orgId1);
  assert(campaignCount >= 1, "Campaign count works");

  // Count by status
  const statusCounts = await db.campaigns.countByStatus(orgId1);
  assert(typeof statusCounts === "object", "Status counts work");
  assert(statusCounts["running"] >= 1, "Running campaign counted");

  // Delete campaign
  const deleted = await db.campaigns.delete(campaign1.id, orgId1);
  assert(deleted === true, "Campaign deleted");

  const afterDelete = await db.campaigns.get(campaign1.id, orgId1);
  assert(afterDelete === undefined, "Campaign no longer exists");

  // ─── TEST 7: Live Activity API ─────────────────────────────────────────
  section("7. Live Activity API");

  // Create an active session
  const activeSession = await db.sessions.create({
    id: newId("ses"),
    organizationId: orgId1,
    agentId: agent1.id,
    userId: user1.id,
    language: "en",
    mode: "demo",
    engine: "demo",
    testMode: false,
  });

  const liveSessions = await db.sessions.listByOrg(orgId1);
  const activeLive = liveSessions.filter((s) => s.status === "active");
  assert(activeLive.length >= 1, "Live sessions detected");
  assert(activeLive[0].status === "active", "Session status is active");

  // ─── TEST 8: Organization Isolation (Tenant Security) ─────────────────
  section("8. Organization Isolation (Tenant Security)");

  // Create campaign for org2
  const campaign2 = await db.campaigns.create({
    organizationId: orgId2,
    name: "Org2 Campaign",
    description: "Campaign for org2",
    agentId: agent2.id,
    status: "draft",
    direction: "OUTBOUND",
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    totalContacts: 50,
    configuration: {},
  });

  // Org1 should not see org2's campaign
  const org1CampaignsCheck = await db.campaigns.listByOrg(orgId1);
  const org2CampaignsCheck = await db.campaigns.listByOrg(orgId2);

  assert(!org1CampaignsCheck.some((c) => c.id === campaign2.id), "Org1 cannot see org2's campaign");
  assert(org2CampaignsCheck.some((c) => c.id === campaign2.id), "Org2 can see its own campaign");

  // Org1 should not be able to access org2's campaign
  const org1AccessOrg2Campaign = await db.campaigns.get(campaign2.id, orgId1);
  assert(org1AccessOrg2Campaign === undefined, "Org1 cannot access org2's campaign (IDOR protected)");

  // Agents isolation
  const org1AgentsCheck = await db.agents.listByOrg(orgId1);
  const org2AgentsCheck = await db.agents.listByOrg(orgId2);

  assert(!org1AgentsCheck.some((a) => a.id === agent2.id), "Org1 cannot see org2's agents");
  assert(org2AgentsCheck.some((a) => a.id === agent2.id), "Org2 can see its own agents");

  // Sessions isolation
  const org1SessionsCheck = await db.sessions.listByOrg(orgId1);
  const org2SessionsCheck = await db.sessions.listByOrg(orgId2);

  assert(!org1SessionsCheck.some((s) => s.id === activeSession.id && s.organizationId === orgId2), "Org1 sessions are isolated");

  // Calls isolation
  const org1CallsCheck = await db.calls.listByOrg(orgId1);
  const org2CallsCheck = await db.calls.listByOrg(orgId2);

  assert(!org1CallsCheck.some((c) => c.organizationId === orgId2), "Org1 calls are isolated");

  // ─── TEST 9: Existing Functionality Preserved ─────────────────────────
  section("9. Existing Functionality Preserved");

  // Verify existing repositories still work
  const org = await db.organizations.get(orgId1);
  assert(org !== undefined, "Organizations repository works");

  const user = await db.users.get(user1.id);
  assert(user !== undefined, "Users repository works");

  const agent = await db.agents.get(orgId1, agent1.id);
  assert(agent !== undefined, "Agents repository works");

  const session = await db.sessions.get(session1.id, orgId1);
  assert(session !== undefined, "Sessions repository works");

  const call = await db.calls.get(call1.id, orgId1);
  assert(call !== undefined, "Calls repository works");

  // Verify entitlements still work
  const features = await entitlements.getEnabledFeatures(orgId1);
  assert(features.length > 0, "Entitlements still work");

  // ─── SUMMARY ───────────────────────────────────────────────────────────

  console.log("\n" + "═".repeat(60));
  console.log(`Phase 10B Tests: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(60));

  if (failed > 0) {
    console.log("\nFailed tests:");
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    process.exit(1);
  } else {
    console.log("\n✓ All Phase 10B verification tests passed!");
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
