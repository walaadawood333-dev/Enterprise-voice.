/**
 * Postgres repository — the production implementation of the same async `Db` contract the
 * in-memory driver satisfies. Injected by the Node/serverless adapters only:
 *
 *   const app = createApp({ db: await createPrismaDb() })
 *
 * Isolation: every read and write composes `organizationId` into the Prisma `where`. A row that
 * belongs to another tenant reads as `null`, which maps to 404 — never 403, so the API cannot be
 * used to probe which ids exist elsewhere.
 */

import type {
  AgentRow,
  CallDirection,
  CallEventRow,
  CallEventType,
  CallRow,
  CallStatus,
  MessageRow,
  OrganizationRow,
  OrgRole,
  UserCredential,
  UserRow,
  UsageEventRow,
  VoiceSessionRow,
} from "../../../shared/contracts";
import { loadPrismaClient, type PrismaClientLike, type PrismaDelegate } from "./client";
import type { Db, UsageSummary } from "../store";

/* ── enum mapping (Prisma stores UPPER_CASE, the app speaks lowercase) ── */

const upper = (value: string) => value.toUpperCase();
const lower = (value: unknown) => String(value ?? "").toLowerCase();

const str = (row: Record<string, unknown> | null | undefined, key: string) =>
  row && typeof row[key] === "string" ? (row[key] as string) : "";
const num = (row: Record<string, unknown> | null | undefined, key: string) => {
  const raw = row?.[key];
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" || typeof raw === "object") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};
const iso = (row: Record<string, unknown> | null | undefined, key: string) => {
  const raw = row?.[key];
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "string") return raw;
  return new Date().toISOString();
};
const isoOrNull = (row: Record<string, unknown> | null | undefined, key: string) => {
  const raw = row?.[key];
  if (!raw) return null;
  return raw instanceof Date ? raw.toISOString() : String(raw);
};

const toOrg = (row: Record<string, unknown> | null): OrganizationRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        name: str(row, "name"),
        slug: str(row, "slug"),
        status: lower(row.status) as OrganizationRow["status"],
        createdAt: iso(row, "createdAt"),
        updatedAt: iso(row, "updatedAt"),
      }
    : undefined;

const toUser = (row: Record<string, unknown> | null): UserRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        organizationId: str(row, "organizationId"),
        email: str(row, "email"),
        name: str(row, "name"),
        role: lower(row.role) as OrgRole,
        status: lower(row.status) as UserRow["status"],
        createdAt: iso(row, "createdAt"),
        updatedAt: iso(row, "updatedAt"),
      }
    : undefined;

const toAgent = (row: Record<string, unknown> | null): AgentRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        organizationId: str(row, "organizationId"),
        name: str(row, "name"),
        description: str(row, "description"),
        industry: lower(row.industry) as AgentRow["industry"],
        language: lower(row.language) as AgentRow["language"],
        voice: str(row, "voice"),
        systemPrompt: str(row, "systemPrompt"),
        welcomeMessage: str(row, "welcomeMessage"),
        status: lower(row.status) as AgentRow["status"],
        createdAt: iso(row, "createdAt"),
        updatedAt: iso(row, "updatedAt"),
      }
    : undefined;

const toSession = (row: Record<string, unknown> | null): VoiceSessionRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        organizationId: str(row, "organizationId"),
        agentId: str(row, "agentId"),
        userId: str(row, "userId") || null,
        language: lower(row.language) as VoiceSessionRow["language"],
        status: lower(row.status) as VoiceSessionRow["status"],
        startedAt: iso(row, "startedAt"),
        endedAt: isoOrNull(row, "endedAt"),
        durationSeconds: row?.durationSeconds == null ? null : num(row, "durationSeconds"),
        mode: lower(row.mode) as VoiceSessionRow["mode"],
        engine: lower(row.engine) === "openai" ? "openai" : "demo",
        testMode: Boolean(row.testMode),
      }
    : undefined;

const toMessage = (row: Record<string, unknown> | null): MessageRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        organizationId: str(row, "organizationId"),
        sessionId: str(row, "sessionId"),
        role: lower(row.role) as MessageRow["role"],
        content: str(row, "content"),
        latencyMs: row?.latencyMs == null ? null : num(row, "latencyMs"),
        timestamp: iso(row, "createdAt"),
      }
    : undefined;

