/**
 * Phase 19 — Platform Admin Service
 * 
 * Central service for platform administration operations.
 * Provides organization lifecycle management, user administration,
 * provider/connector management, and platform analytics.
 */

import type { Db } from "../db/store";
import type { Logger } from "../lib/observability";
import { ApiError } from "../lib/observability";
import type { OrgStatus } from "../../shared/contracts";

/**
 * Organization lifecycle actions
 */
export type OrgLifecycleAction = "activate" | "suspend" | "archive";

/**
 * Platform admin service interface
 */
export interface PlatformAdminService {
  // Organization Management
  listOrganizations(filters?: OrgFilters): Promise<OrgListResult>;
  getOrganization(id: string): Promise<OrgDetail>;
  updateOrganizationLifecycle(id: string, action: OrgLifecycleAction, reason: string, actorId: string): Promise<void>;
  
  // User Administration
  listUsers(filters?: UserFilters): Promise<UserListResult>;
  getUser(id: string): Promise<UserDetail>;
  updateUserStatus(id: string, status: "active" | "disabled", actorId: string): Promise<void>;
  
  // Platform Analytics
  getPlatformOverview(): Promise<PlatformOverview>;
  getPlatformUsage(range?: TimeRange): Promise<PlatformUsage>;
  getPlatformHealth(): Promise<PlatformHealth>;
  
  // Audit
  getAuditLog(filters?: AuditFilters): Promise<AuditLogResult>;
}

