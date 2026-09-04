/**
 * Phase 16 — Centralized Authorization Service
 *
 * Provides unified permission checking across all modules with:
 * - Granular role hierarchy
 * - Permission matrix
 * - Resource-level authorization
 * - Tenant boundary enforcement
 */

import type { OrgRole, PlatformRole } from "../../shared/contracts";
import type { Db } from "../db/store";
import type { Logger } from "../lib/observability";
import { ApiError } from "../lib/observability";

/**
 * Permission actions that can be checked
 */
export type PermissionAction =
  // Voice/Audio
  | "voice.session.create"
  | "voice.session.read"
  | "voice.session.update"
  | "voice.session.delete"
  | "voice.session.end"
  | "voice.message.create"
  | "voice.message.read"

  // Telephony
  | "telephony.call.initiate"
  | "telephony.call.read"
  | "telephony.call.end"
  | "telephony.call.assign"
  | "telephony.webhook.receive"
  | "telephony.provider.configure"

  // Campaigns
  | "campaign.create"
  | "campaign.read"
  | "campaign.update"
  | "campaign.delete"
  | "campaign.start"
  | "campaign.pause"
  | "campaign.resume"

  // Agents
  | "agent.create"
  | "agent.read"
  | "agent.update"
  | "agent.delete"
  | "agent.test"

  // Users
  | "user.create"
  | "user.read"
  | "user.update"
  | "user.delete"
  | "user.invite"

  // Connectors
  | "connector.create"
  | "connector.read"
  | "connector.update"
  | "connector.delete"
  | "connector.configure"
  | "connector.sync.trigger"
  | "connector.mapping.manage"

  // Compliance
  | "compliance.policy.create"
  | "compliance.policy.read"
  | "compliance.policy.update"
  | "compliance.policy.delete"
  | "compliance.evaluation.run"
  | "compliance.evaluation.read"

  // DNC
  | "dnc.record.create"
  | "dnc.record.read"
  | "dnc.record.delete"
  | "dnc.check"

  // Analytics & Reports
  | "analytics.read"
  | "report.generate"
  | "report.export"

  // Audit
  | "audit.read"

  // Organization
  | "organization.read"
  | "organization.update"
  | "organization.settings.manage"

  // Billing (Phase 15)
  | "billing.invoice.read"
  | "billing.payment.read"
  | "billing.subscription.manage"

  // QA (Phase 10D)
  | "qa.template.create"
  | "qa.template.read"
  | "qa.template.update"
  | "qa.template.delete"
  | "qa.evaluation.create"
  | "qa.evaluation.read"
  | "qa.finding.read";

/**
 * Enhanced role hierarchy with granular permissions
 * Maps each role to its allowed actions
 */