const toUsage = (row: Record<string, unknown> | null): UsageEventRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        organizationId: str(row, "organizationId"),
        sessionId: str(row, "sessionId") || null,
        eventType: lower(row.eventType) as UsageEventRow["eventType"],
        quantity: num(row, "quantity"),
        metadata:
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, string | number | boolean | null>)
            : {},
        createdAt: iso(row, "createdAt"),
      }
    : undefined;

const toCall = (row: Record<string, unknown> | null): CallRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        organizationId: str(row, "organizationId"),
        agentId: str(row, "agentId") || null,
        voiceSessionId: str(row, "voiceSessionId") || null,
        provider: str(row, "provider"),
        providerCallId: str(row, "providerCallId") || null,
        direction: lower(row.direction) as CallDirection,
        status: lower(row.status) as CallStatus,
        fromNumber: str(row, "fromNumber") || null,
        toNumber: str(row, "toNumber") || null,
        startedAt: iso(row, "startedAt"),
        answeredAt: isoOrNull(row, "answeredAt"),
        endedAt: isoOrNull(row, "endedAt"),
        durationSeconds: row?.durationSeconds == null ? null : num(row, "durationSeconds"),
        createdAt: iso(row, "createdAt"),
        updatedAt: iso(row, "updatedAt"),
      }
    : undefined;

const toCallEvent = (row: Record<string, unknown> | null): CallEventRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        organizationId: str(row, "organizationId"),
        callId: str(row, "callId"),
        eventType: lower(row.eventType) as CallEventType,
        provider: str(row, "provider"),
        providerEventId: str(row, "providerEventId") || null,
        metadata:
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, string | number | boolean | null>)
            : {},
        createdAt: iso(row, "createdAt"),
      }
    : undefined;

/** Aggregation is done with findMany + reduce to stay driver-agnostic on Decimal handling. */
async function summarize(
  usage: PrismaDelegate,
  organizationId: string,
  sessionId?: string | null
): Promise<UsageSummary> {
  const rows = await usage.findMany({
    where: sessionId === undefined ? { organizationId } : { organizationId, sessionId },
    orderBy: { createdAt: "asc" },
  });
  const summary: UsageSummary = {
    sessions: 0,
    messages: 0,
    aiRequests: 0,
    characters: 0,
    audioSeconds: 0,
    byEventType: {},
  };
  for (const row of rows) {
    const eventType = lower(row.eventType);
    const quantity = num(row, "quantity");
    summary.byEventType[eventType] = (summary.byEventType[eventType] ?? 0) + quantity;
    if (eventType === "voice_session" || eventType === "session_started") summary.sessions += 1;
    if (eventType === "message") summary.messages += 1;
    if (eventType === "ai_request") summary.aiRequests += 1;
    if (eventType === "characters") summary.characters += quantity;
    if (eventType === "audio_seconds") summary.audioSeconds += quantity;
  }
  return summary;
}

export interface PrismaDbOptions {
  client?: PrismaClientLike;
  /** Audit note recorded alongside usage events; never contains secrets. */
  poolLabel?: string;
}

