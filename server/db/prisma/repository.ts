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
  CampaignRow,
  CallDirection,
  CallEventRow,
  CallEventType,
  CallRow,
  CallStatus,
  DataConnectorFieldMappingRow,
  DataConnectorRow,
  MessageRow,
  OrganizationBrandingRow,
  OrganizationEntitlementRow,
  OrganizationLimits,
  OrganizationRow,
  OrgRole,
  PlanRow,
  SubscriptionRow,
  AuditEventRow,
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


const jsonObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const toCampaign = (row: Record<string, unknown> | null): CampaignRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        organizationId: str(row, "organizationId"),
        name: str(row, "name"),
        description: str(row, "description"),
        agentId: str(row, "agentId") || null,
        status: lower(row.status) as CampaignRow["status"],
        direction: lower(row.direction) as CampaignRow["direction"],
        scheduledAt: isoOrNull(row, "scheduledAt"),
        startedAt: isoOrNull(row, "startedAt"),
        completedAt: isoOrNull(row, "completedAt"),
        totalContacts: num(row, "totalContacts"),
        processedContacts: num(row, "processedContacts"),
        completedCalls: num(row, "completedCalls"),
        failedCalls: num(row, "failedCalls"),
        configuration: jsonObject(row.configuration) as CampaignRow["configuration"],
        createdAt: iso(row, "createdAt"),
        updatedAt: iso(row, "updatedAt"),
      }
    : undefined;

const toConnector = (row: Record<string, unknown> | null): DataConnectorRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        organizationId: str(row, "organizationId"),
        name: str(row, "name"),
        provider: str(row, "provider"),
        type: str(row, "type") as DataConnectorRow["type"],
        status: str(row, "status") as DataConnectorRow["status"],
        healthStatus: str(row, "healthStatus") as DataConnectorRow["healthStatus"],
        syncMode: str(row, "syncMode") as DataConnectorRow["syncMode"],
        scheduleCron: str(row, "scheduleCron") || null,
        credentialReference: str(row, "credentialReference") || null,
        configuration: jsonObject(row.configuration),
        lastSyncAt: isoOrNull(row, "lastSyncAt"),
        lastTestedAt: isoOrNull(row, "lastTestedAt"),
        lastHealthCheckAt: isoOrNull(row, "lastHealthCheckAt"),
        enabled: Boolean(row.enabled),
        createdAt: iso(row, "createdAt"),
        updatedAt: iso(row, "updatedAt"),
      }
    : undefined;

const toConnectorMapping = (
  row: Record<string, unknown> | null
): DataConnectorFieldMappingRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        organizationId: str(row, "organizationId"),
        connectorId: str(row, "connectorId"),
        sourceField: str(row, "sourceField"),
        targetField: str(row, "targetField"),
        dataType: str(row, "dataType"),
        required: Boolean(row.required),
        transformerType: str(row, "transformerType") as DataConnectorFieldMappingRow["transformerType"] || null,
        transformerConfig: jsonObject(row.transformerConfig),
        displayOrder: num(row, "displayOrder"),
        createdAt: iso(row, "createdAt"),
        updatedAt: iso(row, "updatedAt"),
      }
    : undefined;

const toPlan = (row: Record<string, unknown> | null): PlanRow | undefined => {
  if (!row) return undefined;
  const id = str(row, "id");
  const name = str(row, "name");
  const identity = `${id} ${name}`.toLowerCase();
  const derivedType: PlanRow["planType"] = identity.includes("starter")
    ? "starter"
    : identity.includes("professional")
      ? "professional"
      : identity.includes("enterprise")
        ? "enterprise"
        : "custom";
  return {
        id,
        name,
        // Compatibility-only classification; the plans table stores only required plan data.
        planType: derivedType,
        status: lower(row.status) as PlanRow["status"],
        features: Array.isArray(row.features) ? (row.features as PlanRow["features"]) : [],
        limits: jsonObject(row.limits) as unknown as OrganizationLimits,
        createdAt: iso(row, "createdAt"),
        updatedAt: iso(row, "updatedAt"),
      };
};

