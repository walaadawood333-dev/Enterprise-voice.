/**
 * Phase 16 — Security Hardening Verification Tests
 *
 * Comprehensive testing of:
 * - Tenant isolation (cross-tenant access prevention)
 * - Role-based authorization (cross-role access control)
 * - Resource-level authorization
 * - Permission matrix enforcement
 * - Authentication bypass prevention
 * - IDOR vulnerability testing
 */

import { createMemoryDb, type Db } from "../db/store";
import { createAuthorizationService, type AuthorizationService } from "../services/authorization";
import { createLogger, ApiError } from "../lib/observability";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passCount++;
    console.log(`  ✓ ${message}`);
  } else {
    failCount++;
    console.error(`  ✗ ${message}`);
  }
}

function assertThrows(fn: () => void, expectedCode: string, message: string) {
  try {
    fn();
    failCount++;
    console.error(`  ✗ ${message} (no error thrown)`);
  } catch (error) {
    if (error instanceof ApiError && error.code === expectedCode) {
      passCount++;
      console.log(`  ✓ ${message}`);
    } else {
      failCount++;
      console.error(`  ✗ ${message} (wrong error: ${error})`);
    }
  }
}

async function setup() {
  const db = createMemoryDb();
  const logger = createLogger("error");
  const authz = createAuthorizationService({ db, logger });
  return { db, authz, logger };
}

async function testTenantIsolation() {
  console.log("\n━━━ 1. Tenant Isolation Tests ━━━");

  const { db, authz } = await setup();

  // Setup two organizations
  const org1 = await db.organizations.create({
    name: "Test Org 1",
    slug: "test-org-1",
  });
  const org2 = await db.organizations.create({
    name: "Test Org 2",
    slug: "test-org-2",
  });

  // Create users in each org
  const user1 = await db.users.create({
    organizationId: org1.id,
    email: "user1@org1.com",
    name: "User 1",
    role: "admin",
    passwordHash: "hashed",
  });
  const user2 = await db.users.create({
    organizationId: org2.id,
    email: "user2@org2.com",
    name: "User 2",
    role: "admin",
    passwordHash: "hashed",
  });

  // Create agent in org1
  const agent1 = await db.agents.create({
    organizationId: org1.id,
    name: "Agent 1",
    description: "Test agent",
    voice: "en-US-1",
    industry: "test",
    systemPrompt: "You are a test agent",
    welcomeMessage: "Hello",
    status: "active",
  });

  // Test: Cross-tenant access prevention
  assertThrows(
    () => authz.verifyTenantIsolation(user2.id, org2.id, org1.id),
    "FORBIDDEN",
    "Prevents cross-tenant access to resources"
  );

  // Test: Own tenant access allowed
  try {
    authz.verifyTenantIsolation(user1.id, org1.id, org1.id);
    passCount++;
    console.log("  ✓ Own tenant access allowed");
  } catch (error) {
    failCount++;
    console.error("  ✗ Own tenant access allowed (should not throw)");
  }

  // Test: Campaign isolation
  const agent = await db.agents.create({
    organizationId: org1.id,
    name: "Agent",
    description: "Test",
    voice: "en-US-1",
    industry: "test",
    systemPrompt: "Test",
    welcomeMessage: "Hello",
    status: "active",
  });

  const campaign1 = await db.campaigns.create({
    organizationId: org1.id,
    name: "Campaign 1",
    description: "Test campaign",
    agentId: agent.id,
    status: "draft",
    direction: "outbound",
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    totalContacts: 0,
    processedContacts: 0,
    completedCalls: 0,
    failedCalls: 0,
  });

  const campaignFromOrg2 = await db.campaigns.get(campaign1.id, org2.id);
  assert(campaignFromOrg2 === undefined, "Prevents cross-tenant access to campaigns");

  const campaignFromOrg1 = await db.campaigns.get(campaign1.id, org1.id);
  assert(campaignFromOrg1 !== undefined && campaignFromOrg1.id === campaign1.id, "Own tenant can access campaigns");

  // Test: Voice session isolation
  const session1 = await db.sessions.create({
    organizationId: org1.id,
    userId: null,
    agentId: agent.id,
    status: "completed",
    mode: "test",
    language: "en",
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationSeconds: 60,
  });

  const sessionFromOrg2 = await db.sessions.get(session1.id, org2.id);
  assert(sessionFromOrg2 === undefined, "Prevents cross-tenant access to voice sessions");

  const sessionFromOrg1 = await db.sessions.get(session1.id, org1.id);
  assert(sessionFromOrg1 !== undefined, "Own tenant can access voice sessions");

  // Test: Call isolation
  const call1 = await db.calls.create({
    organizationId: org1.id,
    direction: "outbound",
    status: "completed",
    provider: "demo",
    fromNumber: "+1234567890",
    toNumber: "+0987654321",
    agentId: null,
    voiceSessionId: null,
    startedAt: new Date().toISOString(),
    answeredAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationSeconds: 30,
  });

  const callFromOrg2 = await db.calls.get(call1.id, org2.id);
  assert(callFromOrg2 === undefined, "Prevents cross-tenant access to calls");

  const callFromOrg1 = await db.calls.get(call1.id, org1.id);
  assert(callFromOrg1 !== undefined, "Own tenant can access calls");
}

