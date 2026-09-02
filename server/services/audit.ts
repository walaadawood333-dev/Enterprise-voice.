/**
 * Audit Trail Service — Phase 10C
 *
 * Provides structured organization-level audit logging with metadata scrubbing.
 * Never stores passwords, API keys, JWT tokens, provider secrets, or raw credentials.
 */

import type { AuditAction, AuditEventRow } from "../../shared/contracts";
import type { Db } from "../db/store";

/** Sensitive metadata keys that must never be stored in audit records */
const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "secret",
  "api_key",
  "apiKey",
  "token",
  "jwt",
  "bearer",
  "authorization",
  "credential",
  "private_key",
  "privateKey",
]);

export interface AuditService {
  /** Record an audit event */
  record(input: {
    organizationId: string | null;
    action: AuditAction;
    actorId?: string | null;
    actorEmail?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
    ipAddress?: string | null;
  }): Promise<AuditEventRow>;

  /** List audit events for an organization */
  listByOrg(organizationId: string, limit?: number): Promise<AuditEventRow[]>;

  /** List all audit events (platform admin) */
  listAll(limit?: number): Promise<AuditEventRow[]>;

  /** Get audit event count for an organization */
  countByOrg(organizationId: string): Promise<number>;
}

/**
 * Create the audit service.
 */
export function createAuditService(db: Db): AuditService {
  return {
    /**
     * Record an audit event with metadata scrubbing.
     */
    async record(input: {
      organizationId: string | null;
      action: AuditAction;
      actorId?: string | null;
      actorEmail?: string | null;
      metadata?: Record<string, string | number | boolean | null>;
      ipAddress?: string | null;
    }): Promise<AuditEventRow> {
      // Scrub sensitive keys from metadata
      const scrubbedMetadata: Record<string, string | number | boolean | null> = {};
      if (input.metadata) {
        for (const [key, value] of Object.entries(input.metadata)) {
          if (!SENSITIVE_KEYS.has(key) && !key.toLowerCase().includes("secret") && !key.toLowerCase().includes("password")) {
            scrubbedMetadata[key] = value;
          }
        }
      }

      return await db.audit.create({
        organizationId: input.organizationId,
        action: input.action,
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        metadata: scrubbedMetadata,
        ipAddress: input.ipAddress ?? null,
      });
    },

    /**
     * List audit events for an organization (tenant-scoped).
     */
    async listByOrg(organizationId: string, limit?: number): Promise<AuditEventRow[]> {
      return await db.audit.listByOrg(organizationId, limit);
    },

    /**
     * List all audit events (platform admin only).
     */
    async listAll(limit?: number): Promise<AuditEventRow[]> {
      return await db.audit.listAll(limit);
    },

    /**
     * Get audit event count for an organization.
     */
    async countByOrg(organizationId: string): Promise<number> {
      const events = await db.audit.listByOrg(organizationId);
      return events.length;
    },
  };
}

/**
 * Helper to scrub secrets from objects before storing in audit metadata.
 */
export function scrubSecrets(obj: Record<string, any>): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key) || key.toLowerCase().includes("secret") || key.toLowerCase().includes("password")) {
      continue;
    }
    if (value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)) {
      result[key] = JSON.stringify(scrubSecrets(value));
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      result[key] = value;
    }
  }
  return result;
}