const toSubscription = (row: Record<string, unknown> | null): SubscriptionRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        organizationId: str(row, "organizationId"),
        planId: str(row, "planId"),
        status: lower(row.status) as SubscriptionRow["status"],
        effectiveLimits: row.effectiveLimits == null
          ? null
          : (jsonObject(row.effectiveLimits) as unknown as OrganizationLimits),
        trialEndsAt: isoOrNull(row, "trialEndsAt"),
        currentPeriodStart: isoOrNull(row, "currentPeriodStart"),
        currentPeriodEnd: isoOrNull(row, "currentPeriodEnd"),
        cancelledAt: isoOrNull(row, "cancelledAt"),
        startedAt: iso(row, "startedAt"),
        createdAt: iso(row, "createdAt"),
        updatedAt: iso(row, "updatedAt"),
      }
    : undefined;

const toEntitlement = (
  row: Record<string, unknown> | null
): OrganizationEntitlementRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        organizationId: str(row, "organizationId"),
        feature: str(row, "feature") as OrganizationEntitlementRow["feature"],
        enabled: Boolean(row.enabled),
        reason: str(row, "reason") || null,
        createdAt: iso(row, "createdAt"),
        updatedAt: iso(row, "updatedAt"),
      }
    : undefined;

const toBranding = (row: Record<string, unknown> | null): OrganizationBrandingRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        organizationId: str(row, "organizationId"),
        displayName: str(row, "displayName") || null,
        logoUrl: str(row, "logoUrl") || null,
        faviconUrl: str(row, "faviconUrl") || null,
        primaryColor: str(row, "primaryColor"),
        accentColor: str(row, "accentColor"),
        theme: str(row, "theme") as OrganizationBrandingRow["theme"],
        createdAt: iso(row, "createdAt"),
        updatedAt: iso(row, "updatedAt"),
      }
    : undefined;

