/**
 * Phase 15 — Billing Service
 * 
 * Converts usage data into invoices and manages the payment lifecycle.
 * All calculations are server-side only.
 */

import type {
  InvoiceRow,
  InvoiceDto,
  InvoiceStatus,
  PaymentRow,
  PaymentDto,
  PaymentStatus,
  PaymentMethodType,
  BillingPeriodUsage,
  OverageCalculation,
  BillingConfig,
  UsageLimitCheckResult,
  PlanRow,
  SubscriptionRow,
} from "../../shared/contracts";
import type { Db } from "../db/store";
import type { Logger } from "../lib/observability";

export interface BillingService {
  // Usage aggregation
  aggregatePeriodUsage(
    organizationId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<BillingPeriodUsage>;

  // Invoice management
  generateInvoice(input: {
    organizationId: string;
    subscriptionId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<InvoiceDto>;

  getInvoice(organizationId: string, invoiceId: string): Promise<InvoiceDto | undefined>;
  listInvoices(organizationId: string): Promise<InvoiceDto[]>;
  markInvoicePaid(organizationId: string, invoiceId: string): Promise<InvoiceDto | undefined>;
  markInvoiceVoid(organizationId: string, invoiceId: string): Promise<InvoiceDto | undefined>;

  // Payment management
  createPayment(input: {
    organizationId: string;
    invoiceId: string;
    amountCents: number;
    currency: string;
    paymentMethodType: PaymentMethodType;
    idempotencyKey: string;
  }): Promise<PaymentDto>;

  getPayment(organizationId: string, paymentId: string): Promise<PaymentDto | undefined>;
  listPayments(organizationId: string): Promise<PaymentDto[]>;
  markPaymentSucceeded(organizationId: string, paymentId: string): Promise<PaymentDto | undefined>;
  markPaymentFailed(
    organizationId: string,
    paymentId: string,
    reason: string
  ): Promise<PaymentDto | undefined>;

  // Overages
  calculateOverage(
    organizationId: string,
    usageType: string,
    totalUsage: number,
    limit: number
  ): Promise<OverageCalculation>;

  // Limits
  checkUsageLimit(
    organizationId: string,
    usageType: string,
    currentUsage: number
  ): Promise<UsageLimitCheckResult>;

  // Billing config
  getBillingConfig(organizationId: string): Promise<BillingConfig>;
  updateBillingConfig(
    organizationId: string,
    config: Partial<BillingConfig>
  ): Promise<BillingConfig>;
}

/**
 * Create billing service
 */
export function createBillingService(deps: {
  db: Db;
  logger: Logger;
}): BillingService {
  const { db, logger } = deps;

  // Helper: Map row to DTO
  function invoiceToDto(row: InvoiceRow): InvoiceDto {
    return {
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      subscriptionId: row.subscriptionId,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      status: row.status,
      planAmountCents: row.planAmountCents,
      overageAmountCents: row.overageAmountCents,
      taxAmountCents: row.taxAmountCents,
      discountAmountCents: row.discountAmountCents,
      totalAmountCents: row.totalAmountCents,
      amountPaidCents: row.amountPaidCents,
      amountRemainingCents: row.amountRemainingCents,
      currency: row.currency,
      dueAt: row.dueAt,
      paidAt: row.paidAt,
      voidedAt: row.voidedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // Helper: Map payment row to DTO
  function paymentToDto(row: PaymentRow): PaymentDto {
    return {
      id: row.id,
      invoiceId: row.invoiceId,
      amountCents: row.amountCents,
      currency: row.currency,
      status: row.status,
      paymentMethodType: row.paymentMethodType,
      paymentProvider: row.paymentProvider,
      failureReason: row.failureReason,
      refundedAt: row.refundedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // Helper: Generate invoice number
  async function generateInvoiceNumber(organizationId: string): Promise<string> {
    const year = new Date().getFullYear();
    const invoices = await db.invoices.listByOrg(organizationId);
    const thisYearInvoices = invoices.filter((inv) =>
      inv.invoiceNumber.startsWith(`INV-${year}-`)
    );
    const nextNumber = thisYearInvoices.length + 1;
    return `INV-${year}-${String(nextNumber).padStart(4, "0")}`;
  }

  return {
    async aggregatePeriodUsage(organizationId, periodStart, periodEnd) {
      const usageEvents = await db.usage.listByOrg(organizationId);

      // Filter by period
      const periodEvents = usageEvents.filter((event) => {
        const eventDate = new Date(event.createdAt);
        return eventDate >= new Date(periodStart) && eventDate < new Date(periodEnd);
      });

      // Aggregate by event type
      const byEventType: Record<string, number> = {};
      let totalSessions = 0;
      let totalAiRequests = 0;
      let totalAudioSeconds = 0;
      let totalCharacters = 0;
      let totalMessages = 0;

      for (const event of periodEvents) {
        byEventType[event.eventType] = (byEventType[event.eventType] || 0) + event.quantity;

        if (event.eventType === "voice_session") totalSessions++;
        if (event.eventType === "ai_request") totalAiRequests += event.quantity;
        if (event.eventType === "audio_seconds") totalAudioSeconds += event.quantity;
        if (event.eventType === "characters") totalCharacters += event.quantity;
        if (event.eventType === "message") totalMessages += event.quantity;
      }

      return {
        organizationId,
        periodStart,
        periodEnd,
        byEventType,
        totalSessions,
        totalAiRequests,
        totalAudioSeconds,
        totalCharacters,
        totalMessages,
      };
    },

    async generateInvoice(input) {
      const { organizationId, subscriptionId, periodStart, periodEnd } = input;

      // Get subscription and plan
      const subscription = await db.subscriptions.getByOrg(organizationId);
      if (!subscription) {
        throw new Error("Subscription not found");
      }
      // Note: subscriptionId parameter is for future multi-subscription support
      // Currently we use the org's active subscription

      const plan = await db.plans.get(subscription.planId);
      if (!plan) {
        throw new Error("Plan not found");
      }

      // Aggregate usage for the period
      const usage = await this.aggregatePeriodUsage(organizationId, periodStart, periodEnd);

      // Calculate plan amount
      const planAmountCents = plan.priceCents;

      // Calculate overages (if any)
      // For now, we'll calculate audio seconds overage
      const audioLimit = plan.limits.maxMonthlyMinutes * 60; // Convert to seconds
      const audioOverage = Math.max(0, usage.totalAudioSeconds - audioLimit);
      const overageRateCents = 5; // $0.05 per second overage (example rate)
      const overageAmountCents = audioOverage * overageRateCents;

      // Calculate tax (example: 16% VAT)
      const taxRate = 0.16;
      const subtotalCents = planAmountCents + overageAmountCents;
      const taxAmountCents = Math.round(subtotalCents * taxRate);

      // Calculate total
      const discountAmountCents = 0; // No discounts for now
      const totalAmountCents = subtotalCents + taxAmountCents - discountAmountCents;

      // Generate invoice number
      const invoiceNumber = await generateInvoiceNumber(organizationId);

      // Calculate due date (30 days from now)
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + 30);

      // Create invoice
      const invoice = await db.invoices.create({
        organizationId,
        invoiceNumber,
        subscriptionId,
        periodStart,
        periodEnd,
        status: "draft" as InvoiceStatus,
        planAmountCents,
        overageAmountCents,
        taxAmountCents,
        discountAmountCents,
        totalAmountCents,
        amountPaidCents: 0,
        amountRemainingCents: totalAmountCents,
        currency: "USD",
        dueAt: dueAt.toISOString(),
        paidAt: null,
        voidedAt: null,
        usageSnapshot: usage.byEventType,
        notes: null,
      });

      logger.info("invoice_generated", {
        invoiceId: invoice.id,
        organizationId,
        totalAmountCents,
      });

      return invoiceToDto(invoice);
    },

    async getInvoice(organizationId, invoiceId) {
      const row = await db.invoices.get(invoiceId, organizationId);
      return row ? invoiceToDto(row) : undefined;
    },

    async listInvoices(organizationId) {
      const rows = await db.invoices.listByOrg(organizationId);
      return rows.map(invoiceToDto);
    },

    async markInvoicePaid(organizationId, invoiceId) {
      const invoice = await db.invoices.get(invoiceId, organizationId);
      if (!invoice) return undefined;

      const updated = await db.invoices.update(invoiceId, organizationId, {
        status: "paid" as InvoiceStatus,
        amountPaidCents: invoice.totalAmountCents,
        amountRemainingCents: 0,
        paidAt: new Date().toISOString(),
      });

      logger.info("invoice_paid", {
        invoiceId,
        organizationId,
        amount: invoice.totalAmountCents,
      });

      return updated ? invoiceToDto(updated) : undefined;
    },

    async markInvoiceVoid(organizationId, invoiceId) {
      const updated = await db.invoices.update(invoiceId, organizationId, {
        status: "void" as InvoiceStatus,
        voidedAt: new Date().toISOString(),
      });

      logger.info("invoice_voided", { invoiceId, organizationId });

      return updated ? invoiceToDto(updated) : undefined;
    },

    async createPayment(input) {
      const { organizationId, invoiceId, amountCents, currency, paymentMethodType, idempotencyKey } =
        input;

      // Check for duplicate payment (idempotency)
      const existing = await db.payments.getByIdempotencyKey(idempotencyKey);
      if (existing) {
        logger.warn("duplicate_payment_attempt", { idempotencyKey });
        return paymentToDto(existing);
      }

      // Verify invoice exists and belongs to organization
      const invoice = await db.invoices.get(invoiceId, organizationId);
      if (!invoice) {
        throw new Error("Invoice not found");
      }

      // Create payment record
      const payment = await db.payments.create({
        organizationId,
        invoiceId,
        amountCents,
        currency,
        status: "pending" as PaymentStatus,
        paymentMethodType,
        externalPaymentId: null,
        paymentProvider: null,
        failureReason: null,
        refundedAt: null,
        idempotencyKey,
      });

      logger.info("payment_created", {
        paymentId: payment.id,
        invoiceId,
        amountCents,
      });

      return paymentToDto(payment);
    },

    async getPayment(organizationId, paymentId) {
      const row = await db.payments.get(paymentId, organizationId);
      return row ? paymentToDto(row) : undefined;
    },

    async listPayments(organizationId) {
      const rows = await db.payments.listByOrg(organizationId);
      return rows.map(paymentToDto);
    },

    async markPaymentSucceeded(organizationId, paymentId) {
      const payment = await db.payments.get(paymentId, organizationId);
      if (!payment) return undefined;

      const updated = await db.payments.update(paymentId, organizationId, {
        status: "succeeded" as PaymentStatus,
      });

      // Update invoice
      const invoice = await db.invoices.get(payment.invoiceId, organizationId);
      if (invoice) {
        const newAmountPaid = invoice.amountPaidCents + payment.amountCents;
        const newAmountRemaining = Math.max(0, invoice.totalAmountCents - newAmountPaid);

        await db.invoices.update(payment.invoiceId, organizationId, {
          amountPaidCents: newAmountPaid,
          amountRemainingCents: newAmountRemaining,
          status: newAmountRemaining === 0 ? ("paid" as InvoiceStatus) : invoice.status,
          paidAt: newAmountRemaining === 0 ? new Date().toISOString() : invoice.paidAt,
        });
      }

      logger.info("payment_succeeded", {
        paymentId,
        invoiceId: payment.invoiceId,
        amount: payment.amountCents,
      });

      return updated ? paymentToDto(updated) : undefined;
    },

    async markPaymentFailed(organizationId, paymentId, reason) {
      const updated = await db.payments.update(paymentId, organizationId, {
        status: "failed" as PaymentStatus,
        failureReason: reason,
      });

      logger.warn("payment_failed", { paymentId, reason });

      return updated ? paymentToDto(updated) : undefined;
    },

    async calculateOverage(organizationId, usageType, totalUsage, limit) {
      const overage = Math.max(0, totalUsage - limit);
      // Example rates (would be configurable in production)
      const rates: Record<string, number> = {
        audio_seconds: 5, // $0.05 per second
        ai_requests: 1, // $0.01 per request
        messages: 1, // $0.01 per message
      };
      const overageRateCents = rates[usageType] || 0;
      const overageChargeCents = overage * overageRateCents;

      return {
        totalUsage,
        limit,
        overage,
        overageRateCents,
        overageChargeCents,
      };
    },

    async checkUsageLimit(organizationId, usageType, currentUsage) {
      const subscription = await db.subscriptions.getByOrg(organizationId);
      if (!subscription) {
        throw new Error("Subscription not found");
      }

      const plan = await db.plans.get(subscription.planId);
      if (!plan) {
        throw new Error("Plan not found");
      }

      // Map usage type to limit field
      const limitMap: Record<string, number> = {
        audio_seconds: plan.limits.maxMonthlyMinutes * 60,
        users: plan.limits.maxUsers,
        agents: plan.limits.maxAgents,
        campaigns: plan.limits.maxCampaigns,
        connectors: plan.limits.maxConnectors,
      };

      const limit = limitMap[usageType] || 0;
      const remaining = Math.max(0, limit - currentUsage);
      const overage = Math.max(0, currentUsage - limit);

      return {
        allowed: currentUsage < limit,
        currentUsage,
        limit,
        remaining,
        overage,
      };
    },

    async getBillingConfig(organizationId) {
      // For now, return default config
      // In production, this would be stored per organization
      return {
        autoGenerateInvoices: true,
        autoProcessPayments: false,
        paymentProvider: null,
        currency: "USD",
        taxRate: 0.16,
        gracePeriodDays: 30,
      };
    },

    async updateBillingConfig(organizationId, config) {
      // In production, this would persist the config
      logger.info("billing_config_updated", { organizationId, config });
      return this.getBillingConfig(organizationId);
    },
  };
}
