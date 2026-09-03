/** Authenticated tenant-branding resolution and mutation boundary. */

import type {
  OrganizationBrandingDto,
  OrganizationBrandingRow,
  OrganizationRow,
} from "../../shared/contracts";
import type { Db } from "../db/store";
import { newId } from "../db/store";
import { ApiError, notFound } from "../lib/observability";
import type { AuditService } from "./audit";
import {
  createBrandingSecurityService,
  type BrandingSecurityService,
} from "./brandingSecurity";
import type { EntitlementEngine } from "./entitlements";

export interface BrandingActor {
  id: string | null;
  email: string | null;
}

/**
 * Asset-delivery abstraction. The default accepts pre-hosted HTTPS references only. A future object
 * store can implement this boundary without pretending an upload occurred in this service.
 */
export interface BrandingAssetStore {
  readonly mode: "external_url";
  readonly uploads: "not_configured";
  normalizeExternalUrl(value: string | null): string | null;
}

export interface TenantBrandingService {
  getForOrganization(organizationId: string): Promise<OrganizationBrandingDto>;
  updateForOrganization(
    organizationId: string,
    input: unknown,
    actor: BrandingActor
  ): Promise<OrganizationBrandingDto>;
}

const DEFAULT_PRIMARY = "#000000";
const DEFAULT_ACCENT = "#3b82f6";
const EDITABLE_FIELDS = new Set([
  "displayName",
  "logoUrl",
  "faviconUrl",
  "primaryColor",
  "accentColor",
  "theme",
]);

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function createExternalUrlBrandingAssetStore(
  security: BrandingSecurityService = createBrandingSecurityService()
): BrandingAssetStore {
  return {
    mode: "external_url",
    uploads: "not_configured",
    normalizeExternalUrl(value) {
      if (value == null || value.trim() === "") return null;
      const normalized = value.trim();
      if (!security.validateUrl(normalized)) {
        throw new ApiError(
          "VALIDATION_ERROR",
          "Brand assets must use a valid HTTPS URL. File uploads are not configured.",
          { fields: { assetUrl: "Use a valid HTTPS URL." } }
        );
      }
      return new URL(normalized).toString();
    },
  };
}

export function fallbackBranding(
  organization: Pick<OrganizationRow, "name">,
  security: BrandingSecurityService = createBrandingSecurityService()
): OrganizationBrandingDto {
  return {
    displayName: security.sanitizeText(organization.name, 100) || "CenterAI Workspace",
    logoUrl: null,
    faviconUrl: null,
    primaryColor: DEFAULT_PRIMARY,
    accentColor: DEFAULT_ACCENT,
    theme: "light",
    source: "fallback",
    assetStorage: { mode: "external_url", uploads: "not_configured" },
    customDomain: { status: "not_configured", hostname: null },
    loginBranding: { status: "not_configured" },
  };
}

export function resolveBrandingRow(
  organization: Pick<OrganizationRow, "name">,
  row: OrganizationBrandingRow | undefined,
  security: BrandingSecurityService = createBrandingSecurityService()
): OrganizationBrandingDto {
  if (!row) return fallbackBranding(organization, security);

  // Read-time sanitization protects the shell from legacy rows written before this boundary existed.
  const sanitized = security.sanitizeBranding({
    displayName: row.displayName ?? "",
    logoUrl: row.logoUrl ?? "",
    faviconUrl: row.faviconUrl ?? "",
    primaryColor: row.primaryColor,
    accentColor: row.accentColor,
    theme: row.theme,
  });
  const displayName = sanitized.displayName?.trim() || organization.name;
  return {
    displayName,
    logoUrl: sanitized.logoUrl || null,
    faviconUrl: sanitized.faviconUrl || null,
    primaryColor: security.normalizeColor(sanitized.primaryColor ?? "") ?? DEFAULT_PRIMARY,
    accentColor: security.normalizeColor(sanitized.accentColor ?? "") ?? DEFAULT_ACCENT,
    theme: sanitized.theme ?? "light",
    source: "tenant",
    assetStorage: { mode: "external_url", uploads: "not_configured" },
    customDomain: { status: "not_configured", hostname: null },
    loginBranding: { status: "not_configured" },
  };
}