export async function createPrismaDb(options: PrismaDbOptions = {}): Promise<Db> {
  const client = options.client ?? (await loadPrismaClient());
  const { organization, user, agent, voiceSession, message, usageEvent, call, callEvent } = client;

  return {
    driver: "postgres",

    organizations: {
      get: async (id) => toOrg(await organization.findUnique({ where: { id } })),
      findBySlug: async (slug) => toOrg(await organization.findFirst({ where: { slug } })),
      slugTaken: async (slug) => (await organization.count({ where: { slug } })) > 0,
      create: async ({ id, name, slug, status = "trial" }) =>
        toOrg(
          await organization.create({
            data: { ...(id ? { id } : {}), name, slug, status: upper(status) },
          })
        )!,
      update: async (id, patch) => {
        const data: Record<string, unknown> = { updatedAt: new Date() };
        if (patch.name !== undefined) data.name = patch.name;
        if (patch.status !== undefined) data.status = upper(patch.status);
        const updated = await organization.update({ where: { id }, data });
        return toOrg(updated);
      },
      list: async () => (await organization.findMany({ orderBy: { createdAt: "asc" } })).map(toOrg).filter(Boolean) as OrganizationRow[],
    },

    users: {
      get: async (id) => toUser(await user.findUnique({ where: { id } })),
      listByOrg: async (organizationId) =>
        (await user.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }))
          .map(toUser)
          .filter(Boolean) as UserRow[],
      findByEmail: async (email) =>
        toUser(await user.findFirst({ where: { email: email.trim().toLowerCase() } })),
      getCredentialByEmail: async (email) => {
        const row = await user.findFirst({ where: { email: email.trim().toLowerCase() } });
        if (!row) return undefined;
        const hash = str(row, "passwordHash");
        if (!hash) return undefined;
        return {
          userId: str(row, "id"),
          organizationId: str(row, "organizationId"),
          role: lower(row.role) as OrgRole,
          status: lower(row.status) as UserCredential["status"],
          passwordHash: hash,
        };
      },
      create: async ({ organizationId, email, name, role, status = "active" }) =>
        toUser(
          await user.create({
            data: {
              organizationId,
              email: email.trim().toLowerCase(),
              name,
              role: upper(role),
              status: upper(status),
            },
          })
        )!,
      setPassword: async (userId, passwordHash) => {
        await user.update({ where: { id: userId }, data: { passwordHash, updatedAt: new Date() } });
      },
    },

    agents: {
      listByOrg: async (organizationId) =>
        (await agent.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }))
          .map(toAgent)
          .filter(Boolean) as AgentRow[],
      get: async (organizationId, agentId) =>
        toAgent(await agent.findFirst({ where: { id: agentId, organizationId } })),
      create: async (input) =>
        toAgent(
          await agent.create({
            data: {
              id: input.id,
              organizationId: input.organizationId,
              name: input.name,
              description: input.description,
              industry: upper(input.industry),
              language: upper(input.language),
              voice: input.voice,
              systemPrompt: input.systemPrompt,
              welcomeMessage: input.welcomeMessage,
              status: upper(input.status),
            },
          })
        )!,
      update: async (organizationId, agentId, patch) => {
        const data: Record<string, unknown> = { updatedAt: new Date() };
        if (patch.name !== undefined) data.name = patch.name;
        if (patch.description !== undefined) data.description = patch.description;
        if (patch.industry !== undefined) data.industry = upper(patch.industry);
        if (patch.language !== undefined) data.language = upper(patch.language);
        if (patch.voice !== undefined) data.voice = patch.voice;
        if (patch.systemPrompt !== undefined) data.systemPrompt = patch.systemPrompt;
        if (patch.welcomeMessage !== undefined) data.welcomeMessage = patch.welcomeMessage;
        if (patch.status !== undefined) data.status = upper(patch.status);
        // Composite where keeps the write tenant-scoped; updateMany reports 0 rows cross-tenant.
        const result = await agent.updateMany({ where: { id: agentId, organizationId }, data });
        if (result.count === 0) return undefined;
        return toAgent(await agent.findFirst({ where: { id: agentId, organizationId } }));
      },
      remove: async (organizationId, agentId) => {
        const result = await agent.deleteMany({ where: { id: agentId, organizationId } });
        return result.count > 0;
      },
    },

    sessions: {
      create: async (input) =>
        toSession(
          await voiceSession.create({
            data: {
              id: input.id,
              organizationId: input.organizationId,
              agentId: input.agentId,
              userId: input.userId,
              language: upper(input.language),
              mode: upper(input.mode),
              engine: input.engine === "openai" ? "OPENAI" : "DEMO",
              testMode: input.testMode === true,
              status: "ACTIVE",
            },
          })
        )!,
      get: async (id, organizationId) =>
        toSession(await voiceSession.findFirst({ where: { id, organizationId } })),
      listByOrg: async (organizationId) =>
        (await voiceSession.findMany({
          where: { organizationId },
          orderBy: { startedAt: "desc" },
        }))
          .map(toSession)
          .filter(Boolean) as VoiceSessionRow[],
      patch: async (id, organizationId, changes) => {
        const data: Record<string, unknown> = {};
        if (changes.status !== undefined) data.status = upper(changes.status);
        if (changes.endedAt !== undefined) data.endedAt = changes.endedAt ? new Date(changes.endedAt) : null;
        if (changes.durationSeconds !== undefined) data.durationSeconds = changes.durationSeconds;
        const result = await voiceSession.updateMany({ where: { id, organizationId }, data });
        if (result.count === 0) return undefined;
        return toSession(await voiceSession.findFirst({ where: { id, organizationId } }));
      },
    },

    messages: {
      append: async ({ organizationId, sessionId, role, content, latencyMs }) =>
        toMessage(
          await message.create({
            data: {
              organizationId,
              sessionId,
              role: upper(role),
              content,
              ...(latencyMs == null ? {} : { latencyMs: Math.round(latencyMs) }),
            },
          })
        )!,
      listBySession: async (sessionId, organizationId) =>
        (await message.findMany({
          // Two-condition where: a session id alone can never read across tenants.
          where: { sessionId, organizationId },
          orderBy: { createdAt: "asc" },
        }))
          .map(toMessage)
          .filter(Boolean) as MessageRow[],
      countByOrg: async (organizationId) => await message.count({ where: { organizationId } }),
    },

    usage: {
      record: async ({ organizationId, sessionId = null, eventType, quantity = 1, metadata = {} }) =>
        toUsage(
          await usageEvent.create({
            data: {
              organizationId,
              sessionId,
              eventType: upper(eventType),
              quantity,
              metadata: metadata as Record<string, never>,
            },
          })
        )!,
      listByOrg: async (organizationId, sessionId) =>
        (await usageEvent.findMany({
          where: sessionId === undefined ? { organizationId } : { organizationId, sessionId },
          orderBy: { createdAt: "desc" },
          take: 200,
        }))
          .map(toUsage)
          .filter(Boolean) as UsageEventRow[],
      summarize: (organizationId, sessionId) => summarize(usageEvent, organizationId, sessionId),
    },

    calls: {
      create: async (input) =>
        toCall(
          await call.create({
            data: {
              id: input.id,
              organizationId: input.organizationId,
              agentId: input.agentId,
              voiceSessionId: input.voiceSessionId,
              provider: input.provider,
              providerCallId: input.providerCallId,
              direction: upper(input.direction),
              status: upper(input.status),
              fromNumber: input.fromNumber,
              toNumber: input.toNumber,
            },
          })
        )!,
      get: async (id, organizationId) =>
        toCall(await call.findFirst({ where: { id, organizationId } })),
      listByOrg: async (organizationId) =>
        (await call.findMany({
          where: { organizationId },
          orderBy: { startedAt: "desc" },
        }))
          .map(toCall)
          .filter(Boolean) as CallRow[],
      findByProviderCallId: async (provider, providerCallId) =>
        toCall(await call.findFirst({ where: { provider, providerCallId } })),
      update: async (id, organizationId, changes) => {
        const data: Record<string, unknown> = { updatedAt: new Date() };
        if (changes.status !== undefined) data.status = upper(changes.status);
        if (changes.agentId !== undefined) data.agentId = changes.agentId;
        if (changes.voiceSessionId !== undefined) data.voiceSessionId = changes.voiceSessionId;
        if (changes.answeredAt !== undefined) data.answeredAt = changes.answeredAt ? new Date(changes.answeredAt) : null;
        if (changes.endedAt !== undefined) data.endedAt = changes.endedAt ? new Date(changes.endedAt) : null;
        if (changes.durationSeconds !== undefined) data.durationSeconds = changes.durationSeconds;
        const result = await call.updateMany({ where: { id, organizationId }, data });
        if (result.count === 0) return undefined;
        return toCall(await call.findFirst({ where: { id, organizationId } }));
      },
    },

    callEvents: {
      create: async (input) =>
        toCallEvent(
          await callEvent.create({
            data: {
              id: input.id,
              organizationId: input.organizationId,
              callId: input.callId,
              eventType: upper(input.eventType),
              provider: input.provider,
              providerEventId: input.providerEventId,
              metadata: input.metadata as Record<string, never>,
            },
          })
        )!,
      listByCall: async (callId) =>
        (await callEvent.findMany({
          where: { callId },
          orderBy: { createdAt: "asc" },
        }))
          .map(toCallEvent)
          .filter(Boolean) as CallEventRow[],
      findByProviderEventId: async (provider, providerEventId) =>
        toCallEvent(await callEvent.findFirst({ where: { provider, providerEventId } })),
    },

    reset: async () => {
      // Deliberately a no-op: truncating a production database is never an app-level action.
    },
  };
}
