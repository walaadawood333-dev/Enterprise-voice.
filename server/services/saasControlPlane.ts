/** Platform-admin commercial control plane. No billing records are created here. */

import {
  FEATURES,
  PLAN_STATUSES,
  PLAN_TYPES,
  SUBSCRIPTION_STATUSES,
  type Feature,
  type OrganizationLimits,
  type PlanRow,
  type PlanStatus,
  type PlanType,
  type SubscriptionStatus,
  type TenantCommercialSummaryDto,
} from "../../shared/contracts";
import type { Db } from "../db/store";
import { newId } from "../db/store";
import { ApiError, notFound } from "../lib/observability";
import type { AuditService } from "./audit";
import type { EntitlementEngine } from "./entitlements";

const LIMIT_KEYS: Array<keyof OrganizationLimits> = [
  "maxUsers",
  "maxAgents",
  "maxMonthlyMinutes",
  "maxCampaigns",
  "maxConnectors",
];

export interface CommercialActor {
  id: string | null;
  email: string | null;
}

export interface SaasControlPlaneService {
  listPlans(): Promise<PlanRow[]>;
  createPlan(input: unknown, actor: CommercialActor): Promise<PlanRow>;
  updatePlan(id: string, input: unknown, actor: CommercialActor): Promise<PlanRow>;
  listSubscriptions(): Promise<Array<Record<string, unknown>>>;
  setSubscription(organizationId: string, input: unknown, actor: CommercialActor): Promise<unknown>;
  getOrganizationEntitlements(organizationId: string): Promise<Record<string, unknown>>;
  setEntitlement(organizationId: string, feature: string, input: unknown, actor: CommercialActor): Promise<unknown>;
  removeEntitlement(organizationId: string, feature: string, actor: CommercialActor): Promise<void>;
  getTenantSummary(organizationId: string): Promise<TenantCommercialSummaryDto>;
}

const object = (input: unknown): Record<string, unknown> =>
  input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};

function requiredName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 80) {
    throw new ApiError("VALIDATION_ERROR", "Plan name must be between 2 and 80 characters.");
  }
  return name;
}

function inferredPlanType(name: string): PlanType {
  const normalized = name.toLowerCase();
  return PLAN_TYPES.find((type) => type !== "custom" && normalized.includes(type)) ?? "custom";
}

function planStatus(value: unknown): PlanStatus {
  if (typeof value !== "string" || !(PLAN_STATUSES as readonly string[]).includes(value)) {
    throw new ApiError("VALIDATION_ERROR", `status must be one of: ${PLAN_STATUSES.join(", ")}.`);
  }
  return value as PlanStatus;
}

function subscriptionStatus(value: unknown): SubscriptionStatus {
  if (typeof value !== "string" || !(SUBSCRIPTION_STATUSES as readonly string[]).includes(value)) {
    throw new ApiError("VALIDATION_ERROR", `status must be one of: ${SUBSCRIPTION_STATUSES.join(", ")}.`);
  }
  return value as SubscriptionStatus;
}

function features(value: unknown): Feature[] {
  if (!Array.isArray(value)) throw new ApiError("VALIDATION_ERROR", "features must be an array.");
  const unique = [...new Set(value)];
  if (unique.some((item) => typeof item !== "string" || !(FEATURES as readonly string[]).includes(item))) {
    throw new ApiError("VALIDATION_ERROR", "features contains an unknown capability.");
  }
  return unique as Feature[];
}

function limits(value: unknown, partial = false): OrganizationLimits {
  const input = object(value);
  const result: Partial<OrganizationLimits> = {};
  for (const key of LIMIT_KEYS) {
    if (input[key] === undefined && partial) continue;
    const number = Number(input[key]);
    if (!Number.isSafeInteger(number) || number < 0) {
      throw new ApiError("VALIDATION_ERROR", `${key} must be a non-negative integer.`);
    }
    result[key] = number;
  }
  return result as OrganizationLimits;
}

function featureKey(value: string): Feature {
  if (!(FEATURES as readonly string[]).includes(value)) {
    throw new ApiError("VALIDATION_ERROR", "Unknown entitlement feature.");
  }
  return value as Feature;
}

const nullableDate = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    throw new ApiError("VALIDATION_ERROR", `${field} must be an ISO date or null.`);
  }
  return new Date(value).toISOString();
};

