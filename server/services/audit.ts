/**
 * Tenant/platform audit trail with fail-closed secret scrubbing.
 */

import type { AuditAction, AuditEventRow } from "../../shared/contracts";
import type { Db } from "../db/store";
import { isSensitiveCredentialKey, scrubCredentials } from "../connectors/credentials";
import { redactString } from "../lib/observability";

export interface AuditService {
  record(input: {
    organizationId: string | null;
    action: AuditAction;
    actorId?: string | null;
    actorEmail?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
    ipAddress?: string | null;
  }): Promise<AuditEventRow>;
  listByOrg(organizationId: string, limit?: number): Promise<AuditEventRow[]>;
  listAll(limit?: number): Promise<AuditEventRow[]>;
  countByOrg(organizationId: string): Promise<number>;
}

function safeString(value: string): string {
  return redactString(value).slice(0, 2_000);
}

/** Flatten recursively scrubbed metadata to the primitive-only database contract. */
export function scrubSecrets(obj: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, value] of Object.entries(obj).slice(0, 64)) {
    const key = rawKey.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100);
    if (!key || isSensitiveCredentialKey(key) || value === undefined) continue;
    if (value === null || typeof value === "boolean") {
      result[key] = value;
    } else if (typeof value === "number") {
      result[key] = Number.isFinite(value) ? value : safeString(String(value));
    } else if (typeof value === "string") {
      result[key] = safeString(value);
    } else {
      try {
        const scrubbed = scrubCredentials(value);
        result[key] = safeString(JSON.stringify(scrubbed));
      } catch {
        result[key] = "[unserializable]";
      }
    }
  }
  return result;
}

export function createAuditService(db: Db): AuditService {
  return {
    async record(input): Promise<AuditEventRow> {
      return db.audit.create({
        organizationId: input.organizationId,
        action: input.action,
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        metadata: scrubSecrets(input.metadata ?? {}),
        ipAddress: input.ipAddress ?? null,
      });
    },
    listByOrg: (organizationId, limit) =>
      db.audit.listByOrg(organizationId, Math.min(1_000, Math.max(1, Math.trunc(limit ?? 100)))),
    listAll: (limit) => db.audit.listAll(Math.min(1_000, Math.max(1, Math.trunc(limit ?? 100)))),
    async countByOrg(organizationId): Promise<number> {
      return (await db.audit.listByOrg(organizationId, 1_000)).length;
    },
  };
}
