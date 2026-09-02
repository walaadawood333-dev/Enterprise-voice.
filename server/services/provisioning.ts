/**
 * Tenant Provisioning Service — Phase 20
 * 
 * Production-grade tenant provisioning with:
 * - Idempotent provisioning
 * - Subscription/entitlement integration
 * - Default configuration
 * - Audit trail
 * - Failure recovery
 * - Tenant isolation
 */

import type {
  OrganizationRow,
  SubscriptionRow,
  UserRow,
  PlanRow,
  Feature,
  OrganizationLimits,
} from "../../shared/contracts";
import type { Db } from "../db/store";
import type { Logger } from "../lib/logger";
import { ApiError } from "../lib/errors";
import type { EntitlementEngine } from "./entitlements";
import type { AuditService } from "./audit";

/**
 * Provisioning request
 */
export interface ProvisioningRequest {
  name: string;
  slug: string;
  industry?: string;
  timezone?: string;
  planId?: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  initialStatus?: "ACTIVE" | "TRIAL";
}

/**
 * Provisioning result
 */
export interface ProvisioningResult {
  success: boolean;
  organization?: OrganizationRow;
  subscription?: SubscriptionRow;
  admin?: UserRow;
  branding?: any;
  auditLogs?: any[];
  errors?: string[];
}

/**
 * Tenant provisioning service
 */
export interface ProvisioningService {
  /**
   * Provision a new organization (idempotent)
   */
  provisionOrganization(
    request: ProvisioningRequest,
    actorId: string,
    actorEmail: string
  ): Promise<ProvisioningResult>;

  /**
   * Activate organization
   */
  activateOrganization(
    organizationId: string,
    actorId: string,
    actorEmail: string
  ): Promise<OrganizationRow>;

  /**
   * Suspend organization
   */
  suspendOrganization(
    organizationId: string,
    reason: string,
    actorId: string,
    actorEmail: string
  ): Promise<OrganizationRow>;

  /**
   * Archive organization
   */
  archiveOrganization(
    organizationId: string,
    actorId: string,
    actorEmail: string
  ): Promise<OrganizationRow>;
}

/**
 * Create provisioning service
 */