export interface OrgFilters {
  status?: OrgStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface OrgListResult {
  organizations: OrgSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  createdAt: string;
  userCount: number;
  agentCount: number;
  subscriptionStatus?: string;
}

export interface OrgDetail extends OrgSummary {
  subscription?: {
    id: string;
    planName: string;
    status: string;
    startedAt: string;
  };
  entitlements: string[];
  usage: {
    sessions: number;
    calls: number;
    audioSeconds: number;
  };
}

export interface UserFilters {
  organizationId?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface UserListResult {
  users: UserSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  organizationId: string | null;
  organizationName?: string;
  createdAt: string;
}

export interface UserDetail extends UserSummary {
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface PlatformOverview {
  organizations: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
  };
  users: {
    total: number;
    active: number;
  };
  agents: {
    total: number;
    active: number;
  };
  sessions: {
    total: number;
    active: number;
    completed: number;
    failed: number;
  };
  calls: {
    total: number;
    inbound: number;
    outbound: number;
    completed: number;
    failed: number;
  };
  subscriptions: {
    total: number;
    active: number;
    trial: number;
  };
  providers: number;
  connectors: number;
  generatedAt: string;
}

export interface TimeRange {
  startDate: string;
  endDate: string;
}

export interface PlatformUsage {
  period: TimeRange;
  byOrganization: Array<{
    organizationId: string;
    organizationName: string;
    sessions: number;
    calls: number;
    audioSeconds: number;
    aiRequests: number;
  }>;
  totals: {
    sessions: number;
    calls: number;
    audioSeconds: number;
    aiRequests: number;
  };
}

export interface PlatformHealth {
  database: string;
  providers: Array<{
    id: string;
    name: string;
    category: string;
    status: string;
  }>;
  connectors: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
  generatedAt: string;
}

export interface AuditFilters {
  organizationId?: string;
  action?: string;
  actorId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogResult {
  events: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditEvent {
  id: string;
  organizationId: string | null;
  action: string;
  actorId: string;
  actorEmail: string;
  metadata: Record<string, any>;
  createdAt: string;
}

/**
 * Create platform admin service
 */
export function createPlatformAdminService(db: Db, logger: Logger): PlatformAdminService {
  return {
    async listOrganizations(filters?: OrgFilters): Promise<OrgListResult> {
      const limit = filters?.limit ?? 50;
      const offset = filters?.offset ?? 0;
      
      const allOrgs = await db.organizations.list();
      
      // Apply filters
      let filtered = allOrgs;
      if (filters?.status) {
        filtered = filtered.filter((o) => o.status === filters.status);
      }
      if (filters?.search) {
        const search = filters.search.toLowerCase();
        filtered = filtered.filter(
          (o) => o.name.toLowerCase().includes(search) || o.slug.toLowerCase().includes(search)
        );
      }
      
      // Paginate
      const paginated = filtered.slice(offset, offset + limit);
      
      // Enrich with counts
      const organizations: OrgSummary[] = await Promise.all(
        paginated.map(async (org) => {
          const [users, agents, subscription] = await Promise.all([
            db.users.listByOrg(org.id),
            db.agents.listByOrg(org.id),
            db.subscriptions.getByOrg(org.id),
          ]);
          
          return {
            id: org.id,
            name: org.name,
            slug: org.slug,
            status: org.status,
            createdAt: org.createdAt,
            userCount: users.length,
            agentCount: agents.length,
            subscriptionStatus: subscription?.status,
          };
        })
      );
      
      return {
        organizations,
        total: filtered.length,
        limit,
        offset,
      };
    },
    
    async getOrganization(id: string): Promise<OrgDetail> {
      const org = await db.organizations.get(id);
      if (!org) {
        throw new ApiError("NOT_FOUND", "Organization not found");
      }
      
      const [users, agents, subscription] = await Promise.all([
        db.users.listByOrg(id),
        db.agents.listByOrg(id),
        db.subscriptions.getByOrg(id),
      ]);
      
      // Get entitlements from subscription plan
      let entitlements: string[] = [];
      if (subscription) {
        const plan = await db.plans.get(subscription.planId);
        if (plan) {
          entitlements = plan.features;
        }
      }
      
      // Get usage
      const [sessions, calls, usage] = await Promise.all([
        db.sessions.listByOrg(id),
        db.calls.listByOrg(id),
        db.usage.listByOrg(id),
      ]);
      
      const audioSeconds = usage
        .filter((u) => u.eventType === "audio_seconds")
        .reduce((sum, u) => sum + u.quantity, 0);
      
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        createdAt: org.createdAt,
        userCount: users.length,
        agentCount: agents.length,
        subscriptionStatus: subscription?.status,
        subscription: subscription
          ? {
              id: subscription.id,
              planName: (await db.plans.get(subscription.planId))?.name ?? "Unknown",
              status: subscription.status,
              startedAt: subscription.startedAt,
            }
          : undefined,
        entitlements,
        usage: {
          sessions: sessions.length,
          calls: calls.length,
          audioSeconds,
        },
      };
    },
    
    async updateOrganizationLifecycle(
      id: string,
      action: OrgLifecycleAction,
      reason: string,
      actorId: string
    ): Promise<void> {
      const org = await db.organizations.get(id);
      if (!org) {
        throw new ApiError("NOT_FOUND", "Organization not found");
      }
      
      const statusMap: Record<OrgLifecycleAction, OrgStatus> = {
        activate: "active",
        suspend: "suspended",
        archive: "suspended",
      };
      
      await db.organizations.update(id, { status: statusMap[action] });
      
      // Audit log
      await db.audit.create({
        organizationId: id,
        action: `organization.${action}`,
        actorId,
        actorEmail: "platform_admin",
        metadata: {
          previousStatus: org.status,
          newStatus: statusMap[action],
          reason,
        },
      });
      
      logger.info(`organization_${action}`, {
        organizationId: id,
        actorId,
        reason,
      });
    },
    
    async listUsers(filters?: UserFilters): Promise<UserListResult> {
      const limit = filters?.limit ?? 50;
      const offset = filters?.offset ?? 0;
      
      let allUsers: Array<{ id: string; email: string; name: string; role: string; status: string; organizationId: string | null; createdAt: string }>;
      
      if (filters?.organizationId) {
        const users = await db.users.listByOrg(filters.organizationId);
        allUsers = users;
      } else {
        const orgs = await db.organizations.list();
        const usersByOrg = await Promise.all(orgs.map((o) => db.users.listByOrg(o.id)));
        allUsers = usersByOrg.flat();
      }
      
      // Apply filters
      let filtered = allUsers;
      if (filters?.status) {
        filtered = filtered.filter((u) => u.status === filters.status);
      }
      if (filters?.search) {
        const search = filters.search.toLowerCase();
        filtered = filtered.filter(
          (u) => u.email.toLowerCase().includes(search) || u.name.toLowerCase().includes(search)
        );
      }
      
      // Paginate
      const paginated = filtered.slice(offset, offset + limit);
      
      // Enrich with organization names
      const users: UserSummary[] = await Promise.all(
        paginated.map(async (user) => {
          let organizationName: string | undefined;
          if (user.organizationId) {
            const org = await db.organizations.get(user.organizationId);
            organizationName = org?.name;
          }
          
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
            organizationId: user.organizationId,
            organizationName,
            createdAt: user.createdAt,
          };
        })
      );
      
      return {
        users,
        total: filtered.length,
        limit,
        offset,
      };
    },
    
    async getUser(id: string): Promise<UserDetail> {
      const orgs = await db.organizations.list();
      let user: any = null;
      
      for (const org of orgs) {
        const users = await db.users.listByOrg(org.id);
        const found = users.find((u) => u.id === id);
        if (found) {
          user = found;
          break;
        }
      }
      
      if (!user) {
        throw new ApiError("NOT_FOUND", "User not found");
      }
      
      let organization: { id: string; name: string; slug: string } | undefined;
      if (user.organizationId) {
        const org = await db.organizations.get(user.organizationId);
        if (org) {
          organization = {
            id: org.id,
            name: org.name,
            slug: org.slug,
          };
        }
      }
      
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        organizationId: user.organizationId,
        organization,
        createdAt: user.createdAt,
      };
    },
    