const ROLE_PERMISSIONS: Record<OrgRole, PermissionAction[]> = {
  owner: [
    // Full access to everything
    "voice.session.create", "voice.session.read", "voice.session.update", "voice.session.delete", "voice.session.end",
    "voice.message.create", "voice.message.read",
    "telephony.call.initiate", "telephony.call.read", "telephony.call.end", "telephony.call.assign",
    "telephony.webhook.receive", "telephony.provider.configure",
    "campaign.create", "campaign.read", "campaign.update", "campaign.delete", "campaign.start", "campaign.pause", "campaign.resume",
    "agent.create", "agent.read", "agent.update", "agent.delete", "agent.test",
    "user.create", "user.read", "user.update", "user.delete", "user.invite",
    "connector.create", "connector.read", "connector.update", "connector.delete", "connector.configure",
    "connector.sync.trigger", "connector.mapping.manage",
    "compliance.policy.create", "compliance.policy.read", "compliance.policy.update", "compliance.policy.delete",
    "compliance.evaluation.run", "compliance.evaluation.read",
    "dnc.record.create", "dnc.record.read", "dnc.record.delete", "dnc.check",
    "analytics.read", "report.generate", "report.export",
    "audit.read",
    "organization.read", "organization.update", "organization.settings.manage",
    "billing.invoice.read", "billing.payment.read", "billing.subscription.manage",
    "qa.template.create", "qa.template.read", "qa.template.update", "qa.template.delete",
    "qa.evaluation.create", "qa.evaluation.read", "qa.finding.read",
  ],
  admin: [
    // Nearly full access, no org settings
    "voice.session.create", "voice.session.read", "voice.session.update", "voice.session.delete", "voice.session.end",
    "voice.message.create", "voice.message.read",
    "telephony.call.initiate", "telephony.call.read", "telephony.call.end", "telephony.call.assign",
    "telephony.webhook.receive", "telephony.provider.configure",
    "campaign.create", "campaign.read", "campaign.update", "campaign.delete", "campaign.start", "campaign.pause", "campaign.resume",
    "agent.create", "agent.read", "agent.update", "agent.delete", "agent.test",
    "user.create", "user.read", "user.update", "user.delete", "user.invite",
    "connector.create", "connector.read", "connector.update", "connector.delete", "connector.configure",
    "connector.sync.trigger", "connector.mapping.manage",
    "compliance.policy.create", "compliance.policy.read", "compliance.policy.update", "compliance.policy.delete",
    "compliance.evaluation.run", "compliance.evaluation.read",
    "dnc.record.create", "dnc.record.read", "dnc.record.delete", "dnc.check",
    "analytics.read", "report.generate", "report.export",
    "audit.read",
    "organization.read",
    "billing.invoice.read", "billing.payment.read",
    "qa.template.create", "qa.template.read", "qa.template.update", "qa.template.delete",
    "qa.evaluation.create", "qa.evaluation.read", "qa.finding.read",
  ],
  manager: [
    // Operational access, limited user/admin functions
    "voice.session.create", "voice.session.read", "voice.session.update", "voice.session.end",
    "voice.message.create", "voice.message.read",
    "telephony.call.initiate", "telephony.call.read", "telephony.call.end", "telephony.call.assign",
    "campaign.create", "campaign.read", "campaign.update", "campaign.start", "campaign.pause", "campaign.resume",
    "agent.read", "agent.test",
    "user.read",
    "connector.read", "connector.sync.trigger",
    "compliance.policy.read", "compliance.evaluation.run", "compliance.evaluation.read",
    "dnc.record.create", "dnc.record.read", "dnc.check",
    "analytics.read", "report.generate", "report.export",
    "organization.read",
    "billing.invoice.read", "billing.payment.read",
    "qa.template.read", "qa.evaluation.create", "qa.evaluation.read", "qa.finding.read",
  ],
  operator: [
    // Day-to-day operations only
    "voice.session.create", "voice.session.read", "voice.session.update", "voice.session.end",
    "voice.message.create", "voice.message.read",
    "telephony.call.initiate", "telephony.call.read", "telephony.call.end", "telephony.call.assign",
    "campaign.read", "campaign.start", "campaign.pause", "campaign.resume",
    "agent.read",
    "user.read",
    "connector.read",
    "compliance.policy.read", "compliance.evaluation.read",
    "dnc.record.read", "dnc.check",
    "analytics.read",
    "organization.read",
    "billing.invoice.read",
    "qa.template.read", "qa.evaluation.read",
  ],
  viewer: [
    // Read-only access
    "voice.session.read",
    "voice.message.read",
    "telephony.call.read",
    "campaign.read",
    "agent.read",
    "user.read",
    "connector.read",
    "compliance.policy.read", "compliance.evaluation.read",
    "dnc.record.read",
    "analytics.read",
    "organization.read",
    "billing.invoice.read",
    "qa.template.read", "qa.evaluation.read", "qa.finding.read",
  ],
};

/**
 * Platform role permissions (cross-tenant)
 */
const PLATFORM_PERMISSIONS: Record<PlatformRole, string[]> = {
  super_admin: ["platform.*"], // Full platform access
  platform_admin: ["platform.orgs.manage", "platform.users.manage", "platform.billing.manage"],
  platform_operator: ["platform.orgs.read", "platform.users.read", "platform.audit.read"],
};

export interface AuthorizationService {
  /**
   * Check if a user has permission to perform an action
   */
  hasPermission(
    role: OrgRole,
    authMode: string,
    action: PermissionAction
  ): boolean;

  /**
   * Require permission or throw FORBIDDEN
   */
  requirePermission(
    role: OrgRole,
    authMode: string,
    action: PermissionAction
  ): void;

  /**
   * Check if a platform role has permission
   */
  hasPlatformPermission(
    platformRole: PlatformRole | undefined,
    permission: string
  ): boolean;

  /**
   * Require platform permission or throw FORBIDDEN
   */
  requirePlatformPermission(
    platformRole: PlatformRole | undefined,
    permission: string
  ): void;

  /**
   * Verify tenant isolation - ensure user can only access their own org's resources
   */
  verifyTenantIsolation(
    userId: string,
    userOrgId: string,
    resourceOrgId: string
  ): void;