const toAudit = (row: Record<string, unknown> | null): AuditEventRow | undefined =>
  row
    ? {
        id: str(row, "id"),
        organizationId: str(row, "organizationId") || null,
        actorId: str(row, "actorId") || null,
        actorEmail: str(row, "actorEmail") || null,
        action: str(row, "action") as AuditEventRow["action"],
        metadata: jsonObject(row.metadata) as AuditEventRow["metadata"],
        ipAddress: str(row, "ipAddress") || null,
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
  const {
    organization,
    user,
    agent,
    voiceSession,
    message,
    usageEvent,
    call,
    callEvent,
    campaign,
    dataConnector,
    dataConnectorFieldMapping,
    plan,
    subscription,
    organizationEntitlement,
    organizationBranding,
    auditEvent,
  } = client;

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
          // Usage and limit enforcement must never be truncated to an arbitrary page.
          orderBy: { createdAt: "desc" },
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

    campaigns: {
      create: async (input) =>
        toCampaign(
          await campaign.create({
            data: {
              organizationId: input.organizationId,
              name: input.name,
              description: input.description,
              agentId: input.agentId,
              status: upper(input.status),
              direction: upper(input.direction),
              scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
              startedAt: input.startedAt ? new Date(input.startedAt) : null,
              completedAt: input.completedAt ? new Date(input.completedAt) : null,
              totalContacts: input.totalContacts,
              configuration: input.configuration,
            },
          })
        )!,
      get: async (id, organizationId) =>
        toCampaign(await campaign.findFirst({ where: { id, organizationId } })),
      listByOrg: async (organizationId) =>
        (await campaign.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }))
          .map(toCampaign)
          .filter(Boolean) as CampaignRow[],
      update: async (id, organizationId, patch) => {
        const data: Record<string, unknown> = { updatedAt: new Date() };
        if (patch.name !== undefined) data.name = patch.name;
        if (patch.description !== undefined) data.description = patch.description;
        if (patch.agentId !== undefined) data.agentId = patch.agentId;
        if (patch.status !== undefined) data.status = upper(patch.status);
        if (patch.scheduledAt !== undefined) data.scheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt) : null;
        if (patch.startedAt !== undefined) data.startedAt = patch.startedAt ? new Date(patch.startedAt) : null;
        if (patch.completedAt !== undefined) data.completedAt = patch.completedAt ? new Date(patch.completedAt) : null;
        if (patch.totalContacts !== undefined) data.totalContacts = patch.totalContacts;
        if (patch.processedContacts !== undefined) data.processedContacts = patch.processedContacts;
        if (patch.completedCalls !== undefined) data.completedCalls = patch.completedCalls;
        if (patch.failedCalls !== undefined) data.failedCalls = patch.failedCalls;
        if (patch.configuration !== undefined) data.configuration = patch.configuration;
        const result = await campaign.updateMany({ where: { id, organizationId }, data });
        return result.count
          ? toCampaign(await campaign.findFirst({ where: { id, organizationId } }))
          : undefined;
      },
      delete: async (id, organizationId) =>
        (await campaign.deleteMany({ where: { id, organizationId } })).count > 0,
      count: async (organizationId) => campaign.count({ where: { organizationId } }),
      countByStatus: async (organizationId) => {
        const rows = await campaign.findMany({ where: { organizationId } });
        return rows.reduce<Record<string, number>>((counts, row) => {
          const status = lower(row.status);
          counts[status] = (counts[status] ?? 0) + 1;
          return counts;
        }, {});
      },
    },

    connectors: {
      create: async (input) =>
        toConnector(
          await dataConnector.create({
            data: {
              organizationId: input.organizationId,
              name: input.name,
              provider: input.provider,
              type: input.type,
              syncMode: input.syncMode,
              scheduleCron: input.scheduleCron,
              credentialReference: input.credentialReference,
              configuration: input.configuration,
            },
          })
        )!,
      get: async (id, organizationId) =>
        toConnector(await dataConnector.findFirst({ where: { id, organizationId } })),
      listByOrg: async (organizationId, type, status) =>
        (await dataConnector.findMany({
          where: {
            organizationId,
            ...(type ? { type } : {}),
            ...(status ? { status } : {}),
          },
          orderBy: { createdAt: "desc" },
        }))
          .map(toConnector)
          .filter(Boolean) as DataConnectorRow[],
      update: async (id, organizationId, patch) => {
        const data: Record<string, unknown> = { updatedAt: new Date() };
        if (patch.name !== undefined) data.name = patch.name;
        if (patch.provider !== undefined) data.provider = patch.provider;
        if (patch.type !== undefined) data.type = patch.type;
        if (patch.status !== undefined) data.status = patch.status;
        if (patch.healthStatus !== undefined) data.healthStatus = patch.healthStatus;
        if (patch.syncMode !== undefined) data.syncMode = patch.syncMode;
        if (patch.scheduleCron !== undefined) data.scheduleCron = patch.scheduleCron;
        if (patch.credentialReference !== undefined) data.credentialReference = patch.credentialReference;
        if (patch.configuration !== undefined) data.configuration = patch.configuration;
        if (patch.lastSyncAt !== undefined) data.lastSyncAt = patch.lastSyncAt ? new Date(patch.lastSyncAt) : null;
        if (patch.lastTestedAt !== undefined) data.lastTestedAt = patch.lastTestedAt ? new Date(patch.lastTestedAt) : null;
        if (patch.lastHealthCheckAt !== undefined) data.lastHealthCheckAt = patch.lastHealthCheckAt ? new Date(patch.lastHealthCheckAt) : null;
        if (patch.enabled !== undefined) data.enabled = patch.enabled;
        const result = await dataConnector.updateMany({ where: { id, organizationId }, data });
        return result.count
          ? toConnector(await dataConnector.findFirst({ where: { id, organizationId } }))
          : undefined;
      },
      delete: async (id, organizationId) =>
        (await dataConnector.deleteMany({ where: { id, organizationId } })).count > 0,
      count: async (organizationId) => dataConnector.count({ where: { organizationId } }),
      countByStatus: async (organizationId) => {
        const rows = await dataConnector.findMany({ where: { organizationId } });
        return rows.reduce<Record<string, number>>((counts, row) => {
          const status = str(row, "status");
          counts[status] = (counts[status] ?? 0) + 1;
          return counts;
        }, {});
      },
    },

    connectorMappings: {
      create: async (input) =>
        toConnectorMapping(
          await dataConnectorFieldMapping.create({
            data: {
              organizationId: input.organizationId,
              connectorId: input.connectorId,
              sourceField: input.sourceField,
              targetField: input.targetField,
              dataType: input.dataType,
              required: input.required,
              transformerType: input.transformerType,
              transformerConfig: input.transformerConfig,
              displayOrder: input.displayOrder,
            },
          })
        )!,
      get: async (id, organizationId) =>
        toConnectorMapping(await dataConnectorFieldMapping.findFirst({ where: { id, organizationId } })),
      listByConnector: async (organizationId, connectorId) =>
        (await dataConnectorFieldMapping.findMany({
          where: { organizationId, connectorId },
          orderBy: { displayOrder: "asc" },
        }))
          .map(toConnectorMapping)
          .filter(Boolean) as DataConnectorFieldMappingRow[],
      update: async (id, organizationId, patch) => {
        const data: Record<string, unknown> = { updatedAt: new Date() };
        if (patch.sourceField !== undefined) data.sourceField = patch.sourceField;
        if (patch.targetField !== undefined) data.targetField = patch.targetField;
        if (patch.dataType !== undefined) data.dataType = patch.dataType;
        if (patch.required !== undefined) data.required = patch.required;
        if (patch.transformerType !== undefined) data.transformerType = patch.transformerType;
        if (patch.transformerConfig !== undefined) data.transformerConfig = patch.transformerConfig;
        if (patch.displayOrder !== undefined) data.displayOrder = patch.displayOrder;
        const result = await dataConnectorFieldMapping.updateMany({ where: { id, organizationId }, data });
        return result.count
          ? toConnectorMapping(await dataConnectorFieldMapping.findFirst({ where: { id, organizationId } }))
          : undefined;
      },
      delete: async (id, organizationId) =>
        (await dataConnectorFieldMapping.deleteMany({ where: { id, organizationId } })).count > 0,
      deleteByConnector: async (organizationId, connectorId) =>
        (await dataConnectorFieldMapping.deleteMany({ where: { organizationId, connectorId } })).count,
      count: async (organizationId, connectorId) =>
        dataConnectorFieldMapping.count({ where: { organizationId, connectorId } }),
    },

    plans: {
      get: async (id) => toPlan(await plan.findUnique({ where: { id } })),
      list: async () =>
        (await plan.findMany({ orderBy: { name: "asc" } })).map(toPlan).filter(Boolean) as PlanRow[],
      create: async (input) =>
        toPlan(
          await plan.create({
            data: {
              id: input.id,
              name: input.name,
              status: upper(input.status),
              features: input.features,
              limits: input.limits as unknown as Record<string, unknown>,
            },
          })
        )!,
      update: async (id, changes) => {
        const data: Record<string, unknown> = { updatedAt: new Date() };
        if (changes.name !== undefined) data.name = changes.name;
        if (changes.status !== undefined) data.status = upper(changes.status);
        if (changes.features !== undefined) data.features = changes.features;
        if (changes.limits !== undefined) data.limits = changes.limits;
        const result = await plan.updateMany({ where: { id }, data });
        return result.count ? toPlan(await plan.findUnique({ where: { id } })) : undefined;
      },
    },

    subscriptions: {
      getByOrg: async (organizationId) =>
        toSubscription(await subscription.findFirst({ where: { organizationId } })),
      create: async (input) =>
        toSubscription(
          await subscription.create({
            data: {
              ...(input.id ? { id: input.id } : {}),
              organizationId: input.organizationId,
              planId: input.planId,
              status: upper(input.status),
              effectiveLimits: input.effectiveLimits,
              trialEndsAt: input.trialEndsAt ? new Date(input.trialEndsAt) : null,
              currentPeriodStart: input.currentPeriodStart ? new Date(input.currentPeriodStart) : null,
              currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null,
              cancelledAt: input.cancelledAt ? new Date(input.cancelledAt) : null,
              ...(input.startedAt ? { startedAt: new Date(input.startedAt) } : {}),
            },
          })
        )!,
      update: async (id, changes) => {
        const data: Record<string, unknown> = { updatedAt: new Date() };
        if (changes.planId !== undefined) data.planId = changes.planId;
        if (changes.status !== undefined) data.status = upper(changes.status);
        if (changes.effectiveLimits !== undefined) data.effectiveLimits = changes.effectiveLimits;
        if (changes.trialEndsAt !== undefined) data.trialEndsAt = changes.trialEndsAt ? new Date(changes.trialEndsAt) : null;
        if (changes.currentPeriodStart !== undefined) data.currentPeriodStart = changes.currentPeriodStart ? new Date(changes.currentPeriodStart) : null;
        if (changes.currentPeriodEnd !== undefined) data.currentPeriodEnd = changes.currentPeriodEnd ? new Date(changes.currentPeriodEnd) : null;
        if (changes.cancelledAt !== undefined) data.cancelledAt = changes.cancelledAt ? new Date(changes.cancelledAt) : null;
        const result = await subscription.updateMany({ where: { id }, data });
        return result.count ? toSubscription(await subscription.findUnique({ where: { id } })) : undefined;
      },
      listAll: async () =>
        (await subscription.findMany({ orderBy: { createdAt: "desc" } }))
          .map(toSubscription)
          .filter(Boolean) as SubscriptionRow[],
    },

    entitlements: {
      get: async (organizationId, feature) =>
        toEntitlement(await organizationEntitlement.findFirst({ where: { organizationId, feature } })),
      listByOrg: async (organizationId) =>
        (await organizationEntitlement.findMany({ where: { organizationId }, orderBy: { feature: "asc" } }))
          .map(toEntitlement)
          .filter(Boolean) as OrganizationEntitlementRow[],
      upsert: async (input) =>
        toEntitlement(
          await organizationEntitlement.upsert({
            where: {
              organizationId_feature: { organizationId: input.organizationId, feature: input.feature },
            },
            create: {
              organizationId: input.organizationId,
              feature: input.feature,
              enabled: input.enabled,
              reason: input.reason,
            },
            update: { enabled: input.enabled, reason: input.reason, updatedAt: new Date() },
          })
        )!,
      remove: async (organizationId, feature) =>
        (await organizationEntitlement.deleteMany({ where: { organizationId, feature } })).count > 0,
    },

    branding: {
      getByOrg: async (organizationId) =>
        toBranding(await organizationBranding.findFirst({ where: { organizationId } })),
      upsert: async (input) =>
        toBranding(
          await organizationBranding.upsert({
            where: { organizationId: input.organizationId },
            create: { ...input },
            update: { ...input, updatedAt: new Date() },
          })
        )!,
      update: async (organizationId, changes) => {
        const result = await organizationBranding.updateMany({
          where: { organizationId },
          data: { ...changes, updatedAt: new Date() },
        });
        return result.count
          ? toBranding(await organizationBranding.findFirst({ where: { organizationId } }))
          : undefined;
      },
    },

    audit: {
      create: async (input) =>
        toAudit(
          await auditEvent.create({
            data: {
              organizationId: input.organizationId,
              actorId: input.actorId,
              actorEmail: input.actorEmail,
              action: input.action,
              metadata: input.metadata,
              ipAddress: input.ipAddress,
            },
          })
        )!,
      listByOrg: async (organizationId, limit) =>
        (await auditEvent.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
          ...(limit ? { take: limit } : {}),
        })).map(toAudit).filter(Boolean) as AuditEventRow[],
      listAll: async (limit) =>
        (await auditEvent.findMany({
          orderBy: { createdAt: "desc" },
          ...(limit ? { take: limit } : {}),
        })).map(toAudit).filter(Boolean) as AuditEventRow[],
    },

    reset: async () => {
      // Deliberately a no-op: truncating a production database is never an app-level action.
    },
  };
}
