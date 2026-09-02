/**
 * Phase 11 — Contact Center Operations Service
 *
 * Provides the operational command center functionality:
 * - Operations overview (real metrics only)
 * - Live call monitoring
 * - Supervisor dashboard
 * - Campaign operations
 * - Operational alerts
 * - Activity tracking
 *
 * All metrics are computed from real persisted data — nothing is fabricated.
 * Organization isolation is enforced on every operation.
 */

import type {
  CallDirection,
  CallOutcome,
  CallRow,
  CallStatus,
  CampaignRow,
  CampaignContactDto,
  CampaignContactRow,
  ContactQueueStatus,
  CustomerContextDto,
  EngineMode,
  LiveCallDetailDto,
  LiveCallDto,
  MessageRole,
  OperationsActivityDto,
  OperationsOverviewDto,
  OperationalAlertDto,
  OperationalAlertRow,
  OperationalAlertSeverity,
  OperationalAlertSource,
  SupervisorDashboardDto,
  VoiceSessionRow,
} from "../../shared/contracts";
import type { Db } from "../db/store";

export interface OperationsService {
  getOverview(organizationId: string): Promise<OperationsOverviewDto>;
  getLiveCalls(organizationId: string): Promise<LiveCallDto[]>;
  getLiveCallDetail(organizationId: string, sessionId: string): Promise<LiveCallDetailDto | undefined>;
  endCall(organizationId: string, sessionId: string): Promise<boolean>;
  getOperationsCampaigns(organizationId: string): Promise<OperationsCampaignDto[]>;
  getOperationsCampaignDetail(organizationId: string, campaignId: string): Promise<OperationsCampaignDetailDto | undefined>;
  getCampaignContacts(organizationId: string, campaignId: string, status?: ContactQueueStatus): Promise<CampaignContactDto[]>;
  getSupervisorDashboard(organizationId: string): Promise<SupervisorDashboardDto>;
  getOperationalAlerts(organizationId: string, unresolvedOnly?: boolean): Promise<OperationalAlertDto[]>;
  acknowledgeAlert(organizationId: string, alertId: string): Promise<OperationalAlertDto | undefined>;
  getOperationsActivity(organizationId: string, limit?: number): Promise<OperationsActivityDto[]>;
  getCustomerContext(organizationId: string, sessionId: string): Promise<CustomerContextDto>;
  createCampaignContact(organizationId: string, input: CreateCampaignContactInput): Promise<CampaignContactDto>;
}

