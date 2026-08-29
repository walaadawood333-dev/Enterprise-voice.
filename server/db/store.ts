/**
 * Database abstraction — the repository contract every driver implements.
 *
 *  • All methods are async, so the in-memory driver (Demo Mode, browser local transport) and the
 *    Postgres/Prisma driver are interchangeable with no call-site changes.
 *  • Every organization-owned method takes organizationId. That is the isolation contract: there
 *    is no unscoped accessor on this interface, so a query cannot "forget" the tenant.
 */

import {
  DEMO_AGENT_ID,
  DEMO_ORGANIZATION_ID,
  type AgentLanguage,
  type AgentRow,
  type IndustryName,
  type MessageRow,
  type OrganizationRow,
  type OrgRole,
  type UserCredential,
  type UserRow,
  type UsageEventRow,
  type UsageEventType,
  type VoiceSessionRow,
} from "../../shared/contracts";
import { DEMO_AGENT, DEMO_ORGANIZATION } from "../../shared/demo";
import { configInvalid } from "../lib/observability";
import type { ServerEnv } from "../config/env";

/**
 * DDL lives in prisma/schema.prisma (authoritative) and
 * prisma/migrations/20260101000000_init/migration.sql (apply with `prisma migrate deploy`).
 */
export const SCHEMA_SQL = `-- See prisma/schema.prisma and prisma/migrations/20260101000000_init/migration.sql
-- tables: organizations, users, agents, voice_sessions, messages, usage_events`;

let counter = 0;
export function newId(prefix: string): string {
  const rand =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  counter = (counter + 1) % 1000;
  return `${prefix}_${rand}${counter.toString(36)}`;
}

const now = () => new Date().toISOString();

export interface UsageSummary {
  sessions: number;
  messages: number;
  aiRequests: number;
  characters: number;
  audioSeconds: number;
  byEventType: Record<string, number>;
}

export interface Db {
  readonly driver: "memory" | "postgres";
  organizations: {
    get(id: string): Promise<OrganizationRow | undefined>;
    findBySlug(slug: string): Promise<OrganizationRow | undefined>;
    slugTaken(slug: string): Promise<boolean>;
    create(input: {
      id?: string;
      name: string;
      slug: string;
      status?: OrganizationRow["status"];
    }): Promise<OrganizationRow>;
    update(
      id: string,
      patch: Partial<Pick<OrganizationRow, "name" | "status">>
    ): Promise<OrganizationRow | undefined>;
    list(): Promise<OrganizationRow[]>;
  };
  users: {
    get(id: string): Promise<UserRow | undefined>;
    listByOrg(organizationId: string): Promise<UserRow[]>;
    findByEmail(email: string): Promise<UserRow | undefined>;
    /** Hash never leaves this accessor; no route maps it into a response. */
    getCredentialByEmail(email: string): Promise<UserCredential | undefined>;
    create(input: {
      organizationId: string;
      email: string;
      name: string;
      role: OrgRole;
      status?: UserRow["status"];
    }): Promise<UserRow>;
    setPassword(userId: string, passwordHash: string): Promise<void>;
  };
  agents: {
    listByOrg(organizationId: string): Promise<AgentRow[]>;
    get(organizationId: string, agentId: string): Promise<AgentRow | undefined>;
    create(input: Omit<AgentRow, "createdAt" | "updatedAt">): Promise<AgentRow>;
    update(
      organizationId: string,
      agentId: string,
      patch: Partial<Omit<AgentRow, "id" | "organizationId" | "createdAt" | "updatedAt">>
    ): Promise<AgentRow | undefined>;
    remove(organizationId: string, agentId: string): Promise<boolean>;
  };
  sessions: {
    create(
      input: Omit<VoiceSessionRow, "startedAt" | "endedAt" | "status" | "durationSeconds">
    ): Promise<VoiceSessionRow>;
    /** Scoped: another tenant's id reads as missing, never as the row. */
    get(id: string, organizationId: string): Promise<VoiceSessionRow | undefined>;
    listByOrg(organizationId: string): Promise<VoiceSessionRow[]>;
    patch(
      id: string,
      organizationId: string,
      changes: Partial<Pick<VoiceSessionRow, "status" | "endedAt" | "durationSeconds">>
    ): Promise<VoiceSessionRow | undefined>;
  };
  messages: {
    append(input: {
      organizationId: string;
      sessionId: string;
      role: MessageRow["role"];
      content: string;
      /** Provider latency for the reply; transcript text only, never audio. */
      latencyMs?: number | null;
    }): Promise<MessageRow>;
    listBySession(sessionId: string, organizationId: string): Promise<MessageRow[]>;
    countByOrg(organizationId: string): Promise<number>;
  };
  usage: {
    record(input: {
      organizationId: string;
      sessionId?: string | null;
      eventType: UsageEventType;
      quantity?: number;
      metadata?: Record<string, string | number | boolean | null>;
    }): Promise<UsageEventRow>;
    listByOrg(organizationId: string, sessionId?: string | null): Promise<UsageEventRow[]>;
    summarize(organizationId: string, sessionId?: string | null): Promise<UsageSummary>;
  };
  /** Demo/test helper. No-op for persistent drivers. */
  reset(): Promise<void>;
}