    async updateUserStatus(id: string, status: "active" | "disabled", actorId: string): Promise<void> {
      const orgs = await db.organizations.list();
      let updated = false;
      
      for (const org of orgs) {
        const users = await db.users.listByOrg(org.id);
        const user = users.find((u) => u.id === id);
        if (user) {
          await db.users.update(org.id, id, { status });
          updated = true;
          
          await db.audit.create({
            organizationId: org.id,
            action: "user.status_changed",
            actorId,
            actorEmail: "platform_admin",
            metadata: {
              userId: id,
              previousStatus: user.status,
              newStatus: status,
            },
          });
          
          break;
        }
      }
      
      if (!updated) {
        throw new ApiError("NOT_FOUND", "User not found");
      }
    },
    
    async getPlatformOverview(): Promise<PlatformOverview> {
      const orgs = await db.organizations.list();
      
      const [allUsers, allAgents, allSessions, allCalls, allSubscriptions] = await Promise.all([
        Promise.all(orgs.map((o) => db.users.listByOrg(o.id))),
        Promise.all(orgs.map((o) => db.agents.listByOrg(o.id))),
        Promise.all(orgs.map((o) => db.sessions.listByOrg(o.id))),
        Promise.all(orgs.map((o) => db.calls.listByOrg(o.id))),
        Promise.all(orgs.map((o) => db.subscriptions.getByOrg(o.id))),
      ]);
      
      const users = allUsers.flat();
      const agents = allAgents.flat();
      const sessions = allSessions.flat();
      const calls = allCalls.flat();
      const subscriptions = allSubscriptions.filter((s): s is NonNullable<typeof s> => s !== null && s !== undefined);
      
      return {
        organizations: {
          total: orgs.length,
          active: orgs.filter((o) => o.status === "active").length,
          trial: orgs.filter((o) => o.status === "trial").length,
          suspended: orgs.filter((o) => o.status === "suspended").length,
        },
        users: {
          total: users.length,
          active: users.filter((u) => u.status === "active").length,
        },
        agents: {
          total: agents.length,
          active: agents.filter((a) => a.status === "active").length,
        },
        sessions: {
          total: sessions.length,
          active: sessions.filter((s) => s.status === "active").length,
          completed: sessions.filter((s) => s.status === "completed").length,
          failed: sessions.filter((s) => s.status === "failed").length,
        },
        calls: {
          total: calls.length,
          inbound: calls.filter((c) => c.direction === "inbound").length,
          outbound: calls.filter((c) => c.direction === "outbound").length,
          completed: calls.filter((c) => c.status === "completed").length,
          failed: calls.filter((c) => c.status === "failed").length,
        },
        subscriptions: {
          total: subscriptions.length,
          active: subscriptions.filter((s) => s.status === "active").length,
          trial: subscriptions.filter((s) => s.status === "trial").length,
        },
        providers: 0,
        connectors: 0,
        generatedAt: new Date().toISOString(),
      };
    },
    