async function testRoleBasedAuthorization() {
  console.log("\n━━━ 2. Role-Based Authorization Tests ━━━");

  const { authz } = await setup();

  // Test: Owner permissions
  const ownerRole = "owner";
  const authMode = "bearer";
  assert(authz.hasPermission(ownerRole, authMode, "organization.update"), "Owner has organization.update permission");
  assert(authz.hasPermission(ownerRole, authMode, "user.create"), "Owner has user.create permission");
  assert(authz.hasPermission(ownerRole, authMode, "agent.create"), "Owner has agent.create permission");
  assert(authz.hasPermission(ownerRole, authMode, "campaign.create"), "Owner has campaign.create permission");
  assert(authz.hasPermission(ownerRole, authMode, "compliance.policy.create"), "Owner has compliance.policy.create permission");
  assert(authz.hasPermission(ownerRole, authMode, "dnc.record.create"), "Owner has dnc.record.create permission");
  assert(authz.hasPermission(ownerRole, authMode, "billing.subscription.manage"), "Owner has billing.subscription.manage permission");

  // Test: Admin permissions
  const adminRole = "admin";
  assert(authz.hasPermission(adminRole, authMode, "user.create"), "Admin has user.create permission");
  assert(authz.hasPermission(adminRole, authMode, "agent.create"), "Admin has agent.create permission");
  assert(authz.hasPermission(adminRole, authMode, "campaign.create"), "Admin has campaign.create permission");
  assert(authz.hasPermission(adminRole, authMode, "compliance.policy.create"), "Admin has compliance.policy.create permission");
  assert(authz.hasPermission(adminRole, authMode, "dnc.record.create"), "Admin has dnc.record.create permission");
  assert(!authz.hasPermission(adminRole, authMode, "organization.update"), "Admin does not have organization.update permission");
  assert(!authz.hasPermission(adminRole, authMode, "billing.subscription.manage"), "Admin does not have billing.subscription.manage permission");

  // Test: Manager permissions
  const managerRole = "manager";
  assert(authz.hasPermission(managerRole, authMode, "voice.session.create"), "Manager has voice.session.create permission");
  assert(authz.hasPermission(managerRole, authMode, "campaign.create"), "Manager has campaign.create permission");
  assert(authz.hasPermission(managerRole, authMode, "campaign.start"), "Manager has campaign.start permission");
  assert(authz.hasPermission(managerRole, authMode, "agent.read"), "Manager has agent.read permission");
  assert(authz.hasPermission(managerRole, authMode, "analytics.read"), "Manager has analytics.read permission");
  assert(authz.hasPermission(managerRole, authMode, "report.generate"), "Manager has report.generate permission");
  assert(!authz.hasPermission(managerRole, authMode, "user.create"), "Manager does not have user.create permission");
  assert(!authz.hasPermission(managerRole, authMode, "agent.create"), "Manager does not have agent.create permission");
  assert(!authz.hasPermission(managerRole, authMode, "compliance.policy.create"), "Manager does not have compliance.policy.create permission");

  // Test: Operator permissions
  const operatorRole = "operator";
  assert(authz.hasPermission(operatorRole, authMode, "voice.session.create"), "Operator has voice.session.create permission");
  assert(authz.hasPermission(operatorRole, authMode, "voice.session.read"), "Operator has voice.session.read permission");
  assert(authz.hasPermission(operatorRole, authMode, "telephony.call.initiate"), "Operator has telephony.call.initiate permission");
  assert(authz.hasPermission(operatorRole, authMode, "campaign.read"), "Operator has campaign.read permission");
  assert(authz.hasPermission(operatorRole, authMode, "agent.read"), "Operator has agent.read permission");
  assert(authz.hasPermission(operatorRole, authMode, "analytics.read"), "Operator has analytics.read permission");
  assert(!authz.hasPermission(operatorRole, authMode, "user.create"), "Operator does not have user.create permission");
  assert(!authz.hasPermission(operatorRole, authMode, "agent.create"), "Operator does not have agent.create permission");
  assert(!authz.hasPermission(operatorRole, authMode, "campaign.create"), "Operator does not have campaign.create permission");
  assert(!authz.hasPermission(operatorRole, authMode, "report.generate"), "Operator does not have report.generate permission");

  // Test: Viewer permissions
  const viewerRole = "viewer";
  assert(authz.hasPermission(viewerRole, authMode, "voice.session.read"), "Viewer has voice.session.read permission");
  assert(authz.hasPermission(viewerRole, authMode, "campaign.read"), "Viewer has campaign.read permission");
  assert(authz.hasPermission(viewerRole, authMode, "agent.read"), "Viewer has agent.read permission");
  assert(authz.hasPermission(viewerRole, authMode, "analytics.read"), "Viewer has analytics.read permission");
  assert(!authz.hasPermission(viewerRole, authMode, "voice.session.create"), "Viewer does not have voice.session.create permission");
  assert(!authz.hasPermission(viewerRole, authMode, "campaign.create"), "Viewer does not have campaign.create permission");
  assert(!authz.hasPermission(viewerRole, authMode, "agent.create"), "Viewer does not have agent.create permission");
  assert(!authz.hasPermission(viewerRole, authMode, "report.generate"), "Viewer does not have report.generate permission");

  // Test: Demo mode bypass
  const demoMode = "demo";
  assert(authz.hasPermission(viewerRole, demoMode, "organization.update"), "Demo mode bypasses organization.update");
  assert(authz.hasPermission(viewerRole, demoMode, "user.create"), "Demo mode bypasses user.create");
  assert(authz.hasPermission(viewerRole, demoMode, "agent.create"), "Demo mode bypasses agent.create");
}

