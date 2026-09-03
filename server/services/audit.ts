/**
 * Tenant/platform audit trail with fail-closed secret scrubbing.
 */

import type { AuditAction, AuditEventRow } from "../../shared/contracts";
import type { Db } from "../db/store";
import { isSensitiveCredentialKey, scrubCredentials } from "../connectors/credentials";

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
  return value
    .replace(/authorization:\s*bearer\s+\S+/gi, "authorization: [REDACTED]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)=)[^\s&]+/gi, "$1[REDACTED]");
}

/** Flatten recursively scrubbed metadata to the primitive-only database contract. */
export function scrubSecrets(obj: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveCredentialKey(key) || value === undefined) continue;
    if (value === null || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    } else if (typeof value === "string") {
      result[key] = safeString(value);
    } else {
      const scrubbed = scrubCredentials(value);
      result[key] = safeString(JSON.stringify(scrubbed));
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
    listByOrg: (organizationId, limit) => db.audit.listByOrg(organizationId, limit),
    listAll: (limit) => db.audit.listAll(limit),
    async countByOrg(organizationId): Promise<number> {
      return (await db.audit.listByOrg(organizationId)).length;
    },
  };
}
