/**
 * Entitlement Engine Service — Phase 10A
 *
 * Central service for checking feature entitlements and limits.
 * Enforces the hierarchy: Plan → Entitlements → Limits → Organization
 */

import type {
  Feature,
  OrganizationLimits,
  PlanRow,
  SubscriptionRow,
  SubscriptionStatus,
} from "../../shared/contracts";
import type { Db } from "../db/store";

export interface EntitlementEngine {
  /** Check if an organization has a feature enabled */
  hasFeature(organizationId: string, feature: Feature): Promise<boolean>;

  /** Get all enabled features for an organization */
  getEnabledFeatures(organizationId: string): Promise<Feature[]>;

  /** Get effective limits for an organization (plan defaults + overrides) */
  getEffectiveLimits(organizationId: string): Promise<OrganizationLimits>;

  /** Check if an organization has reached a limit */
  checkLimit(
    organizationId: string,
    limitKey: keyof OrganizationLimits,
    currentValue: number
  ): Promise<{ allowed: boolean; limit: number; current: number }>;

  /** Get subscription for an organization */
  getSubscription(organizationId: string): Promise<SubscriptionWithPlan | null>;

  /** Check if subscription is active */
  isSubscriptionActive(organizationId: string): Promise<boolean>;
}

export interface SubscriptionWithPlan extends SubscriptionRow {
  plan: PlanRow;
}

/**
 * Default plan definitions for seeding the database.
 */
export const DEFAULT_PLANS: Omit<PlanRow, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Starter",
    planType: "starter",
    features: [
      "ai_agents",
      "voice_calls",
      "analytics",
    ],
    limits: {
      maxUsers: 5,
      maxAgents: 3,
      maxMonthlyMinutes: 1000,
      maxCampaigns: 0,
      maxConnectors: 1,
    },
    priceCents: 9900,
    interval: "month",
    isActive: true,
  },
  {
    name: "Professional",
    planType: "professional",
    features: [
      "ai_agents",
      "voice_calls",
      "inbound_calls",
      "outbound_calls",
      "analytics",
      "advanced_analytics",
      "reporting",
      "api_access",
    ],
    limits: {
      maxUsers: 25,
      maxAgents: 20,
      maxMonthlyMinutes: 10000,
      maxCampaigns: 10,
      maxConnectors: 5,
    },
    priceCents: 49900,
    interval: "month",
    isActive: true,
  },
  {
    name: "Enterprise",
    planType: "enterprise",
    features: [
      "ai_agents",
      "voice_calls",
      "inbound_calls",
      "outbound_calls",
      "campaigns",
      "live_call_monitoring",
      "analytics",
      "advanced_analytics",
      "reporting",
      "data_connectors",
      "knowledge_base",
      "compliance",
      "dnc_management",
      "audit_trail",
      "qa_evaluation",
      "custom_branding",
      "api_access",
      "custom_integrations",
      "contact_center_operations",
    ],
    limits: {
      maxUsers: 1000,
      maxAgents: 1000,
      maxMonthlyMinutes: 1000000,
      maxCampaigns: 1000,
      maxConnectors: 100,
    },
    priceCents: 0,
    interval: "month",
    isActive: true,
  },
];

/**
 * Create the entitlement engine service.
 */
export function createEntitlementEngine(db: Db): EntitlementEngine {
  return {
    async hasFeature(organizationId: string, feature: Feature): Promise<boolean> {
      const subscription = await db.subscriptions.getByOrg(organizationId);
      if (!subscription) return false;

      // Check subscription status
      if (!isStatusActive(subscription.status)) return false;

      // Get plan features
      const plan = await db.plans.get(subscription.planId);
      if (!plan) return false;

      return plan.features.includes(feature);
    },

    async getEnabledFeatures(organizationId: string): Promise<Feature[]> {
      const subscription = await db.subscriptions.getByOrg(organizationId);
      if (!subscription) return [];

      if (!isStatusActive(subscription.status)) return [];

      const plan = await db.plans.get(subscription.planId);
      if (!plan) return [];

      return plan.features;
    },

    async getEffectiveLimits(organizationId: string): Promise<OrganizationLimits> {
      const subscription = await db.subscriptions.getByOrg(organizationId);
      if (!subscription) {
        // Default limits for organizations without subscriptions
        return {
          maxUsers: 5,
          maxAgents: 3,
          maxMonthlyMinutes: 1000,
          maxCampaigns: 0,
          maxConnectors: 1,
        };
      }

      // If organization has custom effective limits, use those
      if (subscription.effectiveLimits) {
        return subscription.effectiveLimits;
      }

      // Otherwise use plan defaults
      const plan = await db.plans.get(subscription.planId);
      if (!plan) {
        return {
          maxUsers: 5,
          maxAgents: 3,
          maxMonthlyMinutes: 1000,
          maxCampaigns: 0,
          maxConnectors: 1,
        };
      }

      return plan.limits;
    },

    async checkLimit(
      organizationId: string,
      limitKey: keyof OrganizationLimits,
      currentValue: number
    ): Promise<{ allowed: boolean; limit: number; current: number }> {
      const limits = await this.getEffectiveLimits(organizationId);
      const limit = limits[limitKey];
      return {
        allowed: currentValue < limit,
        limit,
        current: currentValue,
      };
    },

    async getSubscription(organizationId: string): Promise<SubscriptionWithPlan | null> {
      const subscription = await db.subscriptions.getByOrg(organizationId);
      if (!subscription) return null;

      const plan = await db.plans.get(subscription.planId);
      if (!plan) return null;

      return { ...subscription, plan };
    },

    async isSubscriptionActive(organizationId: string): Promise<boolean> {
      const subscription = await db.subscriptions.getByOrg(organizationId);
      if (!subscription) return false;
      return isStatusActive(subscription.status);
    },
  };
}

/**
 * Check if a subscription status is considered active.
 */
function isStatusActive(status: SubscriptionStatus): boolean {
  const normalized = status.toLowerCase();
  return normalized === "active" || normalized === "trial";
}

/**
 * Seed default plans into the database if they don't exist.
 */
export async function seedDefaultPlans(db: Db): Promise<void> {
  const existing = await db.plans.list();
  if (existing.length > 0) return;

  for (const plan of DEFAULT_PLANS) {
    await db.plans.create({
      id: `plan_${plan.planType}`,
      ...plan,
    });
  }
}
