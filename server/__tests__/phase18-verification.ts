/**
 * Phase 18 Verification Tests
 * Tests enterprise reporting, analytics, and decision intelligence
 */

import { strict as assert } from "node:assert";
import { createMemoryDb, newId } from "../db/store";
import { KPIRegistry, createKPIRegistry } from "../services/kpiRegistry";
import { AnalyticsService, createAnalyticsService } from "../services/analytics";

async function runTests() {
  console.log("🧪 Phase 18 Verification Tests\n");

  const tests = {
    "KPI Registry": testKPIRegistry,
    "KPI Calculation": testKPICalculation,
    "Tenant Isolation": testTenantIsolation,
    "Time Range Filtering": testTimeRangeFiltering,
    "Empty States": testEmptyStates,
    "Platform Analytics": testPlatformAnalytics,
    "CSV Export": testCSVExport,
  };

  const results: { name: string; passed: boolean; error?: string }[] = [];

  for (const [name, test] of Object.entries(tests)) {
    try {
      await test();
      results.push({ name, passed: true });
      console.log(`✅ ${name}`);
    } catch (error) {
      results.push({ name, passed: false, error: String(error) });
      console.log(`❌ ${name}: ${error}`);
    }
  }

  console.log("\n📊 Test Results");
  console.log(`   Passed: ${results.filter((r) => r.passed).length}/${results.length}`);
  console.log(`   Failed: ${results.filter((r) => !r.passed).length}/${results.length}`);

  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.log("\n❌ Failed tests:");
    for (const f of failed) {
      console.log(`   - ${f.name}: ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log("\n✅ All Phase 18 tests passed!");
  }
}

async function testKPIRegistry() {
  const registry = createKPIRegistry();

  // Test registry has KPIs
  assert.ok(registry.size > 0, "Registry should have KPIs");

  // Test get KPI
  const kpi = registry.get("total_sessions");
  assert.ok(kpi, "Should find total_sessions KPI");
  assert.equal(kpi.category, "operations");
  assert.equal(kpi.unit, "count");

  // Test get by category
  const operationsKPIs = registry.getByCategory("operations");
  assert.ok(operationsKPIs.length > 0, "Should have operations KPIs");

  // Test get all
  const allKPIs = registry.getAll();
  assert.equal(allKPIs.length, registry.size);
}

async function testKPICalculation() {
  const db = createMemoryDb();
  const orgId = newId("org");

  await db.organizations.create({
    id: orgId,
    name: "Test Org",
    slug: "test-org-" + Date.now(),
    industry: "Banking",
    timezone: "UTC",
  });

  const agentId = newId("agt");
  await db.agents.create({
    id: agentId,
    organizationId: orgId,
    name: "Test Agent",
    description: "Test",
    industry: "Banking",
    language: "en",
    voice: "test",
    systemPrompt: "Test",
    status: "active",
  });

  // Create sessions
  const session1Id = newId("vs");
  await db.sessions.create({
    id: session1Id,
    organizationId: orgId,
    agentId,
    language: "en",
    mode: "simulation",
  });

  const session2Id = newId("vs");
  await db.sessions.create({
    id: session2Id,
    organizationId: orgId,
    agentId,
    language: "en",
    mode: "simulation",
  });
  await db.sessions.patch(session2Id, orgId, { status: "completed" });

  // Test KPI calculation
  const analytics = createAnalyticsService(db);
  const totalSessions = await analytics.calculateKPI(orgId, "total_sessions");
  assert.equal(totalSessions.value, 2, "Should count 2 sessions");
  assert.equal(totalSessions.hasData, true);

  const activeSessions = await analytics.calculateKPI(orgId, "active_sessions");
  assert.equal(activeSessions.value, 1, "Should count 1 active session");

  const completionRate = await analytics.calculateKPI(orgId, "session_completion_rate");
  assert.equal(completionRate.value, 50, "Should be 50% completion rate");

  // Test domain analytics
  const opsDomain = await analytics.calculateDomainAnalytics(orgId, "operations");
  assert.ok(opsDomain.kpis.length > 0, "Should have operations KPIs");
  assert.equal(opsDomain.category, "operations");
}

async function testTenantIsolation() {
  const db = createMemoryDb();
  const org1 = newId("org");
  const org2 = newId("org");

  await db.organizations.create({
    id: org1,
    name: "Org 1",
    slug: "org-1-" + Date.now(),
    industry: "Banking",
    timezone: "UTC",
  });

  await db.organizations.create({
    id: org2,
    name: "Org 2",
    slug: "org-2-" + Date.now(),
    industry: "Banking",
    timezone: "UTC",
  });

  const agent1Id = newId("agt");
  await db.agents.create({
    id: agent1Id,
    organizationId: org1,
    name: "Agent 1",
    description: "Test",
    industry: "Banking",
    language: "en",
    voice: "test",
    systemPrompt: "Test",
    status: "active",
  });

  const agent2Id = newId("agt");
  await db.agents.create({
    id: agent2Id,
    organizationId: org2,
    name: "Agent 2",
    description: "Test",
    industry: "Banking",
    language: "en",
    voice: "test",
    systemPrompt: "Test",
    status: "active",
  });

  // Create sessions in org1
  for (let i = 0; i < 3; i++) {
    const sessionId = newId("vs");
    await db.sessions.create({
      id: sessionId,
      organizationId: org1,
      agentId: agent1Id,
      language: "en",
      mode: "simulation",
    });
  }

  // Create sessions in org2
  for (let i = 0; i < 5; i++) {
    const sessionId = newId("vs");
    await db.sessions.create({
      id: sessionId,
      organizationId: org2,
      agentId: agent2Id,
      language: "en",
      mode: "simulation",
    });
  }

  const analytics = createAnalyticsService(db);

  // Test org1 sees only its data
  const org1Sessions = await analytics.calculateKPI(org1, "total_sessions");
  assert.equal(org1Sessions.value, 3, "Org1 should see 3 sessions");

  // Test org2 sees only its data
  const org2Sessions = await analytics.calculateKPI(org2, "total_sessions");
  assert.equal(org2Sessions.value, 5, "Org2 should see 5 sessions");

  // Verify isolation
  assert.notEqual(org1Sessions.value, org2Sessions.value, "Orgs should see different counts");
}

async function testTimeRangeFiltering() {
  const db = createMemoryDb();
  const orgId = newId("org");

  await db.organizations.create({
    id: orgId,
    name: "Test Org",
    slug: "test-org-" + Date.now(),
    industry: "Banking",
    timezone: "UTC",
  });

  const agentId = newId("agt");
  await db.agents.create({
    id: agentId,
    organizationId: orgId,
    name: "Test Agent",
    description: "Test",
    industry: "Banking",
    language: "en",
    voice: "test",
    systemPrompt: "Test",
    status: "active",
  });

  // Create sessions with different dates
  const now = Date.now();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const session1Id = newId("vs");
  await db.sessions.create({
    id: session1Id,
    organizationId: orgId,
    agentId,
    language: "en",
    mode: "simulation",
  });
  await db.sessions.patch(session1Id, orgId, { startedAt: oneWeekAgo });

  const session2Id = newId("vs");
  await db.sessions.create({
    id: session2Id,
    organizationId: orgId,
    agentId,
    language: "en",
    mode: "simulation",
  });
  await db.sessions.patch(session2Id, orgId, { startedAt: oneDayAgo });

  const session3Id = newId("vs");
  await db.sessions.create({
    id: session3Id,
    organizationId: orgId,
    agentId,
    language: "en",
    mode: "simulation",
  });

  const analytics = createAnalyticsService(db);

  // Test all time
  const allSessions = await analytics.calculateKPI(orgId, "total_sessions");
  assert.equal(allSessions.value, 3, "Should count all 3 sessions");

  // Test last 2 days
  const recentSessions = await analytics.calculateKPI(orgId, "total_sessions", {
    startDate: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString(),
  });
  assert.equal(recentSessions.value, 2, "Should count 2 recent sessions");

  // Test last 3 days
  const weekSessions = await analytics.calculateKPI(orgId, "total_sessions", {
    startDate: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString(),
  });
  assert.equal(weekSessions.value, 2, "Should count 2 sessions in last 3 days");
}

async function testEmptyStates() {
  const db = createMemoryDb();
  const orgId = newId("org");

  await db.organizations.create({
    id: orgId,
    name: "Empty Org",
    slug: "empty-org-" + Date.now(),
    industry: "Banking",
    timezone: "UTC",
  });

  const analytics = createAnalyticsService(db);

  // Test KPI with no data
  const totalSessions = await analytics.calculateKPI(orgId, "total_sessions");
  assert.equal(totalSessions.value, 0, "Should be 0 with no data");
  assert.equal(totalSessions.hasData, true, "Should have data (empty set)");

  // Test KPI that requires non-zero denominator
  const completionRate = await analytics.calculateKPI(orgId, "session_completion_rate");
  assert.equal(completionRate.value, null, "Should be null with no sessions");
  assert.equal(completionRate.hasData, false, "Should not have data");
  assert.ok(completionRate.emptyStateMessage, "Should have empty state message");

  // Test average call duration with no calls
  const avgDuration = await analytics.calculateKPI(orgId, "average_call_duration");
  assert.equal(avgDuration.value, null, "Should be null with no calls");
  assert.equal(avgDuration.hasData, false, "Should not have data");
}

async function testPlatformAnalytics() {
  const db = createMemoryDb();
  const org1 = newId("org");
  const org2 = newId("org");

  await db.organizations.create({
    id: org1,
    name: "Org 1",
    slug: "org-1-" + Date.now(),
    industry: "Banking",
    timezone: "UTC",
  });

  await db.organizations.create({
    id: org2,
    name: "Org 2",
    slug: "org-2-" + Date.now(),
    industry: "Banking",
    timezone: "UTC",
  });

  // Create agents and sessions for org1
  const agent1Id = newId("agt");
  await db.agents.create({
    id: agent1Id,
    organizationId: org1,
    name: "Agent 1",
    description: "Test",
    industry: "Banking",
    language: "en",
    voice: "test",
    systemPrompt: "Test",
    status: "active",
  });

  for (let i = 0; i < 2; i++) {
    await db.sessions.create({
      id: newId("vs"),
      organizationId: org1,
      agentId: agent1Id,
      language: "en",
      mode: "simulation",
    });
  }

  // Create agents and sessions for org2
  const agent2Id = newId("agt");
  await db.agents.create({
    id: agent2Id,
    organizationId: org2,
    name: "Agent 2",
    description: "Test",
    industry: "Banking",
    language: "en",
    voice: "test",
    systemPrompt: "Test",
    status: "active",
  });

  for (let i = 0; i < 3; i++) {
    await db.sessions.create({
      id: newId("vs"),
      organizationId: org2,
      agentId: agent2Id,
      language: "en",
      mode: "simulation",
    });
  }

  const analytics = createAnalyticsService(db);
  const platform = await analytics.calculatePlatformAnalytics();

  assert.ok(platform.totalOrganizations >= 2, "Should count at least 2 organizations");
  assert.ok(platform.totalSessions >= 5, "Should aggregate at least 5 sessions");
  assert.ok(platform.totalAgents >= 2, "Should aggregate at least 2 agents");
  assert.ok(platform.generatedAt, "Should have timestamp");
}

async function testCSVExport() {
  const db = createMemoryDb();
  const orgId = newId("org");

  await db.organizations.create({
    id: orgId,
    name: "Test Org",
    slug: "test-org-" + Date.now(),
    industry: "Banking",
    timezone: "UTC",
  });

  const agentId = newId("agt");
  await db.agents.create({
    id: agentId,
    organizationId: orgId,
    name: "Test Agent",
    description: "Test",
    industry: "Banking",
    language: "en",
    voice: "test",
    systemPrompt: "Test",
    status: "active",
  });

  await db.sessions.create({
    id: newId("vs"),
    organizationId: orgId,
    agentId,
    language: "en",
    mode: "simulation",
  });

  const analytics = createAnalyticsService(db);

  // Test domain export
  const opsDomain = await analytics.calculateDomainAnalytics(orgId, "operations");
  const domainCSV = analytics.exportToCSV(opsDomain);
  assert.ok(domainCSV.includes("KPI,Value,Unit,Has Data"), "Should have CSV header");
  assert.ok(domainCSV.split("\n").length > 1, "Should have data rows");

  // Test organization export
  const orgAnalytics = await analytics.calculateOrganizationAnalytics(orgId);
  const orgCSV = analytics.exportToCSV(orgAnalytics);
  assert.ok(orgCSV.includes("Category,KPI,Value,Unit,Has Data"), "Should have CSV header");
  assert.ok(orgCSV.split("\n").length > 1, "Should have data rows");
}

// Run tests
runTests().catch((error) => {
  console.error("Test runner failed:", error);
  process.exit(1);
});