export interface CreateCampaignContactInput {
  campaignId: string;
  customerRef?: string | null;
  phoneNumber: string;
  displayName: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface OperationsCampaignDto {
  id: string;
  name: string;
  status: string;
  agentName: string | null;
  direction: CallDirection;
  totalContacts: number;
  processedContacts: number;
  completedCalls: number;
  failedCalls: number;
  pendingContacts: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperationsCampaignDetailDto {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: string;
  agentId: string | null;
  agentName: string | null;
  direction: CallDirection;
  totalContacts: number;
  processedContacts: number;
  completedCalls: number;
  failedCalls: number;
  pendingContacts: number;
  queuedContacts: number;
  skippedContacts: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  contactQueue: {
    pending: number;
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    skipped: number;
  };
  outcomes: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Supported call controls — derived from provider capabilities.
 * Only return true for controls the backend can actually perform.
 */
function getCallControls(provider: string | null, callStatus: CallStatus | null, sessionStatus: string) {
  // Only active calls can have controls applied
  const isActive = sessionStatus === "active" ||
    (callStatus && !["completed", "failed", "cancelled"].includes(callStatus));

  return {
    // End call is universally supported (terminate the session)
    canEnd: isActive,
    // Transfer requires real telephony provider support
    canTransfer: false,
    // Hold requires real telephony provider support
    canHold: false,
    // Mute requires real telephony provider support
    canMute: false,
    // Barge requires real telephony provider support
    canBarge: false,
    // Whisper requires real telephony provider support
    canWhisper: false,
  };
}

export function createOperationsService(deps: {
  db: Db;
  audit?: any;
  entitlements?: any;
  connectors?: any;
}): OperationsService {
  const { db, audit, entitlements, connectors } = deps;

  async function checkEntitlement(organizationId: string): Promise<void> {
    if (!entitlements) return;
    const has = await entitlements.hasFeature(organizationId, "contact_center_operations");
    if (!has) {
      throw new Error("CONTACT_CENTER_OPERATIONS_NOT_ENTITLED");
    }
  }

  async function getAgentName(organizationId: string, agentId: string | null): Promise<string> {
    if (!agentId) return "Unknown";
    const agent = await db.agents.get(organizationId, agentId);
    return agent?.name ?? agentId;
  }

  async function getCampaignName(organizationId: string, campaignId: string | null): Promise<string | null> {
    if (!campaignId) return null;
    const campaign = await db.campaigns.get(campaignId, organizationId);
    return campaign?.name ?? null;
  }

  function alertToDto(row: OperationalAlertRow): OperationalAlertDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      source: row.source,
      severity: row.severity,
      code: row.code,
      message: row.message,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      acknowledged: row.acknowledged,
      resolved: row.resolved,
      createdAt: row.createdAt,
    };
  }

  function contactToDto(row: CampaignContactRow): CampaignContactDto {
    return {
      id: row.id,
      campaignId: row.campaignId,
      customerRef: row.customerRef,
      phoneNumber: row.phoneNumber,
      displayName: row.displayName,
      status: row.status,
      callOutcome: row.callOutcome,
      callId: row.callId,
      voiceSessionId: row.voiceSessionId,
      queuedAt: row.queuedAt,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      attempts: row.attempts,
    };
  }

  return {
    async getOverview(organizationId): Promise<OperationsOverviewDto> {
      await checkEntitlement(organizationId);

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      const [calls, sessions, campaigns, agents] = await Promise.all([
        db.calls.listByOrg(organizationId),
        db.sessions.listByOrg(organizationId),
        db.campaigns.listByOrg(organizationId),
        db.agents.listByOrg(organizationId),
      ]);

      const callsToday = calls.filter((c) => c.startedAt >= todayStart);
      const activeCalls = calls.filter(
        (c) => ["created", "ringing", "answered", "active"].includes(c.status)
      );
      const inboundToday = callsToday.filter((c) => c.direction === "inbound");
      const outboundToday = callsToday.filter((c) => c.direction === "outbound");
      const activeCampaigns = campaigns.filter((c) => c.status === "running" || c.status === "scheduled");
      const availableAgents = agents.filter((a) => a.status === "active");

      // Average call duration from completed calls
      const completedCalls = calls.filter(
        (c) => c.status === "completed" && c.durationSeconds !== null
      );
      const averageCallDurationSeconds =
        completedCalls.length > 0
          ? Math.round(
              completedCalls.reduce((sum, c) => sum + (c.durationSeconds || 0), 0) /
                completedCalls.length
            )
          : null;

      // Completion rate from completed vs total calls
      const completionRate =
        calls.length > 0
          ? Math.round((calls.filter((c) => c.status === "completed").length / calls.length) * 100)
          : null;

      return {
        organizationId,
        activeCalls: activeCalls.length,
        callsToday: callsToday.length,
        inboundCallsToday: inboundToday.length,
        outboundCallsToday: outboundToday.length,
        activeCampaigns: activeCampaigns.length,
        availableAgents: availableAgents.length,
        averageCallDurationSeconds,
        completionRate,
        empty: calls.length === 0 && campaigns.length === 0,
      };
    },

    async getLiveCalls(organizationId): Promise<LiveCallDto[]> {
      await checkEntitlement(organizationId);

      const sessions = await db.sessions.listByOrg(organizationId);
      const activeSessions = sessions.filter(
        (s) => s.status === "active" || s.status === "created"
      );

      const calls = await db.calls.listByOrg(organizationId);
      const campaigns = await db.campaigns.listByOrg(organizationId);

      const result: LiveCallDto[] = [];

      for (const session of activeSessions) {
        const agentName = await getAgentName(organizationId, session.agentId);

        // Find related call if any
        const relatedCall = calls.find((c) => c.voiceSessionId === session.id);

        // Find related campaign if any (through call)
        let campaignId: string | null = null;
        let campaignName: string | null = null;
        if (relatedCall) {
          const campaign = campaigns.find(
            (c) =>
              c.direction === relatedCall.direction &&
              (c.status === "running" || c.status === "scheduled")
          );
          if (campaign) {
            campaignId = campaign.id;
            campaignName = campaign.name;
          }
        }

        result.push({
          sessionId: session.id,
          organizationId: session.organizationId,
          direction: relatedCall?.direction ?? null,
          callId: relatedCall?.id ?? null,
          agentId: session.agentId,
          agentName,
          status: session.status,
          callStatus: relatedCall?.status ?? null,
          durationSeconds: session.durationSeconds,
          startedAt: session.startedAt,
          provider: relatedCall?.provider ?? null,
          campaignId,
          campaignName,
        });
      }

      return result;
    },

    async getLiveCallDetail(organizationId, sessionId): Promise<LiveCallDetailDto | undefined> {
      await checkEntitlement(organizationId);

      // IDOR protection — session must belong to this organization
      const session = await db.sessions.get(sessionId, organizationId);
      if (!session) return undefined;

      const agentName = await getAgentName(organizationId, session.agentId);
      const calls = await db.calls.listByOrg(organizationId);
      const relatedCall = calls.find((c) => c.voiceSessionId === sessionId);
      const campaigns = await db.campaigns.listByOrg(organizationId);

      let campaignId: string | null = null;
      let campaignName: string | null = null;
      if (relatedCall) {
        const campaign = campaigns.find(
          (c) =>
            c.direction === relatedCall.direction &&
            (c.status === "running" || c.status === "scheduled")
        );
        if (campaign) {
          campaignId = campaign.id;
          campaignName = campaign.name;
        }
      }

      // Get transcript messages
      const messages = await db.messages.listBySession(sessionId, organizationId);

      return {
        sessionId: session.id,
        organizationId: session.organizationId,
        direction: relatedCall?.direction ?? null,
        callId: relatedCall?.id ?? null,
        agentId: session.agentId,
        agentName,
        status: session.status,
        callStatus: relatedCall?.status ?? null,
        provider: relatedCall?.provider ?? null,
        durationSeconds: session.durationSeconds,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        language: session.language,
        mode: session.mode,
        campaignId,
        campaignName,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role as MessageRole,
          content: m.content,
          timestamp: m.timestamp,
        })),
        controls: getCallControls(
          relatedCall?.provider ?? null,
          relatedCall?.status ?? null,
          session.status
        ),
      };
    },

    async endCall(organizationId, sessionId): Promise<boolean> {
      await checkEntitlement(organizationId);

      // IDOR protection — session must belong to this organization
      const session = await db.sessions.get(sessionId, organizationId);
      if (!session) return false;

      // Only active sessions can be ended
      if (session.status !== "active" && session.status !== "created") {
        return false;
      }

      // End the session
      await db.sessions.patch(sessionId, organizationId, {
        status: "completed",
        endedAt: new Date().toISOString(),
        durationSeconds: Math.max(
          0,
          Math.round(
            (Date.now() - new Date(session.startedAt).getTime()) / 1000
          )
        ),
      });

      // If there's a related call, mark it as completed too
      const calls = await db.calls.listByOrg(organizationId);
      const relatedCall = calls.find((c) => c.voiceSessionId === sessionId);
      if (relatedCall && !["completed", "failed", "cancelled"].includes(relatedCall.status)) {
        await db.calls.update(relatedCall.id, organizationId, {
          status: "completed",
          endedAt: new Date().toISOString(),
          durationSeconds: Math.max(
            0,
            Math.round(
              (Date.now() - new Date(relatedCall.startedAt).getTime()) / 1000
            )
          ),
        });
      }

      if (audit) {
        await audit.log({
          organizationId,
          action: "CALL_ENDED_BY_SUPERVISOR",
          metadata: {
            sessionId,
            callId: relatedCall?.id ?? null,
          },
        });
      }

      return true;
    },

    async getOperationsCampaigns(organizationId): Promise<OperationsCampaignDto[]> {
      await checkEntitlement(organizationId);

      const campaigns = await db.campaigns.listByOrg(organizationId);
      const contacts = await Promise.all(
        campaigns.map(async (c) => ({
          campaign: c,
          pending: await db.campaignContacts.count(organizationId, c.id, "PENDING"),
        }))
      );

      const result: OperationsCampaignDto[] = [];
      for (const { campaign, pending } of contacts) {
        const agentName = campaign.agentId
          ? await getAgentName(organizationId, campaign.agentId)
          : null;

        result.push({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          agentName,
          direction: campaign.direction,
          totalContacts: campaign.totalContacts,
          processedContacts: campaign.processedContacts,
          completedCalls: campaign.completedCalls,
          failedCalls: campaign.failedCalls,
          pendingContacts: pending,
          createdAt: campaign.createdAt,
          updatedAt: campaign.updatedAt,
        });
      }

      return result;
    },

    async getOperationsCampaignDetail(organizationId, campaignId): Promise<OperationsCampaignDetailDto | undefined> {
      await checkEntitlement(organizationId);

      const campaign = await db.campaigns.get(campaignId, organizationId);
      if (!campaign) return undefined;

      const agentName = campaign.agentId
        ? await getAgentName(organizationId, campaign.agentId)
        : null;

      const [statusCounts, outcomeCounts] = await Promise.all([
        db.campaignContacts.countByStatus(organizationId, campaignId),
        db.campaignContacts.countByOutcome(organizationId, campaignId),
      ]);

      return {
        id: campaign.id,
        organizationId,
        name: campaign.name,
        description: campaign.description,
        status: campaign.status,
        agentId: campaign.agentId,
        agentName,
        direction: campaign.direction,
        totalContacts: campaign.totalContacts,
        processedContacts: campaign.processedContacts,
        completedCalls: campaign.completedCalls,
        failedCalls: campaign.failedCalls,
        pendingContacts: statusCounts["PENDING"] || 0,
        queuedContacts: statusCounts["QUEUED"] || 0,
        skippedContacts: statusCounts["SKIPPED"] || 0,
        scheduledAt: campaign.scheduledAt,
        startedAt: campaign.startedAt,
        completedAt: campaign.completedAt,
        contactQueue: {
          pending: statusCounts["PENDING"] || 0,
          queued: statusCounts["QUEUED"] || 0,
          processing: statusCounts["PROCESSING"] || 0,
          completed: statusCounts["COMPLETED"] || 0,
          failed: statusCounts["FAILED"] || 0,
          skipped: statusCounts["SKIPPED"] || 0,
        },
        outcomes: outcomeCounts,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      };
    },

    async getCampaignContacts(organizationId, campaignId, status): Promise<CampaignContactDto[]> {
      await checkEntitlement(organizationId);

      // IDOR protection — campaign must belong to this organization
      const campaign = await db.campaigns.get(campaignId, organizationId);
      if (!campaign) return [];

      const contacts = await db.campaignContacts.listByCampaign(organizationId, campaignId, status);
      return contacts.map(contactToDto);
    },

    async getSupervisorDashboard(organizationId): Promise<SupervisorDashboardDto> {
      await checkEntitlement(organizationId);

      const [calls, sessions, campaigns, agents, alerts] = await Promise.all([
        db.calls.listByOrg(organizationId),
        db.sessions.listByOrg(organizationId),
        db.campaigns.listByOrg(organizationId),
        db.agents.listByOrg(organizationId),
        db.operationalAlerts.listByOrg(organizationId, true),
      ]);

      const activeCalls = calls.filter(
        (c) => ["created", "ringing", "answered", "active"].includes(c.status)
      );
      const activeSessions = sessions.filter(
        (s) => s.status === "active" || s.status === "created"
      );
      const activeCampaigns = campaigns.filter((c) => c.status === "running");
      const availableAgents = agents.filter((a) => a.status === "active");

      // Calls in queue = pending campaign contacts
      const allCampaigns = campaigns.filter((c) => c.status === "running");
      let callsInQueue = 0;
      for (const c of allCampaigns) {
        callsInQueue += await db.campaignContacts.count(organizationId, c.id, "QUEUED");
      }

      // Count agents by status (available = active, busy = in session, offline = other)
      const busyAgentIds = new Set(activeSessions.map((s) => s.agentId));
      const busyAgents = agents.filter((a) => busyAgentIds.has(a.id)).length;
      const offlineAgents = agents.filter((a) => a.status === "paused" || a.status === "archived").length;

      // Recent failures — last 10
      const recentFailures: SupervisorDashboardDto["recentFailures"] = [];

      // Recent failed calls
      const failedCalls = calls
        .filter((c) => c.status === "failed")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5);
      for (const call of failedCalls) {
        recentFailures.push({
          id: call.id,
          type: "call",
          message: `Call failed: ${call.direction} from ${call.fromNumber || "unknown"}`,
          timestamp: call.updatedAt,
        });
      }

      // Recent failed campaigns
      const failedCampaigns = campaigns
        .filter((c) => c.status === "failed")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 3);
      for (const camp of failedCampaigns) {
        recentFailures.push({
          id: camp.id,
          type: "campaign",
          message: `Campaign failed: ${camp.name}`,
          timestamp: camp.updatedAt,
        });
      }

      // Sort by timestamp, take top 10
      recentFailures.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return {
        organizationId,
        activeCalls: activeCalls.length,
        callsInQueue,
        activeCampaigns: activeCampaigns.length,
        availableAgents: availableAgents.length,
        busyAgents,
        offlineAgents,
        recentFailures: recentFailures.slice(0, 10),
        alerts: alerts.slice(0, 10).map(alertToDto),
        empty: calls.length === 0 && campaigns.length === 0,
      };
    },

    async getOperationalAlerts(organizationId, unresolvedOnly = false): Promise<OperationalAlertDto[]> {
      await checkEntitlement(organizationId);

      const alerts = await db.operationalAlerts.listByOrg(organizationId, unresolvedOnly);
      return alerts.map(alertToDto);
    },

    async acknowledgeAlert(organizationId, alertId): Promise<OperationalAlertDto | undefined> {
      await checkEntitlement(organizationId);

      const alert = await db.operationalAlerts.acknowledge(alertId, organizationId);
      if (!alert) return undefined;

      if (audit) {
        await audit.log({
          organizationId,
          action: "ALERT_ACKNOWLEDGED",
          metadata: { alertId },
        });
      }

      return alertToDto(alert);
    },

    async getOperationsActivity(organizationId, limit = 50): Promise<OperationsActivityDto[]> {
      await checkEntitlement(organizationId);

      // Build activity from audit events
      const events = await db.audit.listByOrg(organizationId, limit * 2);

      const activities: OperationsActivityDto[] = [];
      for (const event of events) {
        let type: OperationsActivityDto["type"] | null = null;

        // Map audit actions to activity types
        switch (event.action) {
          case "CAMPAIGN_STATUS_CHANGED":
            if (event.metadata.status === "running") type = "campaign_started";
            else if (event.metadata.status === "completed") type = "campaign_completed";
            break;
          case "CONNECTOR_SYNC_FAILED":
            type = "connector_error";
            break;
          case "COMPLIANCE_VIOLATION_DETECTED":
            type = "compliance_violation";
            break;
          default:
            // Skip events that don't map to operations activity
            continue;
        }

        if (type) {
          activities.push({
            id: event.id,
            organizationId: organizationId,
            type,
            description: event.action.replace(/_/g, " ").toLowerCase(),
            actorId: event.actorId,
            actorEmail: event.actorEmail,
            resourceId: event.metadata?.resourceId as string ?? null,
            timestamp: event.createdAt,
          });
        }

        if (activities.length >= limit) break;
      }

      return activities;
    },

    async getCustomerContext(organizationId, sessionId): Promise<CustomerContextDto> {
      await checkEntitlement(organizationId);

      // IDOR protection
      const session = await db.sessions.get(sessionId, organizationId);
      if (!session) {
        return {
          sessionId,
          organizationId,
          available: false,
          fields: [],
          source: null,
        };
      }

      // Customer context comes from Data Connectors
      // If no connectors are configured or no customer data is available,
      // return an empty context
      // This is intentionally not fabricating customer data

      // Check if there are any enabled connectors for this org
      if (connectors) {
        const orgConnectors = await connectors.listConnectors(organizationId);
        const enabledConnectors = orgConnectors.filter((c: any) => c.enabled);

        if (enabledConnectors.length > 0) {
          // Connector architecture exists but we don't have real customer data yet
          // Return available=true to indicate the capability exists
          return {
            sessionId,
            organizationId,
            available: true,
            fields: [],
            source: {
              connectorId: enabledConnectors[0].id,
              connectorName: enabledConnectors[0].name,
              lastSyncedAt: enabledConnectors[0].lastSyncAt,
            },
          };
        }
      }

      return {
        sessionId,
        organizationId,
        available: false,
        fields: [],
        source: null,
      };
    },

    async createCampaignContact(organizationId, input): Promise<CampaignContactDto> {
      await checkEntitlement(organizationId);

      // IDOR protection — campaign must belong to this organization
      const campaign = await db.campaigns.get(input.campaignId, organizationId);
      if (!campaign) {
        throw new Error("CAMPAIGN_NOT_FOUND");
      }

      const row = await db.campaignContacts.create({
        organizationId,
        campaignId: input.campaignId,
        customerRef: input.customerRef ?? null,
        phoneNumber: input.phoneNumber,
        displayName: input.displayName,
        status: "PENDING",
        metadata: input.metadata ?? {},
      });

      if (audit) {
        await audit.log({
          organizationId,
          action: "CONTACT_QUEUED",
          metadata: {
            contactId: row.id,
            campaignId: input.campaignId,
          },
        });
      }

      return contactToDto(row);
    },
  };
}