    async getPlatformUsage(range?: TimeRange): Promise<PlatformUsage> {
      const orgs = await db.organizations.list();
      
      const usageByOrg = await Promise.all(
        orgs.map(async (org) => {
          const usage = await db.usage.listByOrg(org.id);
          const sessions = await db.sessions.listByOrg(org.id);
          const calls = await db.calls.listByOrg(org.id);
          
          const audioSeconds = usage
            .filter((u) => u.eventType === "audio_seconds")
            .reduce((sum, u) => sum + u.quantity, 0);
          
          const aiRequests = usage.filter((u) => u.eventType === "ai_request").length;
          
          return {
            organizationId: org.id,
            organizationName: org.name,
            sessions: sessions.length,
            calls: calls.length,
            audioSeconds,
            aiRequests,
          };
        })
      );
      
      const totals = usageByOrg.reduce(
        (acc, curr) => ({
          sessions: acc.sessions + curr.sessions,
          calls: acc.calls + curr.calls,
          audioSeconds: acc.audioSeconds + curr.audioSeconds,
          aiRequests: acc.aiRequests + curr.aiRequests,
        }),
        { sessions: 0, calls: 0, audioSeconds: 0, aiRequests: 0 }
      );
      
      return {
        period: range ?? {
          startDate: new Date(0).toISOString(),
          endDate: new Date().toISOString(),
        },
        byOrganization: usageByOrg,
        totals,
      };
    },
    
    async getPlatformHealth(): Promise<PlatformHealth> {
      let databaseStatus = "healthy";
      try {
        await db.organizations.list();
      } catch {
        databaseStatus = "unhealthy";
      }
      
      const orgs = await db.organizations.list();
      const allConnectors = await Promise.all(orgs.map((o) => db.connectors.listByOrg(o.id)));
      const connectors = allConnectors.flat();
      
      return {
        database: databaseStatus,
        providers: [],
        connectors: {
          total: connectors.length,
          healthy: 0,
          degraded: 0,
          unhealthy: 0,
        },
        generatedAt: new Date().toISOString(),
      };
    },
    
    async getAuditLog(filters?: AuditFilters): Promise<AuditLogResult> {
      const limit = filters?.limit ?? 100;
      const offset = filters?.offset ?? 0;
      
      const orgs = await db.organizations.list();
      const allEvents = await Promise.all(orgs.map((o) => db.audit.listByOrg(o.id, 1000)));
      const events = allEvents.flat();
      
      let filtered = events;
      if (filters?.organizationId) {
        filtered = filtered.filter((e) => e.organizationId === filters.organizationId);
      }
      if (filters?.action) {
        filtered = filtered.filter((e) => e.action === filters.action);
      }
      if (filters?.actorId) {
        filtered = filtered.filter((e) => e.actorId === filters.actorId);
      }
      
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const paginated = filtered.slice(offset, offset + limit);
      
      return {
        events: paginated.map((e) => ({
          id: e.id,
          organizationId: e.organizationId,
          action: e.action,
          actorId: e.actorId,
          actorEmail: e.actorEmail,
          metadata: e.metadata,
          createdAt: e.createdAt,
        })),
        total: filtered.length,
        limit,
        offset,
      };
    },
  };
}
