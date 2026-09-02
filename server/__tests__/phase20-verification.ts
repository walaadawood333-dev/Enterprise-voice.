/**
 * Phase 20 Verification Tests — White-Label SaaS & Tenant Provisioning
 * 
 * This is a simplified test runner that validates Phase 20 functionality.
 */

import { createMemoryDb } from "../db/store";
import { createEntitlementService } from "../services/entitlements";
import { createProvisioningService } from "../services/provisioning";
import { createBrandingSecurityService } from "../services/brandingSecurity";
import { createAuditService } from "../services/audit";
import { createLogger } from "../lib/logger";

console.log("🧪 Phase 20 — White-Label SaaS & Tenant Provisioning Verification\n");

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error: any) {
      console.log(`❌ ${name}: ${error.message}`);
      failed++;
    }
  }

  function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
  }

  // Setup
  const db = createMemoryDb();
  const logger = createLogger();
  const entitlements = createEntitlementService(db);
  const audit = createAuditService(db);
  const provisioning = createProvisioningService(db, entitlements, audit, logger);
  const brandingSecurity = createBrandingSecurityService();

  // Test 1: Organization Provisioning
  await test("Test 1: Should provision a new organization successfully", async () => {
    const request = {
      name: "Acme Corporation",
      slug: "acme-corp",
      industry: "TECHNOLOGY",
      adminEmail: "admin@acme.com",
      adminName: "John Doe",
      adminPassword: "SecurePass123!",
    };

    const result = await provisioning.provisionOrganization(
      request,
      "platform-admin-1",
      "platform@centerai.com"
    );

    assert(result.success === true, "Provisioning should succeed");
    assert(result.organization !== undefined, "Organization should be created");
    assert(result.organization?.name === "Acme Corporation", "Organization name should match");
    assert(result.organization?.slug === "acme-corp", "Organization slug should match");
    assert(result.admin !== undefined, "Admin user should be created");
    assert(result.admin?.email === "admin@acme.com", "Admin email should match");
    assert(result.admin?.role === "owner", "Admin role should be owner");
  });

  // Test 2: Idempotent Provisioning
  await test("Test 2: Should not create duplicate organization with same slug", async () => {
    const request = {
      name: "Test Org",
      slug: "test-org-dup",
      adminEmail: "test@example.com",
      adminName: "Test User",
      adminPassword: "Password123!",
    };

    const result1 = await provisioning.provisionOrganization(
      request,
      "platform-admin-1",
      "platform@centerai.com"
    );

    const result2 = await provisioning.provisionOrganization(
      request,
      "platform-admin-1",
      "platform@centerai.com"
    );

    assert(result1.success === true, "First provisioning should succeed");
    assert(result2.success === true, "Second provisioning should succeed");
    assert(result1.organization?.id === result2.organization?.id, "Should return same organization");
  });

  // Test 3: Default Configuration
  await test("Test 3: Should apply default timezone and status", async () => {
    const request = {
      name: "Default Org",
      slug: "default-org",
      adminEmail: "default@example.com",
      adminName: "Default User",
      adminPassword: "Password123!",
    };

    const result = await provisioning.provisionOrganization(
      request,
      "platform-admin-1",
      "platform@centerai.com"
    );

    assert(result.organization?.timezone === "UTC", "Default timezone should be UTC");
    assert(result.organization?.status === "TRIAL", "Default status should be TRIAL");
  });

  // Test 4: Subscription Integration
  await test("Test 4: Should create subscription with specified plan", async () => {
    const plan = await db.plans.create({
      id: "plan-test-1",
      name: "Professional",
      planType: "PROFESSIONAL",
      features: ["ai_agents", "voice_calls", "analytics"],
      limits: {
        maxUsers: 10,
        maxAgents: 5,
        maxMonthlyMinutes: 5000,
        maxCampaigns: 3,
        maxConnectors: 2,
      },
      priceMonthly: 9900,
      priceYearly: 99000,
      currency: "USD",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const request = {
      name: "Sub Org",
      slug: "sub-org",
      planId: plan.id,
      adminEmail: "sub@example.com",
      adminName: "Sub User",
      adminPassword: "Password123!",
    };

    const result = await provisioning.provisionOrganization(
      request,
      "platform-admin-1",
      "platform@centerai.com"
    );

    assert(result.subscription !== undefined, "Subscription should be created");
    assert(result.subscription?.planId === plan.id, "Subscription should reference plan");
  });

  // Test 5: Tenant Isolation
  await test("Test 5: Should isolate data between organizations", async () => {
    const org1Result = await provisioning.provisionOrganization(
      {
        name: "Org 1",
        slug: "org-1-iso",
        adminEmail: "admin@org1.com",
        adminName: "User 1",
        adminPassword: "Password123!",
      },
      "platform-admin-1",
      "platform@centerai.com"
    );

    const org2Result = await provisioning.provisionOrganization(
      {
        name: "Org 2",
        slug: "org-2-iso",
        adminEmail: "admin@org2.com",
        adminName: "User 2",
        adminPassword: "Password123!",
      },
      "platform-admin-1",
      "platform@centerai.com"
    );

    const org1Id = org1Result.organization!.id;
    const org2Id = org2Result.organization!.id;

    const org1Users = await db.users.listByOrg(org1Id);
    const org2Users = await db.users.listByOrg(org2Id);

    assert(org1Users.length === 1, "Org 1 should have 1 user");
    assert(org2Users.length === 1, "Org 2 should have 1 user");
    assert(org1Users[0].email === "admin@org1.com", "Org 1 user should be admin@org1.com");
    assert(org2Users[0].email === "admin@org2.com", "Org 2 user should be admin@org2.com");
  });

  // Test 6: Organization Lifecycle
  await test("Test 6: Should transition organization status", async () => {
    const orgResult = await provisioning.provisionOrganization(
      {
        name: "Lifecycle Org",
        slug: "lifecycle-org",
        adminEmail: "lifecycle@example.com",
        adminName: "Lifecycle User",
        adminPassword: "Password123!",
      },
      "platform-admin-1",
      "platform@centerai.com"
    );

    const orgId = orgResult.organization!.id;
    assert(orgResult.organization?.status === "TRIAL", "Initial status should be TRIAL");

    const activated = await provisioning.activateOrganization(orgId, "admin-1", "admin@test.com");
    assert(activated.status === "ACTIVE", "Status should be ACTIVE");

    const suspended = await provisioning.suspendOrganization(orgId, "Test", "admin-1", "admin@test.com");
    assert(suspended.status === "SUSPENDED", "Status should be SUSPENDED");
  });

  // Test 7: Branding Security - XSS Prevention
  await test("Test 7: Should sanitize XSS in display name", () => {
    const branding = {
      displayName: "<script>alert('xss')</script>Test Org",
    };

    const sanitized = brandingSecurity.sanitizeBranding(branding);

    assert(sanitized.sanitized === true, "Should be marked as sanitized");
    assert(!sanitized.displayName?.includes("<script>"), "Should not contain script tags");
    assert(!sanitized.displayName?.includes("alert"), "Should not contain alert");
  });

  // Test 8: Branding Security - URL Validation
  await test("Test 8: Should reject javascript: URLs", () => {
    const branding = {
      logoUrl: "javascript:alert('xss')",
    };

    const sanitized = brandingSecurity.sanitizeBranding(branding);

    assert(sanitized.warnings.length > 0, "Should have warnings");
    assert(sanitized.logoUrl === undefined, "Logo URL should be rejected");
  });

  // Test 9: Branding Security - Color Validation
  await test("Test 9: Should validate color formats", () => {
    const validBranding = {
      primaryColor: "#ff0000",
      accentColor: "rgb(0, 255, 0)",
    };

    const sanitized = brandingSecurity.sanitizeBranding(validBranding);

    assert(sanitized.warnings.length === 0, "Should have no warnings");
    assert(sanitized.primaryColor === "#ff0000", "Primary color should be accepted");
  });

  // Test 10: Audit Trail
  await test("Test 10: Should create audit log for organization creation", async () => {
    const orgResult = await provisioning.provisionOrganization(
      {
        name: "Audit Org",
        slug: "audit-org",
        adminEmail: "audit@example.com",
        adminName: "Audit User",
        adminPassword: "Password123!",
      },
      "platform-admin-1",
      "platform@centerai.com"
    );

    const auditLogs = await db.audit.listAll();
    const orgCreatedLog = auditLogs.find((l) => l.action === "organization.created");

    assert(orgCreatedLog !== undefined, "Audit log should exist");
    assert(orgCreatedLog?.organizationId === orgResult.organization?.id, "Audit log should reference org");
    assert(orgCreatedLog?.actorId === "platform-admin-1", "Audit log should have actor");
  });

  // Test 11: Secret Redaction
  await test("Test 11: Should not expose password hashes in audit logs", async () => {
    const orgResult = await provisioning.provisionOrganization(
      {
        name: "Secret Org",
        slug: "secret-org",
        adminEmail: "secret@example.com",
        adminName: "Secret User",
        adminPassword: "Password123!",
      },
      "platform-admin-1",
      "platform@centerai.com"
    );

    const auditLogs = await db.audit.listAll();
    const userCreatedLog = auditLogs.find((l) => l.action === "user.created");

    if (userCreatedLog) {
      const metadata = userCreatedLog.metadata as any;
      assert(metadata.passwordHash === undefined, "Password hash should not be in metadata");
      assert(metadata.password === undefined, "Password should not be in metadata");
    }
  });

  // Test 12: Entitlement Enforcement
  await test("Test 12: Should enforce feature entitlements", async () => {
    const plan = await db.plans.create({
      id: "plan-entitlement-test",
      name: "Basic",
      planType: "BASIC",
      features: ["ai_agents"],
      limits: {
        maxUsers: 5,
        maxAgents: 2,
        maxMonthlyMinutes: 1000,
        maxCampaigns: 0,
        maxConnectors: 0,
      },
      priceMonthly: 2900,
      priceYearly: 29000,
      currency: "USD",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const orgResult = await provisioning.provisionOrganization(
      {
        name: "Entitlement Org",
        slug: "entitlement-org",
        planId: plan.id,
        adminEmail: "entitlement@example.com",
        adminName: "Entitlement User",
        adminPassword: "Password123!",
      },
      "platform-admin-1",
      "platform@centerai.com"
    );

    const orgId = orgResult.organization!.id;

    const hasAiAgents = await entitlements.hasFeature(orgId, "ai_agents");
    assert(hasAiAgents === true, "Should have ai_agents feature");

    const hasCampaigns = await entitlements.hasFeature(orgId, "campaigns");
    assert(hasCampaigns === false, "Should not have campaigns feature");
  });

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log(`Phase 20 Tests: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("\n✅ All Phase 20 tests passed!\n");
  }
}

runTests().catch((error) => {
  console.error("Test runner failed:", error);
  process.exit(1);
});
