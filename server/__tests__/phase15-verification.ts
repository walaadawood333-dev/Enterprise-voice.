/**
 * Phase 15 — Billing Verification Tests
 * 
 * Tests usage aggregation, invoice generation, payment processing,
 * overages, limits, and tenant isolation.
 */

import { createMemoryDb, type Db } from "../db/store";
import { createBillingService, type BillingService } from "../services/billing";
import { createEntitlementEngine, seedDefaultPlans } from "../services/entitlements";
import { createLogger } from "../lib/observability";
import type { InvoiceStatus, PaymentStatus, PaymentMethodType } from "../../shared/contracts";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failCount++;
    console.error(`  ✗ ${message}`);
  } else {
    passCount++;
    console.log(`  ✓ ${message}`);
  }
}

async function testUsageAggregation() {
  console.log("\n━━━ 1. Usage Aggregation ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const billing = createBillingService({ db, logger });

  const orgId = "org_test_1";

  // Create test organization
  await db.organizations.create({
    id: orgId,
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  // Record some usage events (using current time which is 2026-09-01)
  await db.usage.record({
    organizationId: orgId,
    eventType: "voice_session",
    quantity: 1,
    metadata: {},
  });

  await db.usage.record({
    organizationId: orgId,
    eventType: "audio_seconds",
    quantity: 120,
    metadata: {},
  });

  await db.usage.record({
    organizationId: orgId,
    eventType: "ai_request",
    quantity: 50,
    metadata: {},
  });

  await db.usage.record({
    organizationId: orgId,
    eventType: "message",
    quantity: 100,
    metadata: {},
  });

  // Aggregate usage (use a broad period that includes current time)
  const usage = await billing.aggregatePeriodUsage(orgId, "2020-01-01T00:00:00Z", "2030-12-31T23:59:59Z");

  assert(usage.organizationId === orgId, "Usage should be for correct organization");
  assert(usage.totalSessions === 1, "Should have 1 session");
  assert(usage.totalAudioSeconds === 120, "Should have 120 audio seconds");
  assert(usage.totalAiRequests === 50, "Should have 50 AI requests");
  assert(usage.totalMessages === 100, "Should have 100 messages");
  assert(usage.byEventType["voice_session"] === 1, "By event type should include voice_session");
  assert(usage.byEventType["audio_seconds"] === 120, "By event type should include audio_seconds");
}

async function testInvoiceGeneration() {
  console.log("\n━━━ 2. Invoice Generation ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const billing = createBillingService({ db, logger });

  await seedDefaultPlans(db);

  const orgId = "org_test_1";

  // Create test organization
  await db.organizations.create({
    id: orgId,
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  // Create subscription
  const subscription = await db.subscriptions.create({
    organizationId: orgId,
    planId: "plan_starter",
    status: "active",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: "2026-09-01T00:00:00Z",
    currentPeriodEnd: "2026-09-30T23:59:59Z",
    cancelledAt: null,
  });

  // Generate invoice
  const invoice = await billing.generateInvoice({
    organizationId: orgId,
    subscriptionId: subscription.id,
    periodStart: "2026-09-01T00:00:00Z",
    periodEnd: "2026-09-30T23:59:59Z",
  });

  assert(invoice.id.startsWith("inv_"), "Invoice should have ID");
  assert(invoice.invoiceNumber.startsWith("INV-"), "Invoice should have invoice number");
  assert(invoice.subscriptionId === subscription.id, "Invoice should reference subscription");
  assert(invoice.status === "draft", "Invoice should start as draft");
  assert(invoice.planAmountCents > 0, "Invoice should have plan amount");
  assert(invoice.totalAmountCents > 0, "Invoice should have total amount");
  assert(invoice.amountPaidCents === 0, "Invoice should start with 0 paid");
  assert(invoice.amountRemainingCents === invoice.totalAmountCents, "Remaining should equal total");
  assert(invoice.currency === "USD", "Currency should be USD");
  assert(invoice.dueAt !== null, "Invoice should have due date");
}

async function testInvoiceLifecycle() {
  console.log("\n━━━ 3. Invoice Lifecycle ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const billing = createBillingService({ db, logger });

  await seedDefaultPlans(db);

  const orgId = "org_test_1";

  // Create test organization
  await db.organizations.create({
    id: orgId,
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  // Create subscription
  const subscription = await db.subscriptions.create({
    organizationId: orgId,
    planId: "plan_starter",
    status: "active",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: "2026-09-01T00:00:00Z",
    currentPeriodEnd: "2026-09-30T23:59:59Z",
    cancelledAt: null,
  });

  // Generate invoice
  const invoice = await billing.generateInvoice({
    organizationId: orgId,
    subscriptionId: subscription.id,
    periodStart: "2026-09-01T00:00:00Z",
    periodEnd: "2026-09-30T23:59:59Z",
  });

  // Mark as paid
  const paidInvoice = await billing.markInvoicePaid(orgId, invoice.id);
  assert(paidInvoice !== undefined, "Paid invoice should exist");
  assert(paidInvoice!.status === "paid", "Invoice should be paid");
  assert(paidInvoice!.amountPaidCents === paidInvoice!.totalAmountCents, "Paid amount should equal total");
  assert(paidInvoice!.amountRemainingCents === 0, "Remaining should be 0");
  assert(paidInvoice!.paidAt !== null, "Paid date should be set");

  // Test void invoice
  const invoice2 = await billing.generateInvoice({
    organizationId: orgId,
    subscriptionId: subscription.id,
    periodStart: "2026-10-01T00:00:00Z",
    periodEnd: "2026-10-31T23:59:59Z",
  });

  const voidInvoice = await billing.markInvoiceVoid(orgId, invoice2.id);
  assert(voidInvoice !== undefined, "Void invoice should exist");
  assert(voidInvoice!.status === "void", "Invoice should be void");
  assert(voidInvoice!.voidedAt !== null, "Void date should be set");
}

async function testPaymentProcessing() {
  console.log("\n━━━ 4. Payment Processing ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const billing = createBillingService({ db, logger });

  await seedDefaultPlans(db);

  const orgId = "org_test_1";

  // Create test organization
  await db.organizations.create({
    id: orgId,
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  // Create subscription
  const subscription = await db.subscriptions.create({
    organizationId: orgId,
    planId: "plan_starter",
    status: "active",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: "2026-09-01T00:00:00Z",
    currentPeriodEnd: "2026-09-30T23:59:59Z",
    cancelledAt: null,
  });

  // Generate invoice
  const invoice = await billing.generateInvoice({
    organizationId: orgId,
    subscriptionId: subscription.id,
    periodStart: "2026-09-01T00:00:00Z",
    periodEnd: "2026-09-30T23:59:59Z",
  });

  // Create payment
  const payment = await billing.createPayment({
    organizationId: orgId,
    invoiceId: invoice.id,
    amountCents: invoice.totalAmountCents,
    currency: "USD",
    paymentMethodType: "card" as PaymentMethodType,
    idempotencyKey: "pay_key_1",
  });

  assert(payment.id.startsWith("pay_"), "Payment should have ID");
  assert(payment.invoiceId === invoice.id, "Payment should reference invoice");
  assert(payment.amountCents === invoice.totalAmountCents, "Payment amount should match invoice");
  assert(payment.status === "pending", "Payment should start as pending");
  assert(payment.paymentMethodType === "card", "Payment method should be card");

  // Mark payment as succeeded
  const succeededPayment = await billing.markPaymentSucceeded(orgId, payment.id);
  assert(succeededPayment !== undefined, "Succeeded payment should exist");
  assert(succeededPayment!.status === "succeeded", "Payment should be succeeded");

  // Check invoice is now paid
  const updatedInvoice = await billing.getInvoice(orgId, invoice.id);
  assert(updatedInvoice !== undefined, "Invoice should exist");
  assert(updatedInvoice!.status === "paid", "Invoice should be paid");
  assert(updatedInvoice!.amountPaidCents === invoice.totalAmountCents, "Invoice should be fully paid");

  // Test idempotency - duplicate payment attempt
  const duplicatePayment = await billing.createPayment({
    organizationId: orgId,
    invoiceId: invoice.id,
    amountCents: invoice.totalAmountCents,
    currency: "USD",
    paymentMethodType: "card" as PaymentMethodType,
    idempotencyKey: "pay_key_1", // Same idempotency key
  });

  assert(duplicatePayment.id === payment.id, "Duplicate payment should return existing payment");
}

async function testPaymentFailure() {
  console.log("\n━━━ 5. Payment Failure ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const billing = createBillingService({ db, logger });

  await seedDefaultPlans(db);

  const orgId = "org_test_1";

  // Create test organization
  await db.organizations.create({
    id: orgId,
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  // Create subscription
  const subscription = await db.subscriptions.create({
    organizationId: orgId,
    planId: "plan_starter",
    status: "active",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: "2026-09-01T00:00:00Z",
    currentPeriodEnd: "2026-09-30T23:59:59Z",
    cancelledAt: null,
  });

  // Generate invoice
  const invoice = await billing.generateInvoice({
    organizationId: orgId,
    subscriptionId: subscription.id,
    periodStart: "2026-09-01T00:00:00Z",
    periodEnd: "2026-09-30T23:59:59Z",
  });

  // Create payment
  const payment = await billing.createPayment({
    organizationId: orgId,
    invoiceId: invoice.id,
    amountCents: invoice.totalAmountCents,
    currency: "USD",
    paymentMethodType: "card" as PaymentMethodType,
    idempotencyKey: "pay_key_fail",
  });

  // Mark payment as failed
  const failedPayment = await billing.markPaymentFailed(orgId, payment.id, "Insufficient funds");
  assert(failedPayment !== undefined, "Failed payment should exist");
  assert(failedPayment!.status === "failed", "Payment should be failed");
  assert(failedPayment!.failureReason === "Insufficient funds", "Failure reason should be set");

  // Invoice should still be unpaid
  const updatedInvoice = await billing.getInvoice(orgId, invoice.id);
  assert(updatedInvoice!.status !== "paid", "Invoice should not be paid");
  assert(updatedInvoice!.amountPaidCents === 0, "Invoice should have 0 paid");
}

async function testOverageCalculation() {
  console.log("\n━━━ 6. Overage Calculation ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const billing = createBillingService({ db, logger });

  const orgId = "org_test_1";

  // Calculate overage (150 seconds used, 100 second limit)
  const overage = await billing.calculateOverage(orgId, "audio_seconds", 150, 100);

  assert(overage.totalUsage === 150, "Total usage should be 150");
  assert(overage.limit === 100, "Limit should be 100");
  assert(overage.overage === 50, "Overage should be 50");
  assert(overage.overageRateCents > 0, "Overage rate should be > 0");
  assert(overage.overageChargeCents === overage.overage * overage.overageRateCents, "Overage charge should be correct");

  // Test no overage (50 seconds used, 100 second limit)
  const noOverage = await billing.calculateOverage(orgId, "audio_seconds", 50, 100);
  assert(noOverage.overage === 0, "No overage when under limit");
  assert(noOverage.overageChargeCents === 0, "No charge when under limit");
}

async function testUsageLimitCheck() {
  console.log("\n━━━ 7. Usage Limit Check ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const billing = createBillingService({ db, logger });

  await seedDefaultPlans(db);

  const orgId = "org_test_1";

  // Create test organization
  await db.organizations.create({
    id: orgId,
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  // Create subscription
  await db.subscriptions.create({
    organizationId: orgId,
    planId: "plan_starter",
    status: "active",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: "2026-09-01T00:00:00Z",
    currentPeriodEnd: "2026-09-30T23:59:59Z",
    cancelledAt: null,
  });

  // Check limit (under limit)
  const underLimit = await billing.checkUsageLimit(orgId, "agents", 2);
  assert(underLimit.allowed === true, "Should be allowed when under limit");
  assert(underLimit.currentUsage === 2, "Current usage should be 2");
  assert(underLimit.limit === 3, "Limit should be 3 (starter plan)");
  assert(underLimit.remaining === 1, "Remaining should be 1");
  assert(underLimit.overage === 0, "No overage when under limit");

  // Check limit (at limit)
  const atLimit = await billing.checkUsageLimit(orgId, "agents", 3);
  assert(atLimit.allowed === false, "Should not be allowed when at limit");
  assert(atLimit.remaining === 0, "No remaining when at limit");
  assert(atLimit.overage === 0, "No overage when at limit");

  // Check limit (over limit)
  const overLimit = await billing.checkUsageLimit(orgId, "agents", 5);
  assert(overLimit.allowed === false, "Should not be allowed when over limit");
  assert(overLimit.remaining === 0, "No remaining when over limit");
  assert(overLimit.overage === 2, "Overage should be 2");
}

async function testTenantIsolation() {
  console.log("\n━━━ 8. Tenant Isolation ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const billing = createBillingService({ db, logger });

  await seedDefaultPlans(db);

  const orgId1 = "org_billing_test_1";
  const orgId2 = "org_billing_test_2";

  // Create two organizations
  await db.organizations.create({
    id: orgId1,
    name: "Org 1",
    slug: "org-1",
    status: "active",
  });

  await db.organizations.create({
    id: orgId2,
    name: "Org 2",
    slug: "org-2",
    status: "active",
  });

  // Create subscriptions for each
  const sub1 = await db.subscriptions.create({
    organizationId: orgId1,
    planId: "plan_starter",
    status: "active",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: "2026-09-01T00:00:00Z",
    currentPeriodEnd: "2026-09-30T23:59:59Z",
    cancelledAt: null,
  });

  const sub2 = await db.subscriptions.create({
    organizationId: orgId2,
    planId: "plan_professional",
    status: "active",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: "2026-09-01T00:00:00Z",
    currentPeriodEnd: "2026-09-30T23:59:59Z",
    cancelledAt: null,
  });

  // Generate invoices for each
  const invoice1 = await billing.generateInvoice({
    organizationId: orgId1,
    subscriptionId: sub1.id,
    periodStart: "2026-09-01T00:00:00Z",
    periodEnd: "2026-09-30T23:59:59Z",
  });

  const invoice2 = await billing.generateInvoice({
    organizationId: orgId2,
    subscriptionId: sub2.id,
    periodStart: "2026-09-01T00:00:00Z",
    periodEnd: "2026-09-30T23:59:59Z",
  });

  // List invoices for org1
  const org1Invoices = await billing.listInvoices(orgId1);
  assert(org1Invoices.length === 1, "Org 1 should have 1 invoice");
  assert(org1Invoices[0].id === invoice1.id, "Org 1 should see its own invoice");

  // List invoices for org2
  const org2Invoices = await billing.listInvoices(orgId2);
  assert(org2Invoices.length === 1, "Org 2 should have 1 invoice");
  assert(org2Invoices[0].id === invoice2.id, "Org 2 should see its own invoice");

  // Org 1 should not see org 2's invoice
  const crossOrgInvoice = await billing.getInvoice(orgId1, invoice2.id);
  assert(crossOrgInvoice === undefined, "Org 1 should not see org 2's invoice");

  // Test usage isolation
  await db.usage.record({
    organizationId: orgId1,
    eventType: "voice_session",
    quantity: 1,
    metadata: {},
  });

  const org1Usage = await billing.aggregatePeriodUsage(
    orgId1,
    "2020-01-01T00:00:00Z",
    "2030-12-31T23:59:59Z"
  );
  const org2Usage = await billing.aggregatePeriodUsage(
    orgId2,
    "2020-01-01T00:00:00Z",
    "2030-12-31T23:59:59Z"
  );

  assert(org1Usage.totalSessions === 1, "Org 1 should have 1 session");
  assert(org2Usage.totalSessions === 0, "Org 2 should have 0 sessions");
}

async function testInvoiceListing() {
  console.log("\n━━━ 9. Invoice Listing ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const billing = createBillingService({ db, logger });

  await seedDefaultPlans(db);

  const orgId = "org_test_1";

  // Create test organization
  await db.organizations.create({
    id: orgId,
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  // Create subscription
  const subscription = await db.subscriptions.create({
    organizationId: orgId,
    planId: "plan_starter",
    status: "active",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: "2026-09-01T00:00:00Z",
    currentPeriodEnd: "2026-09-30T23:59:59Z",
    cancelledAt: null,
  });

  // Generate multiple invoices
  const invoice1 = await billing.generateInvoice({
    organizationId: orgId,
    subscriptionId: subscription.id,
    periodStart: "2026-09-01T00:00:00Z",
    periodEnd: "2026-09-30T23:59:59Z",
  });

  // Small delay to ensure different timestamps
  await new Promise(resolve => setTimeout(resolve, 10));

  const invoice2 = await billing.generateInvoice({
    organizationId: orgId,
    subscriptionId: subscription.id,
    periodStart: "2026-10-01T00:00:00Z",
    periodEnd: "2026-10-31T23:59:59Z",
  });

  // List invoices
  const invoices = await billing.listInvoices(orgId);
  assert(invoices.length === 2, "Should have 2 invoices");
  assert(invoices[0].id === invoice2.id, "Most recent invoice should be first");
  assert(invoices[1].id === invoice1.id, "Older invoice should be second");
}

async function testPaymentListing() {
  console.log("\n━━━ 10. Payment Listing ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const billing = createBillingService({ db, logger });

  await seedDefaultPlans(db);

  const orgId = "org_test_1";

  // Create test organization
  await db.organizations.create({
    id: orgId,
    name: "Test Org",
    slug: "test-org",
    status: "active",
  });

  // Create subscription
  const subscription = await db.subscriptions.create({
    organizationId: orgId,
    planId: "plan_starter",
    status: "active",
    effectiveLimits: null,
    trialEndsAt: null,
    currentPeriodStart: "2026-09-01T00:00:00Z",
    currentPeriodEnd: "2026-09-30T23:59:59Z",
    cancelledAt: null,
  });

  // Generate invoice
  const invoice = await billing.generateInvoice({
    organizationId: orgId,
    subscriptionId: subscription.id,
    periodStart: "2026-09-01T00:00:00Z",
    periodEnd: "2026-09-30T23:59:59Z",
  });

  // Create multiple payments
  const payment1 = await billing.createPayment({
    organizationId: orgId,
    invoiceId: invoice.id,
    amountCents: 5000,
    currency: "USD",
    paymentMethodType: "card" as PaymentMethodType,
    idempotencyKey: "pay_key_1",
  });

  const payment2 = await billing.createPayment({
    organizationId: orgId,
    invoiceId: invoice.id,
    amountCents: 5000,
    currency: "USD",
    paymentMethodType: "bank_transfer" as PaymentMethodType,
    idempotencyKey: "pay_key_2",
  });

  // List payments
  const payments = await billing.listPayments(orgId);
  assert(payments.length === 2, "Should have 2 payments");
}

async function testBillingConfig() {
  console.log("\n━━━ 11. Billing Configuration ━━━");

  const db = createMemoryDb();
  const logger = createLogger("error");
  const billing = createBillingService({ db, logger });

  const orgId = "org_test_1";

  // Get default config
  const config = await billing.getBillingConfig(orgId);
  assert(config.autoGenerateInvoices === true, "Auto-generate should be true by default");
  assert(config.autoProcessPayments === false, "Auto-process should be false by default");
  assert(config.currency === "USD", "Currency should be USD by default");
  assert(config.taxRate > 0, "Tax rate should be > 0");
  assert(config.gracePeriodDays > 0, "Grace period should be > 0");
}

async function runAllTests() {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("Phase 15 Verification Tests - SaaS Billing & Revenue Operations");
  console.log("════════════════════════════════════════════════════════════");

  await testUsageAggregation();
  await testInvoiceGeneration();
  await testInvoiceLifecycle();
  await testPaymentProcessing();
  await testPaymentFailure();
  await testOverageCalculation();
  await testUsageLimitCheck();
  await testTenantIsolation();
  await testInvoiceListing();
  await testPaymentListing();
  await testBillingConfig();

  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`Phase 15 Tests: ${passCount} passed, ${failCount} failed`);
  console.log("════════════════════════════════════════════════════════════");

  if (failCount > 0) {
    console.log("❌ Some tests failed!");
    process.exit(1);
  } else {
    console.log("✅ All Phase 15 verification tests passed!");
    process.exit(0);
  }
}

runAllTests().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});