  /**
   * Get all permissions for a role
   */
  getRolePermissions(role: OrgRole): PermissionAction[];

  /**
   * Check if role has sufficient rank for an action
   */
  hasMinimumRole(role: OrgRole, minimumRole: OrgRole): boolean;
}

export function createAuthorizationService(deps: {
  db: Db;
  logger: Logger;
}): AuthorizationService {
  const { logger } = deps;

  const ROLE_RANK: Record<OrgRole, number> = {
    owner: 5,
    admin: 4,
    manager: 3,
    operator: 2,
    viewer: 1,
  };

  return {
    hasPermission(role, _authMode, action) {
      // Demo sessions use the same permission matrix as production sessions.
      const permissions = ROLE_PERMISSIONS[role];
      if (!permissions) {
        logger.warn("auth_unknown_role", { role });
        return false;
      }

      return permissions.includes(action);
    },

    requirePermission(role, authMode, action) {
      if (!this.hasPermission(role, authMode, action)) {
        logger.warn("auth_permission_denied", { role, action, authMode });
        throw new ApiError(
          "FORBIDDEN",
          "Your role does not have permission to perform this action."
        );
      }
    },

    hasPlatformPermission(platformRole, permission) {
      if (!platformRole) return false;

      const permissions = PLATFORM_PERMISSIONS[platformRole];
      if (!permissions) return false;

      // Check for wildcard
      if (permissions.includes("platform.*")) return true;

      return permissions.includes(permission);
    },

    requirePlatformPermission(platformRole, permission) {
      if (!this.hasPlatformPermission(platformRole, permission)) {
        logger.warn("auth_platform_permission_denied", { platformRole, permission });
        throw new ApiError(
          "FORBIDDEN",
          "Platform administrator access required."
        );
      }
    },

    verifyTenantIsolation(userId, userOrgId, resourceOrgId) {
      if (userOrgId !== resourceOrgId) {
        logger.error("auth_tenant_isolation_violation", {
          userId,
          userOrgId,
          resourceOrgId,
        });
        throw new ApiError(
          "FORBIDDEN",
          "You cannot access resources from another organization."
        );
      }
    },

    getRolePermissions(role) {
      return ROLE_PERMISSIONS[role] || [];
    },

    hasMinimumRole(role, minimumRole) {
      const roleRank = ROLE_RANK[role] || 0;
      const minRank = ROLE_RANK[minimumRole] || 0;
      return roleRank >= minRank;
    },
  };
}

/**
 * Resource-level authorization helper
 * Checks if user can access a specific resource
 */
export async function authorizeResource(
  authz: AuthorizationService,
  db: Db,
  userId: string,
  userOrgId: string,
  role: OrgRole,
  authMode: string,
  resourceType: string,
  resourceId: string,
  requiredAction: PermissionAction
): Promise<void> {
  // First check role permissions
  authz.requirePermission(role, authMode, requiredAction);

  // Then verify tenant isolation
  let resourceOrgId: string | undefined;

  switch (resourceType) {
    case "agent":
      const agent = await db.agents.get(resourceId, userOrgId);
      resourceOrgId = agent?.organizationId;
      break;
    case "campaign":
      const campaign = await db.campaigns.get(resourceId, userOrgId);
      resourceOrgId = campaign?.organizationId;
      break;
    case "voice_session":
      const session = await db.sessions.get(resourceId, userOrgId);
      resourceOrgId = session?.organizationId;
      break;
    case "call":
      const call = await db.calls.get(resourceId, userOrgId);
      resourceOrgId = call?.organizationId;
      break;
    case "connector":
      const connector = await db.connectors.get(resourceId, userOrgId);
      resourceOrgId = connector?.organizationId;
      break;
    case "compliance_policy":
      const policy = await db.compliancePolicies.get(resourceId, userOrgId);
      resourceOrgId = policy?.organizationId;
      break;
    case "dnc_record":
      const record = await db.dncRecords.get(resourceId, userOrgId);
      resourceOrgId = record?.organizationId;
      break;
    default:
      // Unknown resource type - deny by default
      throw new ApiError("FORBIDDEN", "Unknown resource type.");
  }

  if (!resourceOrgId) {
    throw new ApiError("NOT_FOUND", "Resource not found.");
  }

  authz.verifyTenantIsolation(userId, userOrgId, resourceOrgId);
}
