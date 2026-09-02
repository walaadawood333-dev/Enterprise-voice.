/**
 * Phase 18 - Analytics Service
 * 
 * Computes metrics from real persisted data across all domains.
 * Never fabricates values - shows empty states when data is insufficient.
 */

import type { Db } from "../db/store";
import { KPIRegistry, type KPICategory } from "./kpiRegistry";

/**
 * Time range filter
 */
export interface TimeRange {
  startDate?: string;
  endDate?: string;
}

/**
 * Analytics filter
 */
export interface AnalyticsFilter extends TimeRange {
  agentId?: string;
  campaignId?: string;
  status?: string;
  direction?: string;
}

/**
 * KPI result
 */
export interface KPIResult {
  kpiId: string;
  name: string;
  description: string;
  category: KPICategory;
  value: number | null;
  unit: string;
  hasData: boolean;
  emptyStateMessage?: string;
  calculatedAt: string;
}

/**
 * Domain analytics result
 */
export interface DomainAnalytics {
  category: KPICategory;
  kpis: KPIResult[];
  period: {
    start: string;
    end: string;
  };
  hasData: boolean;
}

/**
 * Organization analytics summary
 */
export interface OrganizationAnalytics {
  organizationId: string;
  domains: DomainAnalytics[];
  period: {
    start: string;
    end: string;
  };
  generatedAt: string;
}

/**
 * Platform analytics summary (aggregated across organizations)
 */
export interface PlatformAnalytics {
  totalOrganizations: number;
  totalSessions: number;
  totalCalls: number;
  totalCampaigns: number;
  totalAgents: number;
  totalRevenueCents: number;
  period: {
    start: string;
    end: string;
  };
  generatedAt: string;
}

/**
 * Analytics Service
 */
export class AnalyticsService {
  private kpiRegistry: KPIRegistry;

  constructor(
    private db: Db,
    kpiRegistry?: KPIRegistry
  ) {
    this.kpiRegistry = kpiRegistry || new KPIRegistry();
  }

