/**
 * Billing boundary.
 *
 * Usage metering is real. Billing is deliberately unavailable until a payment provider is
 * configured. Mutating methods fail explicitly and never manufacture invoices, payments,
 * transactions, taxes, prices, or successful provider responses.
 */

import type {
  BillingConfig,
  BillingPeriodUsage,
  InvoiceDto,
  OverageCalculation,
  PaymentDto,
  PaymentMethodType,
  UsageLimitCheckResult,
} from "../../shared/contracts";
import type { Db } from "../db/store";
import type { Logger } from "../lib/observability";
import { ApiError } from "../lib/observability";
import { createEntitlementEngine } from "./entitlements";

export interface BillingService {
  aggregatePeriodUsage(organizationId: string, periodStart: string, periodEnd: string): Promise<BillingPeriodUsage>;
  generateInvoice(input: { organizationId: string; subscriptionId: string; periodStart: string; periodEnd: string }): Promise<InvoiceDto>;
  getInvoice(organizationId: string, invoiceId: string): Promise<InvoiceDto | undefined>;
  listInvoices(organizationId: string): Promise<InvoiceDto[]>;
  markInvoicePaid(organizationId: string, invoiceId: string): Promise<InvoiceDto | undefined>;
  markInvoiceVoid(organizationId: string, invoiceId: string): Promise<InvoiceDto | undefined>;
  createPayment(input: { organizationId: string; invoiceId: string; amountCents: number; currency: string; paymentMethodType: PaymentMethodType; idempotencyKey: string }): Promise<PaymentDto>;
  getPayment(organizationId: string, paymentId: string): Promise<PaymentDto | undefined>;
  listPayments(organizationId: string): Promise<PaymentDto[]>;
  markPaymentSucceeded(organizationId: string, paymentId: string): Promise<PaymentDto | undefined>;
  markPaymentFailed(organizationId: string, paymentId: string, reason: string): Promise<PaymentDto | undefined>;
  calculateOverage(organizationId: string, usageType: string, totalUsage: number, limit: number): Promise<OverageCalculation>;
  checkUsageLimit(organizationId: string, usageType: string, currentUsage: number): Promise<UsageLimitCheckResult>;
  getBillingConfig(organizationId: string): Promise<BillingConfig>;
  updateBillingConfig(organizationId: string, config: Partial<BillingConfig>): Promise<BillingConfig>;
}

const notConfigured = (): never => {
  throw new ApiError(
    "PROVIDER_NOT_CONFIGURED",
    "Billing provider not configured. No invoice or payment was created.",
    { status: 503 }
  );
};

export function createBillingService({ db, logger }: { db: Db; logger: Logger }): BillingService {
  const entitlements = createEntitlementEngine(db);

  return {
    async aggregatePeriodUsage(organizationId, periodStart, periodEnd) {
      const start = new Date(periodStart);
      const end = new Date(periodEnd);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        throw new ApiError("VALIDATION_ERROR", "A valid usage period is required.");
      }
      const rows = (await db.usage.listByOrg(organizationId)).filter((event) => {
        const at = new Date(event.createdAt);
        return at >= start && at < end;
      });
      const byEventType: Record<string, number> = {};
      for (const event of rows) {
        byEventType[event.eventType] = (byEventType[event.eventType] ?? 0) + event.quantity;
      }
      const sessionIds = new Set(
        rows
          .filter((event) => event.eventType === "voice_session" || event.eventType === "session_started")
          .map((event) => event.sessionId)
          .filter((sessionId): sessionId is string => Boolean(sessionId))
      );
      return {
        organizationId,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        byEventType,
        totalSessions: sessionIds.size || (byEventType.voice_session ?? 0) + (byEventType.session_started ?? 0),
        totalAiRequests: byEventType.ai_request ?? 0,
        totalAudioSeconds: byEventType.audio_seconds ?? 0,
        totalCharacters: byEventType.characters ?? 0,
        totalMessages: byEventType.message ?? 0,
      };
    },

    async generateInvoice() { return notConfigured(); },
    async getInvoice() { return undefined; },
    async listInvoices() { return []; },
    async markInvoicePaid() { return notConfigured(); },
    async markInvoiceVoid() { return notConfigured(); },
    async createPayment() { return notConfigured(); },
    async getPayment() { return undefined; },
    async listPayments() { return []; },
    async markPaymentSucceeded() { return notConfigured(); },
    async markPaymentFailed() { return notConfigured(); },

    async calculateOverage(_organizationId, _usageType, totalUsage, limit) {
      const overage = Math.max(0, totalUsage - limit);
      // Overage quantity is useful operationally; a monetary charge is unknown without a provider.
      return { totalUsage, limit, overage, overageRateCents: 0, overageChargeCents: 0 };
    },

    async checkUsageLimit(organizationId, usageType, currentUsage) {
      const key = {
        audio_seconds: "maxMonthlyMinutes",
        users: "maxUsers",
        agents: "maxAgents",
        campaigns: "maxCampaigns",
        connectors: "maxConnectors",
      }[usageType] as keyof Awaited<ReturnType<typeof entitlements.getEffectiveLimits>> | undefined;
      if (!key) throw new ApiError("VALIDATION_ERROR", "Unknown usage limit.");
      let limit = (await entitlements.getEffectiveLimits(organizationId))[key];
      if (usageType === "audio_seconds") limit *= 60;
      return {
        allowed: currentUsage < limit,
        currentUsage,
        limit,
        remaining: Math.max(0, limit - currentUsage),
        overage: Math.max(0, currentUsage - limit),
      };
    },

    async getBillingConfig() {
      return {
        status: "NOT_CONFIGURED",
        autoGenerateInvoices: false,
        autoProcessPayments: false,
        paymentProvider: null,
        currency: "USD",
        taxRate: 0,
        gracePeriodDays: 0,
      };
    },

    async updateBillingConfig(organizationId) {
      logger.warn("billing_configuration_refused", { organizationId, reason: "provider_not_configured" });
      return notConfigured();
    },
  };
}