export function createSaasControlPlaneService(input: {
  db: Db;
  entitlements: EntitlementEngine;
  audit: AuditService;
}): SaasControlPlaneService {
  const { db, entitlements, audit } = input;

  const auditChange = (
    organizationId: string | null,
    action: "PLAN_CREATED" | "PLAN_CHANGED" | "SUBSCRIPTION_CREATED" | "SUBSCRIPTION_CHANGED" | "ENTITLEMENT_CHANGED",
    actor: CommercialActor,
    metadata: Record<string, string | number | boolean | null>
  ) => audit.record({ organizationId, action, actorId: actor.id, actorEmail: actor.email, metadata });

  const subscriptionView = async (subscription: Awaited<ReturnType<Db["subscriptions"]["getByOrg"]>>) => {
    if (!subscription) return null;
    const [organization, plan] = await Promise.all([
      db.organizations.get(subscription.organizationId),
      db.plans.get(subscription.planId),
    ]);
    return {
      ...subscription,
      organizationName: organization?.name ?? "Unknown organization",
      planName: plan?.name ?? "Unknown plan",
      planStatus: plan?.status ?? null,
    };
  };

  return {
    async listPlans() {
      return (await db.plans.list()).sort((a, b) => a.name.localeCompare(b.name));
    },

    async createPlan(raw, actor) {
      const body = object(raw);
      const name = requiredName(body.name);
      if ((await db.plans.list()).some((plan) => plan.name.toLowerCase() === name.toLowerCase())) {
        throw new ApiError("VALIDATION_ERROR", "A plan with this name already exists.", { status: 409 });
      }
      const row = await db.plans.create({
        id: newId("plan"),
        name,
        // Kept as a derived compatibility field in runtime DTOs; it is not commercial plan data.
        planType: inferredPlanType(name),
        status: planStatus(body.status ?? "draft"),
        features: features(body.features),
        limits: limits(body.limits),
      });
      await auditChange(null, "PLAN_CREATED", actor, {
        planId: row.id,
        name: row.name,
        status: row.status,
        features: JSON.stringify(row.features),
        limits: JSON.stringify(row.limits),
      });
      return row;
    },

    async updatePlan(id, raw, actor) {
      const current = await db.plans.get(id);
      if (!current) throw notFound("Plan");
      const body = object(raw);
      const patch: Partial<Pick<PlanRow, "name" | "status" | "features" | "limits">> = {};
      if (body.name !== undefined) patch.name = requiredName(body.name);
      if (body.status !== undefined) patch.status = planStatus(body.status);
      if (body.features !== undefined) patch.features = features(body.features);
      if (body.limits !== undefined) patch.limits = limits(body.limits);
      if (
        patch.name &&
        (await db.plans.list()).some(
          (plan) => plan.id !== id && plan.name.toLowerCase() === patch.name?.toLowerCase()
        )
      ) {
        throw new ApiError("VALIDATION_ERROR", "A plan with this name already exists.", { status: 409 });
      }
      const updated = await db.plans.update(id, patch);
      if (!updated) throw notFound("Plan");
      await auditChange(null, "PLAN_CHANGED", actor, {
        planId: id,
        before: JSON.stringify({ name: current.name, status: current.status, features: current.features, limits: current.limits }),
        after: JSON.stringify({ name: updated.name, status: updated.status, features: updated.features, limits: updated.limits }),
      });
      return updated;
    },

    async listSubscriptions() {
      const rows = await Promise.all((await db.subscriptions.listAll()).map(subscriptionView));
      return rows.filter((row): row is NonNullable<typeof row> => row !== null);
    },

    async setSubscription(organizationId, raw, actor) {
      const organization = await db.organizations.get(organizationId);
      if (!organization) throw notFound("Organization");
      const body = object(raw);
      const planId = typeof body.planId === "string" ? body.planId : "";
      const plan = await db.plans.get(planId);
      if (!plan) throw notFound("Plan");
      if (plan.status !== "active") {
        throw new ApiError("VALIDATION_ERROR", "Only active plans can be assigned to a subscription.", { status: 409 });
      }
      const status = subscriptionStatus(body.status ?? "active");
      const effectiveLimits = body.effectiveLimits == null ? null : limits(body.effectiveLimits, true);
      const trialEndsAt = nullableDate(body.trialEndsAt, "trialEndsAt");
      if (status === "trial" && !trialEndsAt) {
        throw new ApiError("VALIDATION_ERROR", "trialEndsAt is required for a trial subscription.");
      }

      const current = await db.subscriptions.getByOrg(organizationId);
      const row = current
        ? await db.subscriptions.update(current.id, {
            planId,
            status,
            effectiveLimits,
            trialEndsAt,
            cancelledAt: status === "cancelled" ? new Date().toISOString() : null,
          })
        : await db.subscriptions.create({
            organizationId,
            planId,
            status,
            effectiveLimits,
            trialEndsAt,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            cancelledAt: status === "cancelled" ? new Date().toISOString() : null,
          });
      if (!row) throw notFound("Subscription");
      await auditChange(
        organizationId,
        current ? "SUBSCRIPTION_CHANGED" : "SUBSCRIPTION_CREATED",
        actor,
        {
          subscriptionId: row.id,
          previousPlanId: current?.planId ?? null,
          planId,
          previousStatus: current?.status ?? null,
          status,
          effectiveLimits: effectiveLimits ? JSON.stringify(effectiveLimits) : null,
        }
      );
      return (await subscriptionView(row)) ?? row;
    },

    async getOrganizationEntitlements(organizationId) {
      if (!(await db.organizations.get(organizationId))) throw notFound("Organization");
      const [subscription, overrides, capabilities, effectiveLimits] = await Promise.all([
        entitlements.getSubscription(organizationId),
        db.entitlements.listByOrg(organizationId),
        entitlements.getCapabilities(organizationId),
        entitlements.getEffectiveLimits(organizationId),
      ]);
      return {
        organizationId,
        subscription: subscription
          ? { id: subscription.id, status: subscription.status, planId: subscription.plan.id, planName: subscription.plan.name }
          : null,
        overrides,
        capabilities,
        limits: effectiveLimits,
      };
    },

    async setEntitlement(organizationId, rawFeature, raw, actor) {
      if (!(await db.organizations.get(organizationId))) throw notFound("Organization");
      const feature = featureKey(rawFeature);
      const body = object(raw);
      if (typeof body.enabled !== "boolean") {
        throw new ApiError("VALIDATION_ERROR", "enabled must be a boolean.");
      }
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 240) || null : null;
      const previous = await db.entitlements.get(organizationId, feature);
      const row = await db.entitlements.upsert({ organizationId, feature, enabled: body.enabled, reason });
      await auditChange(organizationId, "ENTITLEMENT_CHANGED", actor, {
        feature,
        previousEnabled: previous?.enabled ?? null,
        enabled: row.enabled,
        reason,
      });
      return row;
    },

    async removeEntitlement(organizationId, rawFeature, actor) {
      const feature = featureKey(rawFeature);
      const previous = await db.entitlements.get(organizationId, feature);
      if (!previous) throw notFound("Entitlement override");
      await db.entitlements.remove(organizationId, feature);
      await auditChange(organizationId, "ENTITLEMENT_CHANGED", actor, {
        feature,
        previousEnabled: previous.enabled,
        enabled: null,
        reason: "override_removed",
      });
    },

    async getTenantSummary(organizationId) {
      const [subscription, capabilities, effectiveLimits, users, agents, campaigns, connectors, usage] =
        await Promise.all([
          entitlements.getSubscription(organizationId),
          entitlements.getCapabilities(organizationId),
          entitlements.getEffectiveLimits(organizationId),
          db.users.listByOrg(organizationId),
          db.agents.listByOrg(organizationId),
          db.campaigns.listByOrg(organizationId),
          db.connectors.listByOrg(organizationId),
          db.usage.listByOrg(organizationId),
        ]);
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const monthlySeconds = usage
        .filter((event) => event.eventType === "audio_seconds" && new Date(event.createdAt) >= monthStart)
        .reduce((total, event) => total + event.quantity, 0);
      return {
        subscription: subscription
          ? {
              id: subscription.id,
              organizationId,
              planId: subscription.plan.id,
              planName: subscription.plan.name,
              planType: subscription.plan.planType,
              status: subscription.status,
              entitlements: { features: subscription.plan.features, limits: subscription.plan.limits },
              effectiveLimits,
              trialEndsAt: subscription.trialEndsAt,
              startedAt: subscription.startedAt,
              createdAt: subscription.createdAt,
              updatedAt: subscription.updatedAt,
            }
          : null,
        capabilities,
        limits: effectiveLimits,
        usage: {
          users: users.length,
          agents: agents.length,
          monthlyMinutes: Math.round((monthlySeconds / 60) * 10) / 10,
          campaigns: campaigns.length,
          connectors: connectors.length,
        },
        billing: { status: "NOT_CONFIGURED", provider: null },
      };
    },
  };
}