  /**
   * Calculate a single KPI
   */
  async calculateKPI(
    organizationId: string,
    kpiId: string,
    filter?: AnalyticsFilter
  ): Promise<KPIResult> {
    const kpi = this.kpiRegistry.get(kpiId);
    if (!kpi) {
      throw new Error(`KPI not found: ${kpiId}`);
    }

    const startDate = filter?.startDate ? new Date(filter.startDate) : new Date("2020-01-01");
    const endDate = filter?.endDate ? new Date(filter.endDate) : new Date();

    let value: number | null = null;
    let hasData = false;

    try {
      switch (kpiId) {
        case "total_sessions":
          const sessions = await this.db.sessions.listByOrg(organizationId);
          const filteredSessions = this.filterByDateRange(sessions, startDate, endDate, "startedAt");
          value = filteredSessions.length;
          hasData = true;
          break;

        case "active_sessions":
          const activeSessions = await this.db.sessions.listByOrg(organizationId);
          value = activeSessions.filter((s) => s.status === "active").length;
          hasData = true;
          break;

        case "session_completion_rate":
          const allSessions = await this.db.sessions.listByOrg(organizationId);
          const sessionsInRange = this.filterByDateRange(allSessions, startDate, endDate, "startedAt");
          if (sessionsInRange.length > 0) {
            const completed = sessionsInRange.filter((s) => s.status === "completed").length;
            value = (completed / sessionsInRange.length) * 100;
            hasData = true;
          }
          break;

        case "total_calls":
          const calls = await this.db.calls.listByOrg(organizationId);
          const filteredCalls = this.filterByDateRange(calls, startDate, endDate, "startedAt");
          value = filteredCalls.length;
          hasData = true;
          break;

        case "inbound_calls":
          const inboundCalls = await this.db.calls.listByOrg(organizationId);
          const filteredInbound = this.filterByDateRange(inboundCalls, startDate, endDate, "startedAt");
          value = filteredInbound.filter((c) => c.direction === "inbound").length;
          hasData = true;
          break;

        case "outbound_calls":
          const outboundCalls = await this.db.calls.listByOrg(organizationId);
          const filteredOutbound = this.filterByDateRange(outboundCalls, startDate, endDate, "startedAt");
          value = filteredOutbound.filter((c) => c.direction === "outbound").length;
          hasData = true;
          break;

        case "average_call_duration":
          const durationCalls = await this.db.calls.listByOrg(organizationId);
          const callsWithTime = this.filterByDateRange(durationCalls, startDate, endDate, "startedAt")
            .filter((c) => c.status === "completed" && c.durationSeconds !== null);
          if (callsWithTime.length > 0) {
            const totalDuration = callsWithTime.reduce((sum, c) => sum + (c.durationSeconds || 0), 0);
            value = totalDuration / callsWithTime.length;
            hasData = true;
          }
          break;

        case "call_success_rate":
          const successCalls = await this.db.calls.listByOrg(organizationId);
          const callsInTimeRange = this.filterByDateRange(successCalls, startDate, endDate, "startedAt");
          if (callsInTimeRange.length > 0) {
            const completedCalls = callsInTimeRange.filter((c) => c.status === "completed").length;
            value = (completedCalls / callsInTimeRange.length) * 100;
            hasData = true;
          }
          break;

        case "total_campaigns":
          const campaigns = await this.db.campaigns.listByOrg(organizationId);
          const filteredCampaigns = this.filterByDateRange(campaigns, startDate, endDate, "createdAt");
          value = filteredCampaigns.length;
          hasData = true;
          break;

        case "active_campaigns":
          const activeCampaigns = await this.db.campaigns.listByOrg(organizationId);
          value = activeCampaigns.filter((c) => c.status === "running").length;
          hasData = true;
          break;

        case "campaign_contacts_reached":
          const reachedCampaigns = await this.db.campaigns.listByOrg(organizationId);
          const campaignsInRange = this.filterByDateRange(reachedCampaigns, startDate, endDate, "createdAt");
          value = campaignsInRange.reduce((sum, c) => sum + c.processedContacts, 0);
          hasData = true;
          break;

        case "campaign_success_rate":
          const campaignSuccess = await this.db.campaigns.listByOrg(organizationId);
          const campaignsInRange2 = this.filterByDateRange(campaignSuccess, startDate, endDate, "createdAt");
          const totalProcessed = campaignsInRange2.reduce((sum, c) => sum + c.processedContacts, 0);
          if (totalProcessed > 0) {
            const totalCompleted = campaignsInRange2.reduce((sum, c) => sum + c.completedCalls, 0);
            value = (totalCompleted / totalProcessed) * 100;
            hasData = true;
          }
          break;

        case "total_agents":
          const agents = await this.db.agents.listByOrg(organizationId);
          value = agents.length;
          hasData = true;
          break;

        case "active_agents":
          const activeAgents = await this.db.agents.listByOrg(organizationId);
          value = activeAgents.filter((a) => a.status === "active").length;
          hasData = true;
          break;

        case "total_usage_events":
          const usageEvents = await this.db.usage.listByOrg(organizationId);
          const filteredUsage = this.filterByDateRange(usageEvents, startDate, endDate, "createdAt");
          value = filteredUsage.length;
          hasData = true;
          break;

        case "total_audio_seconds":
          const audioUsage = await this.db.usage.listByOrg(organizationId);
          const audioInRange = this.filterByDateRange(audioUsage, startDate, endDate, "createdAt");
          const audioEvents = audioInRange.filter((u) => u.eventType === "audio_seconds");
          if (audioEvents.length > 0) {
            value = audioEvents.reduce((sum, u) => sum + u.quantity, 0);
            hasData = true;
          }
          break;

        case "total_invoices":
          const invoices = await this.db.invoices.listByOrg(organizationId);
          const filteredInvoices = this.filterByDateRange(invoices, startDate, endDate, "createdAt");
          value = filteredInvoices.length;
          hasData = true;
          break;

        case "paid_invoices":
          const paidInvoices = await this.db.invoices.listByOrg(organizationId);
          const paidInRange = this.filterByDateRange(paidInvoices, startDate, endDate, "createdAt");
          value = paidInRange.filter((i) => i.status === "paid").length;
          hasData = true;
          break;

        case "total_revenue":
          const revenueInvoices = await this.db.invoices.listByOrg(organizationId);
          const paidRevenue = revenueInvoices.filter((i) => i.status === "paid");
          if (paidRevenue.length > 0) {
            value = paidRevenue.reduce((sum, i) => sum + i.totalAmountCents, 0);
            hasData = true;
          }
          break;

        case "outstanding_balance":
          const outstandingInvoices = await this.db.invoices.listByOrg(organizationId);
          const unpaid = outstandingInvoices.filter((i) => i.status === "open" || i.status === "draft");
          if (unpaid.length > 0) {
            value = unpaid.reduce((sum, i) => sum + i.amountRemainingCents, 0);
            hasData = true;
          }
          break;

        case "total_evaluations":
          const evaluations = await this.db.qaEvaluations.listByOrg(organizationId);
          const filteredEvals = this.filterByDateRange(evaluations, startDate, endDate, "createdAt");
          value = filteredEvals.length;
          hasData = true;
          break;

        case "qa_pass_rate":
          const qaEvals = await this.db.qaEvaluations.listByOrg(organizationId);
          const evalsInRange = this.filterByDateRange(qaEvals, startDate, endDate, "createdAt");
          const completedEvals = evalsInRange.filter((e) => e.status === "completed");
          if (completedEvals.length > 0) {
            const passed = completedEvals.filter((e) => e.passed === true).length;
            value = (passed / completedEvals.length) * 100;
            hasData = true;
          }
          break;

        case "open_findings":
          const findings = await this.db.qaFindings.listByOrg(organizationId);
          value = findings.filter((f) => f.status === "open").length;
          hasData = true;
          break;

        case "active_policies":
          const policies = await this.db.compliancePolicies.listByOrg(organizationId);
          value = policies.filter((p) => p.enabled).length;
          hasData = true;
          break;

        case "compliance_violations":
          const violations = await this.db.complianceEvaluations.listByOrg(organizationId);
          const violationsInRange = this.filterByDateRange(violations, startDate, endDate, "createdAt");
          value = violationsInRange.filter((v) => v.status === "violation").length;
          hasData = true;
          break;

        case "total_connectors":
          const connectors = await this.db.connectors.listByOrg(organizationId);
          value = connectors.length;
          hasData = true;
          break;

        case "connected_connectors":
          const connectedConnectors = await this.db.connectors.listByOrg(organizationId);
          value = connectedConnectors.filter((c) => c.status === "connected").length;
          hasData = true;
          break;

        case "total_dnc_records":
          const dncRecords = await this.db.dncRecords.listByOrg(organizationId);
          value = dncRecords.length;
          hasData = true;
          break;

        case "total_audit_events":
          const auditEvents = await this.db.audit.listByOrg(organizationId, 10000);
          const filteredAudit = this.filterByDateRange(auditEvents, startDate, endDate, "createdAt");
          value = filteredAudit.length;
          hasData = true;
          break;

        default:
          throw new Error(`KPI calculation not implemented: ${kpiId}`);
      }
    } catch (error) {
      console.error(`Error calculating KPI ${kpiId}:`, error);
      value = null;
      hasData = false;
    }

    return {
      kpiId,
      name: kpi.name,
      description: kpi.description,
      category: kpi.category,
      value,
      unit: kpi.unit,
      hasData,
      emptyStateMessage: !hasData ? kpi.emptyStateMessage : undefined,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Calculate all KPIs for a domain
   */
  async calculateDomainAnalytics(
    organizationId: string,
    category: KPICategory,
    filter?: AnalyticsFilter
  ): Promise<DomainAnalytics> {
    const kpis = this.kpiRegistry.getByCategory(category);
    const results: KPIResult[] = [];

    for (const kpi of kpis) {
      const result = await this.calculateKPI(organizationId, kpi.id, filter);
      results.push(result);
    }

    const startDate = filter?.startDate ? new Date(filter.startDate) : new Date("2020-01-01");
    const endDate = filter?.endDate ? new Date(filter.endDate) : new Date();

    return {
      category,
      kpis: results,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      hasData: results.some((r) => r.hasData),
    };
  }

  /**
   * Calculate all analytics for an organization
   */
  async calculateOrganizationAnalytics(
    organizationId: string,
    filter?: AnalyticsFilter
  ): Promise<OrganizationAnalytics> {
    const categories: KPICategory[] = [
      "operations",
      "voice",
      "campaigns",
      "agents",
      "usage",
      "billing",
      "qa",
      "compliance",
      "connectors",
      "collections",
    ];

    const domains: DomainAnalytics[] = [];

    for (const category of categories) {
      const domain = await this.calculateDomainAnalytics(organizationId, category, filter);
      domains.push(domain);
    }

    const startDate = filter?.startDate ? new Date(filter.startDate) : new Date("2020-01-01");
    const endDate = filter?.endDate ? new Date(filter.endDate) : new Date();

    return {
      organizationId,
      domains,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Calculate platform-wide analytics (aggregated across all organizations)
   * Note: This is privacy-safe as it only aggregates counts, not individual data
   */
  async calculatePlatformAnalytics(filter?: TimeRange): Promise<PlatformAnalytics> {
    const organizations = await this.db.organizations.list();
    
    let totalSessions = 0;
    let totalCalls = 0;
    let totalCampaigns = 0;
    let totalAgents = 0;
    let totalRevenueCents = 0;

    const startDate = filter?.startDate ? new Date(filter.startDate) : new Date("2020-01-01");
    const endDate = filter?.endDate ? new Date(filter.endDate) : new Date();

    for (const org of organizations) {
      // Sessions
      const sessions = await this.db.sessions.listByOrg(org.id);
      const filteredSessions = this.filterByDateRange(sessions, startDate, endDate, "startedAt");
      totalSessions += filteredSessions.length;

      // Calls
      const calls = await this.db.calls.listByOrg(org.id);
      const filteredCalls = this.filterByDateRange(calls, startDate, endDate, "startedAt");
      totalCalls += filteredCalls.length;

      // Campaigns
      const campaigns = await this.db.campaigns.listByOrg(org.id);
      const filteredCampaigns = this.filterByDateRange(campaigns, startDate, endDate, "createdAt");
      totalCampaigns += filteredCampaigns.length;

      // Agents
      const agents = await this.db.agents.listByOrg(org.id);
      totalAgents += agents.length;

      // Revenue
      const invoices = await this.db.invoices.listByOrg(org.id);
      const paidInvoices = invoices.filter((i) => i.status === "paid");
      totalRevenueCents += paidInvoices.reduce((sum, i) => sum + i.totalAmountCents, 0);
    }

    return {
      totalOrganizations: organizations.length,
      totalSessions,
      totalCalls,
      totalCampaigns,
      totalAgents,
      totalRevenueCents,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Filter data by date range
   */
  private filterByDateRange<T extends Record<string, any>>(
    data: T[],
    startDate: Date,
    endDate: Date,
    dateField: string
  ): T[] {
    return data.filter((item) => {
      const dateValue = item[dateField];
      if (!dateValue) return false;
      const date = new Date(dateValue);
      return date >= startDate && date <= endDate;
    });
  }

  /**
   * Export analytics to CSV
   */
  exportToCSV(analytics: OrganizationAnalytics | DomainAnalytics): string {
    const rows: string[] = [];
    
    if ("domains" in analytics) {
      // Organization analytics
      rows.push("Category,KPI,Value,Unit,Has Data");
      for (const domain of analytics.domains) {
        for (const kpi of domain.kpis) {
          rows.push(
            `${kpi.category},${kpi.name},${kpi.value ?? "N/A"},${kpi.unit},${kpi.hasData}`
          );
        }
      }
    } else {
      // Domain analytics
      rows.push("KPI,Value,Unit,Has Data");
      for (const kpi of analytics.kpis) {
        rows.push(`${kpi.name},${kpi.value ?? "N/A"},${kpi.unit},${kpi.hasData}`);
      }
    }

    return rows.join("\n");
  }
}

/**
 * Create analytics service
 */
export function createAnalyticsService(db: Db, kpiRegistry?: KPIRegistry): AnalyticsService {
  return new AnalyticsService(db, kpiRegistry);
}