export function createTenantBrandingService(input: {
  db: Db;
  entitlements: EntitlementEngine;
  audit: AuditService;
  security?: BrandingSecurityService;
  assetStore?: BrandingAssetStore;
}): TenantBrandingService {
  const { db, entitlements, audit } = input;
  const security = input.security ?? createBrandingSecurityService();
  const assetStore = input.assetStore ?? createExternalUrlBrandingAssetStore(security);

  return {
    async getForOrganization(organizationId) {
      const organization = await db.organizations.get(organizationId);
      if (!organization) throw notFound("Organization");
      if (!(await entitlements.hasFeature(organizationId, "custom_branding"))) {
        return fallbackBranding(organization, security);
      }
      return resolveBrandingRow(organization, await db.branding.getByOrg(organizationId), security);
    },

    async updateForOrganization(organizationId, raw, actor) {
      const organization = await db.organizations.get(organizationId);
      if (!organization) throw notFound("Organization");
      await entitlements.assertFeature(organizationId, "custom_branding");

      const body = asObject(raw);
      const unknown = Object.keys(body).filter((key) => !EDITABLE_FIELDS.has(key));
      if (unknown.length) {
        throw new ApiError("VALIDATION_ERROR", "Branding contains unsupported fields.", {
          fields: Object.fromEntries(unknown.map((key) => [key, "This field is not allowed."])),
        });
      }
      const current = await db.branding.getByOrg(organizationId);
      const base = current ?? {
        id: newId("brand"),
        organizationId,
        displayName: null,
        logoUrl: null,
        faviconUrl: null,
        primaryColor: DEFAULT_PRIMARY,
        accentColor: DEFAULT_ACCENT,
        theme: "light" as const,
      };

      const stringOrNull = (key: string): string | null | undefined => {
        const value = body[key];
        if (value === undefined) return undefined;
        if (value === null) return null;
        if (typeof value !== "string") {
          throw new ApiError("VALIDATION_ERROR", `${key} must be a string or null.`, {
            fields: { [key]: "Use text or null." },
          });
        }
        return value;
      };

      const displayInput = stringOrNull("displayName");
      const displayName =
        displayInput === undefined
          ? base.displayName
          : displayInput === null || displayInput.trim() === ""
            ? null
            : security.sanitizeText(displayInput, 100) || null;
      const logoInput = stringOrNull("logoUrl");
      const faviconInput = stringOrNull("faviconUrl");
      const logoUrl = logoInput === undefined ? base.logoUrl : assetStore.normalizeExternalUrl(logoInput);
      const faviconUrl =
        faviconInput === undefined ? base.faviconUrl : assetStore.normalizeExternalUrl(faviconInput);

      const color = (key: "primaryColor" | "accentColor", fallback: string): string => {
        if (body[key] === undefined) return security.normalizeColor(base[key]) ?? fallback;
        if (typeof body[key] !== "string") {
          throw new ApiError("VALIDATION_ERROR", `${key} must be a hexadecimal color.`);
        }
        const normalized = security.normalizeColor(body[key]);
        if (!normalized) {
          throw new ApiError("VALIDATION_ERROR", `${key} must be a safe hexadecimal color.`, {
            fields: { [key]: "Use #RRGGBB." },
          });
        }
        return normalized;
      };

      const rawTheme = body.theme;
      if (rawTheme !== undefined && !["light", "dark", "auto"].includes(String(rawTheme))) {
        throw new ApiError("VALIDATION_ERROR", "theme must be light, dark, or auto.", {
          fields: { theme: "Choose light, dark, or auto." },
        });
      }

      await db.branding.upsert({
        id: base.id,
        organizationId,
        displayName,
        logoUrl,
        faviconUrl,
        primaryColor: color("primaryColor", DEFAULT_PRIMARY),
        accentColor: color("accentColor", DEFAULT_ACCENT),
        theme: (rawTheme === undefined ? base.theme : rawTheme) as "light" | "dark" | "auto",
      });
      await audit.record({
        organizationId,
        actorId: actor.id,
        actorEmail: actor.email,
        action: "BRANDING_UPDATED",
        metadata: {
          changedFields: Object.keys(body).sort().join(","),
          assetMode: assetStore.mode,
          uploads: assetStore.uploads,
        },
      });
      return resolveBrandingRow(
        organization,
        await db.branding.getByOrg(organizationId),
        security
      );
    },
  };
}