export function createProvisioningService(
  db: Db,
  entitlements: EntitlementEngine,
  audit: AuditService,
  logger: Logger
): ProvisioningService {
  return {
    /**
     * Provision a new organization (idempotent)
     */
    async provisionOrganization(
      request: ProvisioningRequest,
      actorId: string,
      actorEmail: string
    ): Promise<ProvisioningResult> {
      const errors: string[] = [];
      let organization: OrganizationRow | null = null;
      let subscription: SubscriptionRow | null = null;
      let admin: UserRow | null = null;
      let branding: any = null;

      try {
        // Step 1: Check idempotency
        const existingOrg = await db.organizations.findBySlug(request.slug);
        if (existingOrg) {
          return {
            success: true,
            organization: existingOrg,
            subscription: await db.subscriptions.getByOrg(existingOrg.id) ?? undefined,
            admin: (await db.users.listByOrg(existingOrg.id)).find((u) => u.role === "owner") ?? undefined,
            branding: await db.branding.getByOrg(existingOrg.id) ?? undefined,
            auditLogs: await db.audit.listByOrg(existingOrg.id),
          };
        }

        // Step 2: Create organization
        organization = await db.organizations.create({
          id: db.organizations.generateId(),
          name: request.name,
          slug: request.slug,
          industry: request.industry ?? "ENTERPRISE_SERVICES",
          timezone: request.timezone ?? "UTC",
          status: request.initialStatus ?? "TRIAL",
        });

        await audit.record({
          organizationId: organization.id,
          action: "organization.created",
          actorId,
          actorEmail,
          metadata: { name: request.name, slug: request.slug, initialStatus: request.initialStatus ?? "TRIAL" },
        });

        // Step 3: Create subscription
        if (request.planId) {
          const plan = await db.plans.get(request.planId);
          if (!plan) {
            throw new Error(`Plan not found: ${request.planId}`);
          }

          subscription = await db.subscriptions.create({
            id: db.subscriptions.generateId(),
            organizationId: organization.id,
            planId: plan.id,
            status: request.initialStatus === "ACTIVE" ? "ACTIVE" : "TRIAL",
            trialEndsAt: request.initialStatus === "TRIAL" ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() : null,
          });

          await audit.record({
            organizationId: organization.id,
            action: "subscription.created",
            actorId,
            actorEmail,
            metadata: { planId: plan.id, planName: plan.name, status: subscription.status },
          });
        }

        // Step 4: Create admin user
        const passwordHash = await db.users.hashPassword(request.adminPassword);
        admin = await db.users.create({
          id: db.users.generateId(),
          organizationId: organization.id,
          email: request.adminEmail.toLowerCase(),
          name: request.adminName,
          role: "owner",
          status: "ACTIVE",
          passwordHash,
        });

        await audit.record({
          organizationId: organization.id,
          action: "user.created",
          actorId,
          actorEmail,
          metadata: { userId: admin.id, email: admin.email, role: "owner" },
        });

        // Step 5: Apply default branding
        branding = await db.branding.create({
          id: db.branding.generateId(),
          organizationId: organization.id,
          displayName: organization.name,
          primaryColor: "#000000",
          accentColor: "#3b82f6",
          theme: "light",
        });

        logger.info("provisioning.completed", {
          organizationId: organization.id,
          slug: request.slug,
          status: "SUCCESS",
        });

        return {
          success: true,
          organization,
          subscription: subscription ?? undefined,
          admin: admin ?? undefined,
          branding: branding ?? undefined,
          auditLogs: await db.audit.listByOrg(organization.id),
        };
      } catch (error: any) {
        logger.error("provisioning.failed", {
          slug: request.slug,
          error: error.message,
        });

        return {
          success: false,
          errors: [error.message],
        };
      }
    },

    /**
     * Activate organization
     */
    async activateOrganization(
      organizationId: string,
      actorId: string,
      actorEmail: string
    ): Promise<OrganizationRow> {
      const org = await db.organizations.get(organizationId);
      if (!org) {
        throw new ApiError("NOT_FOUND", "Organization not found");
      }

      const updated = await db.organizations.update(organizationId, { status: "ACTIVE" });
      if (!updated) {
        throw new ApiError("INTERNAL_ERROR", "Failed to update organization");
      }

      await audit.record({
        organizationId,
        action: "organization.activated",
        actorId,
        actorEmail,
        metadata: { previousStatus: org.status, newStatus: "ACTIVE" },
      });

      logger.info("organization.activated", { organizationId, actorId });
      return updated;
    },

    /**
     * Suspend organization
     */
    async suspendOrganization(
      organizationId: string,
      reason: string,
      actorId: string,
      actorEmail: string
    ): Promise<OrganizationRow> {
      const org = await db.organizations.get(organizationId);
      if (!org) {
        throw new ApiError("NOT_FOUND", "Organization not found");
      }

      const updated = await db.organizations.update(organizationId, { status: "SUSPENDED" });
      if (!updated) {
        throw new ApiError("INTERNAL_ERROR", "Failed to update organization");
      }

      await audit.record({
        organizationId,
        action: "organization.suspended",
        actorId,
        actorEmail,
        metadata: { previousStatus: org.status, newStatus: "SUSPENDED", reason },
      });

      logger.info("organization.suspended", { organizationId, actorId, reason });
      return updated;
    },

    /**
     * Archive organization
     */
    async archiveOrganization(
      organizationId: string,
      actorId: string,
      actorEmail: string
    ): Promise<OrganizationRow> {
      const org = await db.organizations.get(organizationId);
      if (!org) {
        throw new ApiError("NOT_FOUND", "Organization not found");
      }

      const updated = await db.organizations.update(organizationId, { status: "ARCHIVED" });
      if (!updated) {
        throw new ApiError("INTERNAL_ERROR", "Failed to update organization");
      }

      await audit.record({
        organizationId,
        action: "organization.archived",
        actorId,
        actorEmail,
        metadata: { previousStatus: org.status, newStatus: "ARCHIVED" },
      });

      logger.info("organization.archived", { organizationId, actorId });
      return updated;
    },
  };
}
