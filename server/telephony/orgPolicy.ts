/**
 * Organization Telephony Provider Policy.
 *
 * Manages per-organization provider preferences stored in the database.
 * The organization table stores references (provider name) — NEVER plaintext secrets.
 * Secrets live in environment variables or a future secrets vault.
 *
 * Tenant isolation:
 *   - Every read/write is scoped by organizationId
 *   - An organization can only see and modify its own provider configuration
 *   - Cross-organization access is rejected at the database layer
 */

import type {
  OrganizationTelephonyProviderDto,
  OrganizationTelephonyProviderRow,
  ProviderRegistryState,
} from "../../shared/contracts";
import type { Db } from "../db/store";
import { newId } from "../db/store";
import { notFound, type Logger } from "../lib/observability";

export interface OrgProviderInput {
  organizationId: string;
  provider: string;
  enabled?: boolean;
  isDefault?: boolean;
  configurationReference?: string | null;
}

export function createOrgProviderPolicy(db: Db, logger: Logger) {
  /** Tenant-scoped lookup — another org's id reads as missing. */
  const getOwned = async (
    id: string,
    organizationId: string
  ): Promise<OrganizationTelephonyProviderRow | undefined> => {
    return db.orgProviders.get(id, organizationId);
  };

  const toDto = (row: OrganizationTelephonyProviderRow): OrganizationTelephonyProviderDto => ({
    id: row.id,
    organizationId: row.organizationId,
    provider: row.provider,
    enabled: row.enabled,
    isDefault: row.isDefault,
    hasConfiguration: row.configurationReference !== null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  return {
    /**
     * List provider configurations for an organization.
     * Tenant-scoped — only this organization's rows.
     */
    async list(organizationId: string): Promise<OrganizationTelephonyProviderDto[]> {
      const rows = await db.orgProviders.listByOrg(organizationId);
      return rows.map(toDto);
    },

    /**
     * Get a specific provider configuration for an organization.
     * Tenant-scoped — cross-tenant access returns not found.
     */
    async get(
      organizationId: string,
      providerId: string
    ): Promise<OrganizationTelephonyProviderDto> {
      const row = await getOwned(providerId, organizationId);
      if (!row) throw notFound("Organization provider configuration");
      return toDto(row);
    },

    /**
     * Get the organization's default provider configuration.
     * Returns null if no default is set.
     */
    async getDefault(organizationId: string): Promise<OrganizationTelephonyProviderDto | null> {
      const rows = await db.orgProviders.listByOrg(organizationId);
      const defaultRow = rows.find((r) => r.isDefault && r.enabled);
      return defaultRow ? toDto(defaultRow) : null;
    },

    /**
     * Create or update a provider configuration for an organization.
     * Does NOT store secrets — only configuration references.
     */
    async upsert(input: OrgProviderInput): Promise<OrganizationTelephonyProviderDto> {
      // Check if this provider is already configured for this org.
      const existing = await db.orgProviders.findByOrgAndProvider(
        input.organizationId,
        input.provider
      );

      if (existing) {
        // Update existing.
        const updated = await db.orgProviders.update(existing.id, input.organizationId, {
          enabled: input.enabled ?? existing.enabled,
          isDefault: input.isDefault ?? existing.isDefault,
          configurationReference:
            input.configurationReference !== undefined
              ? input.configurationReference
              : existing.configurationReference,
          status: "configured",
        });
        logger.info("org_provider_updated", {
          organizationId: input.organizationId,
          provider: input.provider,
        });
        return toDto(updated!);
      }

      // Create new.
      const row = await db.orgProviders.create({
        id: newId("otp"),
        organizationId: input.organizationId,
        provider: input.provider,
        enabled: input.enabled ?? true,
        isDefault: input.isDefault ?? false,
        configurationReference: input.configurationReference ?? null,
        status: "registered",
      });

      // Enforce single default.
      if (row.isDefault) {
        const allRows = await db.orgProviders.listByOrg(input.organizationId);
        for (const r of allRows) {
          if (r.id !== row.id && r.isDefault) {
            await db.orgProviders.update(r.id, input.organizationId, { isDefault: false });
          }
        }
      }

      logger.info("org_provider_created", {
        organizationId: input.organizationId,
        provider: input.provider,
      });
      return toDto(row);
    },

    /**
     * Remove a provider configuration from an organization.
     * Tenant-scoped.
     */
    async remove(organizationId: string, providerConfigId: string): Promise<boolean> {
      const row = await getOwned(providerConfigId, organizationId);
      if (!row) return false;
      const result = await db.orgProviders.remove(providerConfigId, organizationId);
      if (result) {
        logger.info("org_provider_removed", {
          organizationId,
          providerConfigId,
        });
      }
      return result;
    },

    /**
     * Set a provider as the organization's default.
     * Clears the default flag from all other providers for this org.
     */
    async setDefault(
      organizationId: string,
      providerConfigId: string
    ): Promise<OrganizationTelephonyProviderDto> {
      const row = await getOwned(providerConfigId, organizationId);
      if (!row) throw notFound("Organization provider configuration");

      // Clear existing default.
      const allRows = await db.orgProviders.listByOrg(organizationId);
      for (const r of allRows) {
        if (r.isDefault && r.id !== providerConfigId) {
          await db.orgProviders.update(r.id, organizationId, { isDefault: false });
        }
      }

      const updated = await db.orgProviders.update(providerConfigId, organizationId, {
        isDefault: true,
      });
      return toDto(updated!);
    },
  };
}

export type OrgProviderPolicy = ReturnType<typeof createOrgProviderPolicy>;