async function testPlatformAuthorization() {
  console.log("\n━━━ 3. Platform Authorization Tests ━━━");

  const { authz } = await setup();

  // Test: Super admin permissions
  const superAdminRole = "super_admin";
  assert(authz.hasPlatformPermission(superAdminRole, "platform.orgs.manage"), "Super admin has platform.orgs.manage");
  assert(authz.hasPlatformPermission(superAdminRole, "platform.users.manage"), "Super admin has platform.users.manage");
  assert(authz.hasPlatformPermission(superAdminRole, "platform.billing.manage"), "Super admin has platform.billing.manage");
  assert(authz.hasPlatformPermission(superAdminRole, "platform.audit.read"), "Super admin has platform.audit.read");

  // Test: Platform admin permissions
  const platformAdminRole = "platform_admin";
  assert(authz.hasPlatformPermission(platformAdminRole, "platform.orgs.manage"), "Platform admin has platform.orgs.manage");
  assert(authz.hasPlatformPermission(platformAdminRole, "platform.users.manage"), "Platform admin has platform.users.manage");
  assert(authz.hasPlatformPermission(platformAdminRole, "platform.billing.manage"), "Platform admin has platform.billing.manage");

  // Test: Platform operator permissions
  const platformOperatorRole = "platform_operator";
  assert(authz.hasPlatformPermission(platformOperatorRole, "platform.orgs.read"), "Platform operator has platform.orgs.read");
  assert(authz.hasPlatformPermission(platformOperatorRole, "platform.users.read"), "Platform operator has platform.users.read");
  assert(authz.hasPlatformPermission(platformOperatorRole, "platform.audit.read"), "Platform operator has platform.audit.read");
  assert(!authz.hasPlatformPermission(platformOperatorRole, "platform.orgs.manage"), "Platform operator does not have platform.orgs.manage");
  assert(!authz.hasPlatformPermission(platformOperatorRole, "platform.users.manage"), "Platform operator does not have platform.users.manage");

  // Test: Undefined platform role
  assert(!authz.hasPlatformPermission(undefined, "platform.orgs.read"), "Undefined platform role has no permissions");
}

