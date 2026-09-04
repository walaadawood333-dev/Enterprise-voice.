/**
 * Workspace Bootstrap Service — Phase 10A
 *
 * Central API for initializing the customer workspace.
 * Returns only the information required by the authenticated user's organization.
 * NEVER exposes secrets, provider credentials, or platform admin data.
 */

import type {
  Feature,
  OrganizationBrandingDto,
  OrganizationLimits,
  OrganizationRow,
  SubscriptionDto,
  UserRow,
  WorkspaceBootstrapDto,
} from "../../shared/contracts";
import type { Db } from "../db/store";
import type { EntitlementEngine } from "./entitlements";
import { resolveBrandingRow } from "./tenantBranding";

export interface WorkspaceBootstrapService {
  /**
   * Get the complete workspace bootstrap for an authenticated user.
   * This is the single source of truth for workspace initialization.
   */
  getBootstrap(
    user: UserRow,
    organization: OrganizationRow
  ): Promise<WorkspaceBootstrapDto>;
}

/**
 * Create the workspace bootstrap service.
 */
export function createWorkspaceBootstrapService(
  db: Db,
  entitlements: EntitlementEngine
): WorkspaceBootstrapService {
  return {
    async getBootstrap(
      user: UserRow,
      organization: OrganizationRow
    ): Promise<WorkspaceBootstrapDto> {
      const organizationId = organization.id;

      // Get subscription and plan
      const subscriptionData = await entitlements.getSubscription(organizationId);

      // Build subscription DTO
      const subscription: SubscriptionDto | null = subscriptionData
        ? {
            id: subscriptionData.id,
            organizationId: subscriptionData.organizationId,
            planId: subscriptionData.plan.id,
            planName: subscriptionData.plan.name,
            planType: subscriptionData.plan.planType,
            status: subscriptionData.status,
            entitlements: {
              features: subscriptionData.plan.features,
              limits: subscriptionData.plan.limits,
            },
            effectiveLimits: await entitlements.getEffectiveLimits(organizationId),
            trialEndsAt: subscriptionData.trialEndsAt,
            startedAt: subscriptionData.startedAt,
            createdAt: subscriptionData.createdAt,
            updatedAt: subscriptionData.updatedAt,
          }
        : null;

      // Get enabled features
      const enabledFeatures: Feature[] = await entitlements.getEnabledFeatures(organizationId);

      // Get effective limits
      const limits: OrganizationLimits = await entitlements.getEffectiveLimits(organizationId);

      // Branding is resolved only after the authenticated organization is known. Read-time
      // sanitization also protects the shell from legacy rows.
      const brandingRow = enabledFeatures.includes("custom_branding")
        ? await db.branding.getByOrg(organizationId)
        : undefined;
      const branding: OrganizationBrandingDto = resolveBrandingRow(organization, brandingRow);

      // Build enabled modules based on features
      const enabledModules = deriveEnabledModules(enabledFeatures);

      // Build permissions based on role
      const permissions = derivePermissions(user.role);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as any,
          isPlatformAdmin: isPlatformRole(user.role),
        },
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          status: organization.status,
          branding,
        },
        subscription,
        entitlements: enabledFeatures,
        permissions,
        limits,
        enabledModules,
      };
    },
  };
}

/**
 * Derive enabled modules from feature entitlements.
 * Modules are high-level UI sections that may depend on multiple features.
 */
function deriveEnabledModules(features: Feature[]): string[] {
  const modules: string[] = ["overview"];

  // AI Agents module
  if (features.includes("ai_agents")) {
    modules.push("agents");
  }

  // Calls module
  if (
    features.includes("voice_calls") ||
    features.includes("inbound_calls") ||
    features.includes("outbound_calls")
  ) {
    modules.push("calls");
  }

  // Campaigns module
  if (features.includes("campaigns")) {
    modules.push("campaigns");
  }

  // Analytics module
  if (features.includes("analytics")) {
    modules.push("analytics");
  }

  // Reporting module
  if (features.includes("reporting")) {
    modules.push("reporting");
  }

  // Data Connectors module
  if (features.includes("data_connectors")) {
    modules.push("connectors");
  }

  // Knowledge Base module
  if (features.includes("knowledge_base")) {
    modules.push("knowledge");
  }

  // Compliance module
  if (features.includes("compliance")) {
    modules.push("compliance");
  }

  // DNC module
  if (features.includes("dnc_management")) {
    modules.push("dnc");
  }

  // QA Evaluation module
  if (features.includes("qa_evaluation")) {
    modules.push("qa");
  }

  // Integrations module
  if (features.includes("custom_integrations") || features.includes("api_access")) {
    modules.push("integrations");
  }

  // Settings module (always available)
  modules.push("settings");

  return modules;
}

/**
 * Derive permissions from user role.
 */
function derivePermissions(role: string): string[] {
  const permissions: string[] = [];

  // Base permissions for all roles
  permissions.push("view_own_profile");
  permissions.push("view_organization");

  const roleRank: Record<string, number> = {
    viewer: 1,
    operator: 2,
    manager: 3,
    admin: 4,
    owner: 5,
  };
  const rank = roleRank[role] ?? 0;
  if (rank >= 5) {
    permissions.push(
      "manage_organization",
      "manage_subscription",
      "manage_billing",
      "manage_branding",
      "view_audit_log"
    );
  }
  if (rank >= 4) permissions.push("manage_users", "manage_integrations");
  if (rank >= 3) permissions.push("manage_agents", "create_campaigns", "view_analytics");
  if (rank >= 2) permissions.push("manage_calls", "view_sessions");
  if (rank >= 1) permissions.push("view_agents", "view_sessions", "view_analytics");

  return permissions;
}

/**
 * Check if a role is a platform admin role.
 */
function isPlatformRole(role: string): boolean {
  return ["super_admin", "platform_admin", "platform_operator"].includes(role);
}