const seedAgents = (organizationId: string, stamp: string): AgentRow[] =>
  DEMO_AGENT.languages.map((language, index) => ({
    id: index === 0 ? DEMO_AGENT_ID : `${DEMO_AGENT_ID}-${language}`,
    organizationId,
    name: index === 0 ? DEMO_AGENT.name : `${DEMO_AGENT.name} (${language.toUpperCase()})`,
    description: DEMO_AGENT.description,
    industry: "Banking" as IndustryName,
    language: language as AgentLanguage,
    voice: DEMO_AGENT.voice,
    systemPrompt: DEMO_AGENT.systemPrompt,
    welcomeMessage:
      language === "en"
        ? "Welcome to CenterAI. I can help with balance enquiries, card issues and appointments."
        : "أهلاً بك في CenterAI. أستطيع مساعدتك في استعلامات الرصيد والبطاقات والمواعيد.",
    status: "active" as const,
    createdAt: stamp,
    updatedAt: stamp,
  }));

export function createMemoryDb(): Db {
  interface Store {
    organizations: Map<string, OrganizationRow>;
    users: Map<string, UserRow>;
    credentials: Map<string, string>;
    agents: Map<string, AgentRow>;
    sessions: Map<string, VoiceSessionRow>;
    messages: Map<string, MessageRow>;
    usage: UsageEventRow[];
  }

  const seed = (): Store => {
    const stamp = now();
    const organizations = new Map<string, OrganizationRow>();
    organizations.set(DEMO_ORGANIZATION_ID, {
      id: DEMO_ORGANIZATION_ID,
      name: DEMO_ORGANIZATION.name,
      slug: DEMO_ORGANIZATION.slug,
      status: "active",
      createdAt: stamp,
      updatedAt: stamp,
    });

    const users = new Map<string, UserRow>();
    const owner: UserRow = {
      id: newId("usr"),
      organizationId: DEMO_ORGANIZATION_ID,
      email: "owner@centerai.jo",
      name: "Demo Owner",
      role: "owner",
      status: "active",
      createdAt: stamp,
      updatedAt: stamp,
    };
    users.set(owner.id, owner);

    const agents = new Map<string, AgentRow>();
    for (const agent of seedAgents(DEMO_ORGANIZATION_ID, stamp)) agents.set(agent.id, agent);

    return {
      organizations,
      users,
      credentials: new Map(),
      agents,
      sessions: new Map(),
      messages: new Map(),
      usage: [],
    };
  };

  let data = seed();

  const ownedAgent = (organizationId: string, agentId: string) => {
    const agent = data.agents.get(agentId);
    return agent && agent.organizationId === organizationId ? agent : undefined;
  };

  return {
    driver: "memory",

    organizations: {
      get: async (id) => data.organizations.get(id),
      findBySlug: async (slug) => [...data.organizations.values()].find((o) => o.slug === slug),
      slugTaken: async (slug) => [...data.organizations.values()].some((o) => o.slug === slug),
      create: async ({ id, name, slug, status = "trial" }) => {
        const stamp = now();
        const row: OrganizationRow = {
          id: id ?? newId("org"),
          name,
          slug,
          status,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.organizations.set(row.id, row);
        return row;
      },
      update: async (id, patch) => {
        const row = data.organizations.get(id);
        if (!row) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.organizations.set(id, next);
        return next;
      },
      list: async () => [...data.organizations.values()],
    },

    users: {
      get: async (id) => data.users.get(id),
      listByOrg: async (organizationId) =>
        [...data.users.values()].filter((u) => u.organizationId === organizationId),
      findByEmail: async (email) =>
        [...data.users.values()].find((u) => u.email.toLowerCase() === email.trim().toLowerCase()),
      getCredentialByEmail: async (email) => {
        const user = [...data.users.values()].find(
          (u) => u.email.toLowerCase() === email.trim().toLowerCase()
        );
        if (!user) return undefined;
        const hash = data.credentials.get(user.id);
        if (!hash) return undefined;
        return {
          userId: user.id,
          organizationId: user.organizationId,
          role: user.role,
          status: user.status,
          passwordHash: hash,
        };
      },
      create: async ({ organizationId, email, name, role, status = "active" }) => {
        const stamp = now();
        const row: UserRow = {
          id: newId("usr"),
          organizationId,
          email: email.trim().toLowerCase(),
          name,
          role,
          status,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.users.set(row.id, row);
        return row;
      },
      setPassword: async (userId, passwordHash) => {
        data.credentials.set(userId, passwordHash);
        const user = data.users.get(userId);
        if (user) data.users.set(userId, { ...user, updatedAt: now() });
      },
    },

    agents: {
      listByOrg: async (organizationId) =>
        [...data.agents.values()].filter((a) => a.organizationId === organizationId),
      get: async (organizationId, agentId) => ownedAgent(organizationId, agentId),
      create: async (input) => {
        const stamp = now();
        const row: AgentRow = { ...input, createdAt: stamp, updatedAt: stamp };
        data.agents.set(row.id, row);
        return row;
      },
      update: async (organizationId, agentId, patch) => {
        const current = ownedAgent(organizationId, agentId);
        if (!current) return undefined;
        const next = { ...current, ...patch, updatedAt: now() };
        data.agents.set(agentId, next);
        return next;
      },
      remove: async (organizationId, agentId) => {
        if (!ownedAgent(organizationId, agentId)) return false;
        data.agents.delete(agentId);
        return true;
      },
    },

    sessions: {
      create: async (input) => {
        const row: VoiceSessionRow = {
          ...input,
          status: "active",
          startedAt: now(),
          endedAt: null,
          durationSeconds: null,
        };
        data.sessions.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.sessions.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByOrg: async (organizationId) =>
        [...data.sessions.values()].filter((s) => s.organizationId === organizationId),
      patch: async (id, organizationId, changes) => {
        const row = data.sessions.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...changes };
        data.sessions.set(id, next);
        return next;
      },
    },

    messages: {
      append: async ({ organizationId, sessionId, role, content, latencyMs = null }) => {
        const row: MessageRow = {
          id: newId("msg"),
          organizationId,
          sessionId,
          role,
          content,
          latencyMs,
          timestamp: now(),
        };
        data.messages.set(row.id, row);
        return row;
      },
      listBySession: async (sessionId, organizationId) =>
        [...data.messages.values()]
          .filter((m) => m.sessionId === sessionId && m.organizationId === organizationId)
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      countByOrg: async (organizationId) =>
        [...data.messages.values()].filter((m) => m.organizationId === organizationId).length,
    },

    usage: {
      record: async ({ organizationId, sessionId = null, eventType, quantity = 1, metadata = {} }) => {
        const row: UsageEventRow = {
          id: newId("use"),
          organizationId,
          sessionId,
          eventType,
          quantity,
          metadata,
          createdAt: now(),
        };
        data.usage.push(row);
        return row;
      },
      listByOrg: async (organizationId, sessionId) =>
        data.usage.filter(
          (u) =>
            u.organizationId === organizationId &&
            (sessionId === undefined || u.sessionId === sessionId)
        ),
      summarize: async (organizationId, sessionId) => {
        const rows = data.usage.filter(
          (u) =>
            u.organizationId === organizationId &&
            (sessionId === undefined || u.sessionId === sessionId)
        );
        const byEventType: Record<string, number> = {};
        const summary: UsageSummary = {
          sessions: 0,
          messages: 0,
          aiRequests: 0,
          characters: 0,
          audioSeconds: 0,
          byEventType,
        };
        for (const row of rows) {
          byEventType[row.eventType] = (byEventType[row.eventType] ?? 0) + row.quantity;
          if (row.eventType === "voice_session" || row.eventType === "session_started")
            summary.sessions += 1;
          if (row.eventType === "message") summary.messages += 1;
          if (row.eventType === "ai_request") summary.aiRequests += 1;
          if (row.eventType === "characters") summary.characters += row.quantity;
          if (row.eventType === "audio_seconds") summary.audioSeconds += row.quantity;
        }
        return summary;
      },
    },

    reset: async () => {
      data = seed();
    },
  };
}

/**
 * Storage selection.
 *  • Demo Mode (or no DATABASE_URL) → in-memory repository. No external database is required.
 *  • APP_MODE=production without DATABASE_URL → clear config error, never a silent downgrade.
 *  • APP_MODE=production with DATABASE_URL → the adapter injects the Prisma repository; this
 *    factory refuses so a production process can never boot onto volatile memory by accident.
 */
export function createStore(env: ServerEnv): Db {
  if (env.appMode === "demo" || env.database.driver === "memory") {
    return createMemoryDb();
  }
  throw configInvalid([
    "Postgres repository must be injected — createApp({ db: await createPrismaDb() })",
  ]);
}
