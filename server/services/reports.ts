/**
 * Reporting Service — Phase 10C
 *
 * Generates organization-scoped reports from real persisted data.
 * Never fabricates metrics. Shows empty states when no data exists.
 * Supports filtering and export.
 */

import type {
  ReportFilter,
  VoiceOperationsReport,
  AgentPerformanceReport,
  CampaignReport,
} from "../../shared/contracts";
import type { Db } from "../db/store";

export interface ReportService {
  /** Generate voice operations report */
  generateVoiceReport(organizationId: string, filter: ReportFilter): Promise<VoiceOperationsReport>;

  /** Generate agent performance report */
  generateAgentReport(organizationId: string, filter: ReportFilter): Promise<AgentPerformanceReport>;

  /** Generate campaign report */
  generateCampaignReport(organizationId: string, filter: ReportFilter): Promise<CampaignReport>;

  /** Export report data to CSV */
  exportToCSV(data: any[], columns: string[]): string;
}

/** Neutralize spreadsheet formulas before RFC-4180-style escaping. */
export function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const text = /^[\u0009\u000d\u0020]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Create the reporting service.
 */
export function createReportService(db: Db): ReportService {
  return {
    /**
     * Generate voice operations report.
     * Computes metrics from real call data within the specified date range.
     */
    async generateVoiceReport(
      organizationId: string,
      filter: ReportFilter
    ): Promise<VoiceOperationsReport> {
      const startDate = filter.startDate ? new Date(filter.startDate) : new Date("2020-01-01");
      const endDate = filter.endDate ? new Date(filter.endDate) : new Date();

      // Fetch all calls for the organization
      let calls = await db.calls.listByOrg(organizationId);

      // Filter by date range
      calls = calls.filter((c) => {
        const callDate = new Date(c.startedAt);
        return callDate >= startDate && callDate <= endDate;
      });

      // Filter by direction if specified
      if (filter.direction) {
        calls = calls.filter((c) => c.direction === filter.direction);
      }

      // Filter by status if specified
      if (filter.status) {
        calls = calls.filter((c) => c.status === filter.status);
      }

      // Fetch agents for name resolution
      const agents = await db.agents.listByOrg(organizationId);
      const agentMap = new Map(agents.map((a) => [a.id, a.name]));

      // Calculate summary metrics
      const inboundCalls = calls.filter((c) => c.direction === "inbound").length;
      const outboundCalls = calls.filter((c) => c.direction === "outbound").length;
      const completedCalls = calls.filter((c) => c.status === "completed").length;
      const failedCalls = calls.filter((c) => c.status === "failed").length;
      const cancelledCalls = calls.filter((c) => c.status === "cancelled").length;
      const activeCalls = calls.filter((c) =>
        ["active", "answered", "ringing", "created"].includes(c.status)
      ).length;

      const callsWithDuration = calls.filter((c) => c.durationSeconds !== null);
      const totalDuration = callsWithDuration.reduce((sum, c) => sum + (c.durationSeconds || 0), 0);
      const averageDuration =
        callsWithDuration.length > 0 ? totalDuration / callsWithDuration.length : null;

      // Group by day
      const byDayMap = new Map<
        string,
        { total: number; inbound: number; outbound: number; completed: number; failed: number }
      >();

      for (const call of calls) {
        const dateKey = new Date(call.startedAt).toISOString().split("T")[0];
        const existing = byDayMap.get(dateKey) || {
          total: 0,
          inbound: 0,
          outbound: 0,
          completed: 0,
          failed: 0,
        };

        existing.total++;
        if (call.direction === "inbound") existing.inbound++;
        if (call.direction === "outbound") existing.outbound++;
        if (call.status === "completed") existing.completed++;
        if (call.status === "failed") existing.failed++;

        byDayMap.set(dateKey, existing);
      }

      const byDay = Array.from(byDayMap.entries())
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Group by agent
      const byAgentMap = new Map<
        string,
        {
          agentId: string;
          agentName: string;
          totalCalls: number;
          completedCalls: number;
          failedCalls: number;
          totalDuration: number;
          countWithDuration: number;
        }
      >();

      for (const call of calls) {
        if (!call.agentId) continue;

        const agentName = agentMap.get(call.agentId) || "Unknown";
        const existing = byAgentMap.get(call.agentId) || {
          agentId: call.agentId,
          agentName,
          totalCalls: 0,
          completedCalls: 0,
          failedCalls: 0,
          totalDuration: 0,
          countWithDuration: 0,
        };

        existing.totalCalls++;
        if (call.status === "completed") existing.completedCalls++;
        if (call.status === "failed") existing.failedCalls++;
        if (call.durationSeconds !== null) {
          existing.totalDuration += call.durationSeconds;
          existing.countWithDuration++;
        }

        byAgentMap.set(call.agentId, existing);
      }

      const byAgent = Array.from(byAgentMap.values()).map((a) => ({
        agentId: a.agentId,
        agentName: a.agentName,
        totalCalls: a.totalCalls,
        completedCalls: a.completedCalls,
        failedCalls: a.failedCalls,
        averageDurationSeconds:
          a.countWithDuration > 0 ? a.totalDuration / a.countWithDuration : null,
      }));

      return {
        organizationId,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        summary: {
          totalCalls: calls.length,
          inboundCalls,
          outboundCalls,
          completedCalls,
          failedCalls,
          cancelledCalls,
          activeCalls,
          averageDurationSeconds: averageDuration,
          totalDurationSeconds: totalDuration,
        },
        byDay,
        byAgent,
        filters: filter,
        empty: calls.length === 0,
      };
    },

    /**
     * Generate agent performance report.
     * Computes per-agent metrics from real session data.
     */
    async generateAgentReport(
      organizationId: string,
      filter: ReportFilter
    ): Promise<AgentPerformanceReport> {
      const startDate = filter.startDate ? new Date(filter.startDate) : new Date("2020-01-01");
      const endDate = filter.endDate ? new Date(filter.endDate) : new Date();

      // Fetch agents
      let agents = await db.agents.listByOrg(organizationId);

      // Filter by agent if specified
      if (filter.agentId) {
        agents = agents.filter((a) => a.id === filter.agentId);
      }

      // Fetch all sessions for the organization
      let sessions = await db.sessions.listByOrg(organizationId);

      // Filter by date range
      sessions = sessions.filter((s) => {
        const sessionDate = new Date(s.startedAt);
        return sessionDate >= startDate && sessionDate <= endDate;
      });

      // Filter by agent if specified
      if (filter.agentId) {
        sessions = sessions.filter((s) => s.agentId === filter.agentId);
      }

      // Calculate summary
      const totalAgents = agents.length;
      const activeAgents = agents.filter((a) => a.status === "active").length;
      const totalSessions = sessions.length;
      const completedSessions = sessions.filter((s) => s.status === "completed").length;
      const failedSessions = sessions.filter((s) => s.status === "failed").length;

      // Build per-agent metrics
      const agentMetrics = agents.map((agent) => {
        const agentSessions = sessions.filter((s) => s.agentId === agent.id);
        const agentCompleted = agentSessions.filter((s) => s.status === "completed");
        const agentFailed = agentSessions.filter((s) => s.status === "failed");

        const sessionsWithDuration = agentSessions.filter((s) => s.durationSeconds !== null);
        const totalDuration = sessionsWithDuration.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
        const averageDuration =
          sessionsWithDuration.length > 0 ? totalDuration / sessionsWithDuration.length : null;

        const completionRate =
          agentSessions.length > 0 ? (agentCompleted.length / agentSessions.length) * 100 : 0;

        return {
          agentId: agent.id,
          agentName: agent.name,
          status: agent.status,
          totalSessions: agentSessions.length,
          completedSessions: agentCompleted.length,
          failedSessions: agentFailed.length,
          completionRate,
          averageDurationSeconds: averageDuration,
        };
      });

      const averageCompletionRate =
        agentMetrics.length > 0
          ? agentMetrics.reduce((sum, a) => sum + a.completionRate, 0) / agentMetrics.length
          : 0;

      return {
        organizationId,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        summary: {
          totalAgents,
          activeAgents,
          totalSessions,
          completedSessions,
          failedSessions,
          averageCompletionRate,
        },
        agents: agentMetrics,
        filters: filter,
        empty: sessions.length === 0,
      };
    },

    /**
     * Generate campaign report.
     * Computes campaign metrics from real campaign data.
     */
    async generateCampaignReport(
      organizationId: string,
      filter: ReportFilter
    ): Promise<CampaignReport> {
      const startDate = filter.startDate ? new Date(filter.startDate) : new Date("2020-01-01");
      const endDate = filter.endDate ? new Date(filter.endDate) : new Date();

      // Fetch all campaigns for the organization
      let campaigns = await db.campaigns.listByOrg(organizationId);

      // Filter by date range
      campaigns = campaigns.filter((c) => {
        const campaignDate = new Date(c.createdAt);
        return campaignDate >= startDate && campaignDate <= endDate;
      });

      // Fetch agents for name resolution
      const agents = await db.agents.listByOrg(organizationId);
      const agentMap = new Map(agents.map((a) => [a.id, a.name]));

      // Calculate summary
      const totalCampaigns = campaigns.length;
      const activeCampaigns = campaigns.filter((c) => c.status === "running").length;
      const completedCampaigns = campaigns.filter((c) => c.status === "completed").length;
      const totalContacts = campaigns.reduce((sum, c) => sum + c.totalContacts, 0);
      const processedContacts = campaigns.reduce((sum, c) => sum + c.processedContacts, 0);
      const completedCalls = campaigns.reduce((sum, c) => sum + c.completedCalls, 0);
      const failedCalls = campaigns.reduce((sum, c) => sum + c.failedCalls, 0);

      // Build campaign list
      const campaignList = campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        agentName: c.agentId ? agentMap.get(c.agentId) || null : null,
        totalContacts: c.totalContacts,
        processedContacts: c.processedContacts,
        completedCalls: c.completedCalls,
        failedCalls: c.failedCalls,
        createdAt: c.createdAt,
      }));

      return {
        organizationId,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        summary: {
          totalCampaigns,
          activeCampaigns,
          completedCampaigns,
          totalContacts,
          processedContacts,
          completedCalls,
          failedCalls,
        },
        campaigns: campaignList,
        filters: filter,
        empty: campaigns.length === 0,
      };
    },

    /**
     * Export report data to CSV format.
     */
    exportToCSV(data: any[], columns: string[]): string {
      if (data.length === 0) return "";

      // Header row
      const header = columns.map(escapeCsvCell).join(",");

      // Data rows
      const rows = data.map((row) =>
        columns.map((column) => escapeCsvCell(row[column])).join(",")
      );

      return [header, ...rows].join("\n");
    },
  };
}
