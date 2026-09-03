import { createMemoryDb } from "../db/store";
import { createApp } from "../http/router";
import { ApiError, createLogger } from "../lib/observability";
import { createAuditService } from "../services/audit";
import { createBrandingSecurityService } from "../services/brandingSecurity";
import { createEntitlementEngine, seedDefaultPlans } from "../services/entitlements";
import {
  createExternalUrlBrandingAssetStore,
  createTenantBrandingService,
} from "../services/tenantBranding";
import type { RequestContext } from "../../shared/contracts";

let passed = 0;
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`  ✓ ${message}`);
};

const rejectsCode = async (run: () => Promise<unknown>, code: string, message: string) => {
  try {
    await run();
  } catch (error) {
    check(error instanceof ApiError && error.code === code, message);
    return;
  }
  throw new Error(`FAIL: ${message} (did not reject)`);
};

async function main() {
  const db = createMemoryDb();
  const logger = createLogger("error", () => undefined);
  await seedDefaultPlans(db);
  const entitlements = createEntitlementEngine(db);
  const audit = createAuditService(db);
  const branding = createTenantBrandingService({ db, entitlements, audit });
  const security = createBrandingSecurityService();

  console.log("\nWhite-label tenant experience");

  const orgA = await db.organizations.create({
    id: "org_brand_alpha",
    name: "Alpha Finance",
    slug: "brand-alpha",
    status: "active",
  });
  const orgB = await db.organizations.create({
    id: "org_brand_bravo",
    name: "Bravo Support",
    slug: "brand-bravo",
    status: "active",
  });
  const orgStarter = await db.organizations.create({
    id: "org_brand_starter",
    name: "Starter Tenant",
    slug: "brand-starter",
    status: "active",
  });
  const userA = await db.users.create({
    organizationId: orgA.id,
    email: "owner@alpha.test",
    name: "Alpha Owner",
    role: "owner",
  });
  const userB = await db.users.create({
    organizationId: orgB.id,
    email: "owner@bravo.test",
    name: "Bravo Owner",
    role: "owner",
  });
  const starterUser = await db.users.create({
    organizationId: orgStarter.id,
    email: "owner@starter.test",
    name: "Starter Owner",
    role: "owner",
  });
  const plans = await db.plans.list();
  const enterprise = plans.find((plan) => plan.planType === "enterprise")!;
  const starter = plans.find((plan) => plan.planType === "starter")!;
  await db.subscriptions.create({
    organizationId: orgA.id,
    planId: enterprise.id,
    status: "active",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelledAt: null,
  });
  await db.subscriptions.create({
    organizationId: orgB.id,
    planId: enterprise.id,
    status: "active",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelledAt: null,
  });
  await db.subscriptions.create({
    organizationId: orgStarter.id,
    planId: starter.id,
    status: "active",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelledAt: null,
  });

  const fallback = await branding.getForOrganization(orgB.id);
  check(fallback.source === "fallback", "tenant without a branding row receives fallback branding");
  check(fallback.displayName === orgB.name, "fallback display name comes from the authenticated organization");
  check(fallback.logoUrl === null && fallback.faviconUrl === null, "fallback does not invent logo or favicon assets");

  const updated = await branding.updateForOrganization(
    orgA.id,
    {
      displayName: "<script>alert('xss')</script> Alpha <b>Voice</b>",
      logoUrl: "https://assets.alpha.test/voice-logo.svg",
      faviconUrl: "https://assets.alpha.test/favicon.png",
      primaryColor: "#123abc",
      accentColor: "#F59E0B",
      theme: "dark",
    },
    { id: userA.id, email: userA.email }
  );
  check(updated.displayName === "Alpha Voice", "script blocks and HTML are removed from display names");
  check(!updated.displayName.toLowerCase().includes("alert"), "script contents are not retained as branding text");
  check(updated.logoUrl === "https://assets.alpha.test/voice-logo.svg", "valid HTTPS logo reference is preserved");
  check(updated.faviconUrl === "https://assets.alpha.test/favicon.png", "valid HTTPS favicon reference is preserved");
  check(updated.primaryColor === "#123abc", "brand colors are normalized to a safe token");
  check(updated.source === "tenant", "persisted branding is marked as tenant branding");

  const isolated = await branding.getForOrganization(orgB.id);
  check(isolated.displayName === "Bravo Support" && isolated.logoUrl === null, "branding rows remain isolated between tenants");

  // Simulate a row written before the secured service existed; read-time resolution must remain safe.
  await db.branding.upsert({
    id: "brand_legacy_unsafe",
    organizationId: orgB.id,
    displayName: "<script>alert(1)</script>Bravo Legacy",
    logoUrl: "javascript:alert(1)",
    faviconUrl: "data:text/html,unsafe",
    primaryColor: "red; background:url(javascript:1)",
    accentColor: "expression(alert(1))",
    theme: "dark",
  });
  const legacySafe = await branding.getForOrganization(orgB.id);
  check(legacySafe.displayName === "Bravo Legacy", "legacy branding text is sanitized again when read");
  check(legacySafe.logoUrl === null && legacySafe.faviconUrl === null, "unsafe legacy asset references never reach the shell");
  check(legacySafe.primaryColor === "#000000" && legacySafe.accentColor === "#3b82f6", "unsafe legacy CSS tokens fall back safely");
  await branding.updateForOrganization(orgB.id, {
    displayName: null,
    logoUrl: null,
    faviconUrl: null,
    primaryColor: "#000000",
    accentColor: "#3b82f6",
    theme: "light",
  }, { id: userB.id, email: userB.email });

  await rejectsCode(
    () => branding.updateForOrganization(orgA.id, { logoUrl: "javascript:alert(1)" }, { id: userA.id, email: userA.email }),
    "VALIDATION_ERROR",
    "javascript logo URLs are rejected"
  );
  await rejectsCode(
    () => branding.updateForOrganization(orgA.id, { faviconUrl: "data:image/svg+xml,<svg/>" }, { id: userA.id, email: userA.email }),
    "VALIDATION_ERROR",
    "data favicon URLs are rejected"
  );
  await rejectsCode(
    () => branding.updateForOrganization(orgA.id, { primaryColor: "red; background:url(javascript:1)" }, { id: userA.id, email: userA.email }),
    "VALIDATION_ERROR",
    "CSS injection is rejected by strict color validation"
  );
  await rejectsCode(
    () => branding.updateForOrganization(orgA.id, { customCss: "body{display:none}" }, { id: userA.id, email: userA.email }),
    "VALIDATION_ERROR",
    "arbitrary CSS fields are not accepted"
  );
  check(!security.validateUrl("http://assets.alpha.test/logo.png"), "insecure HTTP asset URLs are rejected");
  check(security.sanitizeText("<img src=x onerror=alert(1)>Safe") === "Safe", "event-handler HTML is removed as a whole tag");

  const assetStore = createExternalUrlBrandingAssetStore(security);
  check(assetStore.mode === "external_url" && assetStore.uploads === "not_configured", "asset abstraction reports uploads as not configured");
  check(!("upload" in assetStore), "asset abstraction does not expose a fake upload operation");

  await rejectsCode(
    () => branding.updateForOrganization(orgStarter.id, { displayName: "Blocked" }, { id: starterUser.id, email: starterUser.email }),
    "FORBIDDEN",
    "custom branding writes honor backend entitlements"
  );
  await db.branding.upsert({
    id: "brand_stale_starter",
    organizationId: orgStarter.id,
    displayName: "Stale paid branding",
    logoUrl: "https://assets.starter.test/stale.svg",
    faviconUrl: null,
    primaryColor: "#112233",
    accentColor: "#445566",
    theme: "light",
  });
  check(
    (await branding.getForOrganization(orgStarter.id)).source === "fallback",
    "revoked custom-branding entitlement disables previously stored branding"
  );

  const app = createApp({ db, logger, envSource: {} });
  const contextA: RequestContext = {
    organizationId: orgA.id,
    userId: userA.id,
    role: "owner",
    authMode: "bearer",
    tokenPresented: true,
    requestId: "req_brand_a",
    at: new Date().toISOString(),
  };
  const contextB: RequestContext = {
    ...contextA,
    organizationId: orgB.id,
    userId: userB.id,
    requestId: "req_brand_b",
  };
  const anonymous: RequestContext = {
    organizationId: orgA.id,
    userId: null,
    role: "viewer",
    authMode: "disabled",
    tokenPresented: false,
    requestId: "req_brand_public",
    at: new Date().toISOString(),
  };

  const bootstrapA = await app.handle(
    { method: "GET", path: "/api/workspace/bootstrap", query: { organizationId: orgB.id }, headers: {} },
    contextA
  );
  const bootstrapABody = bootstrapA.body as { organization: { id: string; branding: { displayName: string } } };
  check(bootstrapABody.organization.id === orgA.id, "bootstrap resolves organization from authenticated context only");
  check(bootstrapABody.organization.branding.displayName === "Alpha Voice", "authenticated bootstrap resolves tenant branding before the shell");

  const brandingB = await app.handle(
    { method: "GET", path: "/api/workspace/branding", query: { organizationId: orgA.id }, headers: {} },
    contextB
  );
  check((brandingB.body as { displayName: string }).displayName === "Bravo Support", "branding API ignores client-supplied tenant identifiers");
  await rejectsCode(
    () => app.handle({ method: "GET", path: "/api/workspace/branding", query: {}, headers: {} }, anonymous),
    "UNAUTHENTICATED",
    "tenant branding is not publicly readable"
  );
  await rejectsCode(
    () => app.handle(
      { method: "GET", path: "/api/workspace/branding", query: {}, headers: {} },
      { ...contextA, organizationId: orgB.id, requestId: "req_spoofed_tenant" }
    ),
    "FORBIDDEN",
    "branding resolution rejects user and organization context mismatches"
  );

  const publicStatus = await app.handle(
    { method: "GET", path: "/api/public/branding", query: {}, headers: { host: "unverified.alpha.test" } },
    anonymous
  );
  const publicBody = publicStatus.body as Record<string, any>;
  check(publicBody.resolution === "not_configured" && publicBody.branding === null, "public tenant resolution reports not configured without domain infrastructure");
  check(publicBody.customDomain.status === "not_configured", "custom domains are never reported as verified without verification");
  check(JSON.stringify(publicBody).toLowerCase().includes("verified") === false, "public branding response contains no false verified claim");
  check(updated.loginBranding.status === "not_configured", "login branding honestly reports unavailable pre-auth tenant discovery");

  const events = await db.audit.listByOrg(orgA.id);
  check(events.some((event) => event.action === "BRANDING_UPDATED" && event.actorId === userA.id), "branding changes are audited with tenant and actor");
  check(!events.some((event) => event.organizationId === orgB.id), "branding audit lookup does not leak another tenant");

  console.log(`\n${passed} white-label checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