async function testRoleHierarchy() {
  console.log("\n━━━ 4. Role Hierarchy Tests ━━━");

  const { authz } = await setup();

  // Test: Role ranking
  assert(authz.hasMinimumRole("owner", "owner"), "Owner has minimum owner role");
  assert(authz.hasMinimumRole("owner", "admin"), "Owner has minimum admin role");
  assert(authz.hasMinimumRole("owner", "manager"), "Owner has minimum manager role");
  assert(authz.hasMinimumRole("owner", "operator"), "Owner has minimum operator role");
  assert(authz.hasMinimumRole("owner", "viewer"), "Owner has minimum viewer role");

  assert(!authz.hasMinimumRole("admin", "owner"), "Admin does not have minimum owner role");
  assert(authz.hasMinimumRole("admin", "admin"), "Admin has minimum admin role");
  assert(authz.hasMinimumRole("admin", "manager"), "Admin has minimum manager role");

  assert(!authz.hasMinimumRole("viewer", "owner"), "Viewer does not have minimum owner role");
  assert(!authz.hasMinimumRole("viewer", "admin"), "Viewer does not have minimum admin role");
  assert(authz.hasMinimumRole("viewer", "viewer"), "Viewer has minimum viewer role");
}

async function testResourceLevelAuthorization() {
  console.log("\n━━━ 5. Resource-Level Authorization Tests ━━━");

  const { authz } = await setup();

  // Test: FORBIDDEN for insufficient permissions
  const viewerRole = "viewer";
  const authMode = "bearer";

  assertThrows(
    () => authz.requirePermission(viewerRole, authMode, "agent.create"),
    "FORBIDDEN",
    "Throws FORBIDDEN for insufficient permissions"
  );

  // Test: Platform permission denial
  const platformOperatorRole = "platform_operator";
  assertThrows(
    () => authz.requirePlatformPermission(platformOperatorRole, "platform.orgs.manage"),
    "FORBIDDEN",
    "Throws FORBIDDEN for platform permission denial"
  );
}

async function testPermissionMatrixCompleteness() {
  console.log("\n━━━ 6. Permission Matrix Completeness Tests ━━━");

  const { authz } = await setup();

  // Test: All roles have permissions
  const roles = ["owner", "admin", "manager", "operator", "viewer"];
  let allRolesHavePermissions = true;

  for (const role of roles) {
    const permissions = authz.getRolePermissions(role);
    if (permissions.length === 0) {
      allRolesHavePermissions = false;
      break;
    }
  }
  assert(allRolesHavePermissions, "All roles have at least some permissions");

  // Test: Higher roles have more permissions
  const ownerPerms = authz.getRolePermissions("owner");
  const adminPerms = authz.getRolePermissions("admin");
  const managerPerms = authz.getRolePermissions("manager");
  const operatorPerms = authz.getRolePermissions("operator");
  const viewerPerms = authz.getRolePermissions("viewer");

  assert(ownerPerms.length > adminPerms.length, "Owner has more permissions than admin");
  assert(adminPerms.length > managerPerms.length, "Admin has more permissions than manager");
  assert(managerPerms.length > operatorPerms.length, "Manager has more permissions than operator");
  assert(operatorPerms.length > viewerPerms.length, "Operator has more permissions than viewer");

  // Test: All permission actions defined
  const allPermissions = new Set();
  for (const role of roles) {
    const perms = authz.getRolePermissions(role);
    perms.forEach(p => allPermissions.add(p));
  }
  assert(allPermissions.size > 50, `All permission actions are defined (${allPermissions.size} permissions)`);
}

