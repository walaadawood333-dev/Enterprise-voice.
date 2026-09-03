/**
 * SaaS entitlement engine.
 *
 * This is the backend source of truth for commercial access:
 * Organization -> Subscription -> Plan -> plan features/limits -> organization overrides.
 * Missing or inactive commercial data always fails closed.
 */

import {
  FEATURES,
  type Feature,
  type OrganizationLimits,
  type PlanRow,
  type SubscriptionRow,
  type SubscriptionStatus,
} from "../../shared/contracts";
import type { Db } from "../db/store";
import { ApiError } from "../lib/observability";

export const ZERO_LIMITS: OrganizationLimits = Object.freeze({
  maxUsers: 0,
  maxAgents: 0,
  maxMonthlyMinutes: 0,
  maxCampaigns: 0,
  maxConnectors: 0,
});

export interface ResolvedCapability {
  feature: Feature;
  enabled: boolean;
  source: "plan" | "override" | "unavailable";
}

export interface EntitlementEngine {
  hasFeature(organizationId: string, feature: Feature): Promise<boolean>;
  assertFeature(organizationId: string, feature: Feature): Promise<void>;
  getEnabledFeatures(organizationId: string): Promise<Feature[]>;
  getCapabilities(organizationId: string): Promise<ResolvedCapability[]>;
  getEffectiveLimits(organizationId: string): Promise<OrganizationLimits>;
  checkLimit(
    organizationId: string,
    limitKey: keyof OrganizationLimits,
    currentValue: number
  ): Promise<{ allowed: boolean; limit: number; current: number }>;
  assertLimit(
    organizationId: string,
    limitKey: keyof OrganizationLimits,
    currentValue: number
  ): Promise<void>;
  getSubscription(organizationId: string): Promise<SubscriptionWithPlan | null>;
  isSubscriptionActive(organizationId: string): Promise<boolean>;
}

export interface SubscriptionWithPlan extends SubscriptionRow {
  plan: PlanRow;
}

/** Only capabilities backed by current product routes/services are included. */
export const DEFAULT_PLANS: Omit<PlanRow, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Starter",
    planType: "starter",
    status: "active",
    features: ["ai_agents", "voice_calls", "analytics"],
    limits: {
      maxUsers: 5,
      maxAgents: 3,
      maxMonthlyMinutes: 1000,
      maxCampaigns: 0,
      maxConnectors: 1,
    },
  },
  {
    name: "Professional",
    planType: "professional",
    status: "active",
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
  },
  {
    name: "Enterprise",
    planType: "enterprise",
    status: "active",
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
  },
];

const isKnownFeature = (value: string): value is Feature =>
  (FEATURES as readonly string[]).includes(value);

const activeSubscription = (subscription: SubscriptionRow): boolean => {
  if (!isStatusActive(subscription.status)) return false;
  if (
    subscription.status.toLowerCase() === "trial" &&
    subscription.trialEndsAt &&
    new Date(subscription.trialEndsAt).getTime() <= Date.now()
  ) {
    return false;
  }
  return true;
};

const availablePlan = (plan: PlanRow): boolean =>
  plan.status === "active" || plan.status === "archived";

export function createEntitlementEngine(db: Db): EntitlementEngine {
  const resolve = async (organizationId: string): Promise<SubscriptionWithPlan | null> => {
    const organization = await db.organizations.get(organizationId);
    if (!organization || organization.status === "suspended") return null;

    const subscription = await db.subscriptions.getByOrg(organizationId);
    if (!subscription || !activeSubscription(subscription)) return null;

    const plan = await db.plans.get(subscription.planId);
    if (!plan || !availablePlan(plan)) return null;
    return { ...subscription, plan };
  };

  const capabilities = async (organizationId: string): Promise<ResolvedCapability[]> => {
    const subscription = await resolve(organizationId);
    if (!subscription) {
      return FEATURES.map((feature) => ({ feature, enabled: false, source: "unavailable" }));
    }

    const overrides = new Map(
      (await db.entitlements.listByOrg(organizationId)).map((row) => [row.feature, row.enabled])
    );
    return FEATURES.map((feature) => {
      const overridden = overrides.get(feature);
      return overridden === undefined
        ? { feature, enabled: subscription.plan.features.includes(feature), source: "plan" as const }
        : { feature, enabled: overridden, source: "override" as const };
    });
  };

  const engine: EntitlementEngine = {
    async hasFeature(organizationId, feature) {
      if (!isKnownFeature(feature)) return false;
      return (await capabilities(organizationId)).find((item) => item.feature === feature)?.enabled === true;
    },

    async assertFeature(organizationId, feature) {
      if (!(await engine.hasFeature(organizationId, feature))) {
        throw new ApiError(
          "FORBIDDEN",
          `The ${feature} capability is not available for this organization.`,
          { status: 403 }
        );
      }
    },

    async getEnabledFeatures(organizationId) {
      return (await capabilities(organizationId))
        .filter((item) => item.enabled)
        .map((item) => item.feature);
    },

    getCapabilities: capabilities,

    async getEffectiveLimits(organizationId) {
      const subscription = await resolve(organizationId);
      if (!subscription) return { ...ZERO_LIMITS };
      return {
        ...subscription.plan.limits,
        ...(subscription.effectiveLimits ?? {}),
      };
    },

    async checkLimit(organizationId, limitKey, currentValue) {
      const limit = (await engine.getEffectiveLimits(organizationId))[limitKey];
      return { allowed: currentValue < limit, limit, current: currentValue };
    },

    async assertLimit(organizationId, limitKey, currentValue) {
      const result = await engine.checkLimit(organizationId, limitKey, currentValue);
      if (!result.allowed) {
        throw new ApiError(
          "FORBIDDEN",
          `The organization has reached ${limitKey} (${result.current}/${result.limit}).`,
          { status: 403 }
        );
      }
    },

    getSubscription: resolve,

    async isSubscriptionActive(organizationId) {
      return (await resolve(organizationId)) !== null;
    },
  };

  return engine;
}

function isStatusActive(status: SubscriptionStatus): boolean {
  const normalized = status.toLowerCase();
  return normalized === "active" || normalized === "trial";
}

/** Idempotent plan seeding. It creates missing built-ins but never overwrites admin changes. */
export async function seedDefaultPlans(db: Db): Promise<void> {
  const existing = await db.plans.list();
  const ids = new Set(existing.map((plan) => plan.id));
  for (const plan of DEFAULT_PLANS) {
    const id = `plan_${plan.planType}`;
    if (ids.has(id)) continue;
    await db.plans.create({ id, ...plan });
  }
}
