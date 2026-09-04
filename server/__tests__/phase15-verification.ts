/**
 * Phase 15 regression — billing boundary with no provider.
 * Usage and entitlement limits remain real; fake financial records are prohibited.
 */
import { createMemoryDb } from "../db/store";
import { createLogger, ApiError } from "../lib/observability";
import { createBillingService } from "../services/billing";
import { seedDefaultPlans } from "../services/entitlements";

let passed = 0;
function check(value: unknown, message: string) {
  if (!value) throw new Error(message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

async function main() {
  const db = createMemoryDb();
  const billing = createBillingService({ db, logger: createLogger("error", () => undefined) });
  await seedDefaultPlans(db);
  const org = await db.organizations.create({ id: "org_billing_boundary", name: "Billing boundary", slug: "billing-boundary", status: "active" });
  await db.subscriptions.create({
    organizationId: org.id,
    planId: "plan_starter",
    status: "active",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelledAt: null,
  });
  await db.usage.record({ organizationId: org.id, eventType: "audio_seconds", quantity: 120 });
  await db.usage.record({ organizationId: org.id, eventType: "ai_request", quantity: 2 });

  console.log("\nPhase 15 — provider-not-configured regression");
  const usage = await billing.aggregatePeriodUsage(org.id, "2020-01-01T00:00:00Z", "2030-01-01T00:00:00Z");
  check(usage.totalAudioSeconds === 120, "real usage aggregation remains available");
  check(usage.totalAiRequests === 2, "AI request usage remains available");
  const limit = await billing.checkUsageLimit(org.id, "audio_seconds", 120);
  check(limit.limit === 60_000 && limit.allowed, "usage limits come from the subscription plan");
  const overage = await billing.calculateOverage(org.id, "audio_seconds", 150, 100);
  check(overage.overage === 50 && overage.overageChargeCents === 0, "overage quantity has no invented monetary rate");

  let refused = false;
  try {
    await billing.generateInvoice({ organizationId: org.id, subscriptionId: "sub", periodStart: "2026-09-01", periodEnd: "2026-10-01" });
  } catch (error) {
    refused = error instanceof ApiError && error.code === "PROVIDER_NOT_CONFIGURED";
  }
  check(refused, "invoice generation is refused without a provider");
  check((await db.invoices.listByOrg(org.id)).length === 0, "no fake invoice is persisted");
  check((await db.payments.listByOrg(org.id)).length === 0, "no fake payment is persisted");
  const config = await billing.getBillingConfig(org.id);
  check(config.paymentProvider === null && !config.autoGenerateInvoices && !config.autoProcessPayments, "billing reports not configured");

  console.log(`\n${passed} Phase 15 checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