async function testAuthenticationSecurity() {
  console.log("\n━━━ 7. Authentication Security Tests ━━━");

  const { db, authz } = await setup();

  // Test: Viewer can read but not create
  const org = await db.organizations.create({
    name: "Test Org",
    slug: "test-org",
  });

  const ctx = {
    organizationId: org.id,
    userId: null,
    role: "viewer",
    authMode: "bearer",
  };

  try {
    authz.requirePermission(ctx.role, ctx.authMode, "voice.session.create");
    failCount++;
    console.error("  ✗ Viewer cannot create voice sessions (should throw)");
  } catch (error) {
    if (error instanceof ApiError && error.code === "FORBIDDEN") {
      passCount++;
      console.log("  ✓ Viewer cannot create voice sessions");
    } else {
      failCount++;
      console.error("  ✗ Viewer cannot create voice sessions (wrong error)");
    }
  }
}

async function testIDORPrevention() {
  console.log("\n━━━ 8. IDOR Prevention Tests ━━━");

  const { db } = await setup();

  // Setup two organizations
  const org1 = await db.organizations.create({
    name: "Org 1",
    slug: "org-1",
  });
  const org2 = await db.organizations.create({
    name: "Org 2",
    slug: "org-2",
  });

  // Test: Agent IDOR
  const agent1 = await db.agents.create({
    organizationId: org1.id,
    name: "Agent 1",
    description: "Test",
    voice: "en-US-1",
    industry: "test",
    systemPrompt: "Test",
    welcomeMessage: "Hello",
    status: "active",
  });

  const agentFromWrongOrg = await db.agents.get(agent1.id, org2.id);
  assert(agentFromWrongOrg === undefined, "Prevents IDOR on agents");

  // Test: User IDOR
  const user1 = await db.users.create({
    organizationId: org1.id,
    email: "user1@org1.com",
    name: "User 1",
    role: "admin",
    passwordHash: "hashed",
  });

  const usersFromWrongOrg = await db.users.listByOrg(org2.id);
  assert(usersFromWrongOrg.find(u => u.id === user1.id) === undefined, "Prevents IDOR on users (listByOrg)");

  const usersFromOwnOrg = await db.users.listByOrg(org1.id);
  assert(usersFromOwnOrg.find(u => u.id === user1.id) !== undefined, "Own org can list users");

  // Test: Connector IDOR
  const connector1 = await db.connectors.create({
    organizationId: org1.id,
    name: "Connector 1",
    provider: "test",
    type: "CRM",
    status: "draft",
    healthStatus: "unknown",
    syncMode: "manual",
    scheduleCron: null,
    credentialReference: null,
    configuration: {},
    lastSyncAt: null,
    lastTestedAt: null,
    lastHealthCheckAt: null,
    enabled: false,
  });

  const connectorFromWrongOrg = await db.connectors.get(connector1.id, org2.id);
  assert(connectorFromWrongOrg === undefined, "Prevents IDOR on connectors");

  const connectorFromOwnOrg = await db.connectors.get(connector1.id, org1.id);
  assert(connectorFromOwnOrg !== undefined, "Own org can access connectors");
}

async function runAllTests() {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("Phase 16 Verification Tests - Security Hardening");
  console.log("════════════════════════════════════════════════════════════");

  await testTenantIsolation();
  await testRoleBasedAuthorization();
  await testPlatformAuthorization();
  await testRoleHierarchy();
  await testResourceLevelAuthorization();
  await testPermissionMatrixCompleteness();
  await testAuthenticationSecurity();
  await testIDORPrevention();

  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`Phase 16 Tests: ${passCount} passed, ${failCount} failed`);
  console.log("════════════════════════════════════════════════════════════");

  if (failCount > 0) {
    console.log("❌ Some tests failed!");
    process.exit(1);
  } else {
    console.log("✅ All Phase 16 verification tests passed!");
    process.exit(0);
  }
}

runAllTests().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});
