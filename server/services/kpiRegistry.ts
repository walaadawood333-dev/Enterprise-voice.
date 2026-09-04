/**
 * Phase 18 - KPI Registry
 * 
 * Defines all KPIs with formulas, data sources, and metadata.
 * Ensures every metric is traceable to actual persisted data.
 */

/**
 * KPI Category
 */
export type KPICategory = 
  | "operations"
  | "voice"
  | "calls"
  | "campaigns"
  | "collections"
  | "agents"
  | "providers"
  | "qa"
  | "compliance"
  | "connectors"
  | "usage"
  | "billing";

/**
 * Data source types
 */
export type DataSource = 
  | "sessions"
  | "calls"
  | "campaigns"
  | "agents"
  | "usage"
  | "invoices"
  | "payments"
  | "qa_evaluations"
  | "qa_findings"
  | "compliance_policies"
  | "compliance_evaluations"
  | "connectors"
  | "dnc_records"
  | "audit_events";

/**
 * KPI Definition
 */
export interface KPIDefinition {
  id: string;
  name: string;
  description: string;
  category: KPICategory;
  formula: string;
  dataSources: DataSource[];
  unit: "count" | "seconds" | "percent" | "currency" | "rate";
  requiresTimeRange: boolean;
  supportsDrillDown: boolean;
  emptyStateMessage: string;
}

/**
 * KPI Registry - Manages all KPI definitions
 */
export class KPIRegistry {
  private kpis: Map<string, KPIDefinition> = new Map();

  constructor() {
    this.registerAllKPIs();
  }

  /**
   * Register all KPIs with their formulas and data sources
   */
  private registerAllKPIs(): void {
    // Operations KPIs
    this.register({
      id: "total_sessions",
      name: "Total Voice Sessions",
      description: "Total number of voice sessions",
      category: "operations",
      formula: "COUNT(sessions)",
      dataSources: ["sessions"],
      unit: "count",
      requiresTimeRange: false,
      supportsDrillDown: true,
      emptyStateMessage: "No voice sessions recorded",
    });

    this.register({
      id: "active_sessions",
      name: "Active Sessions",
      description: "Number of currently active voice sessions",
      category: "operations",
      formula: "COUNT(sessions WHERE status='active')",
      dataSources: ["sessions"],
      unit: "count",
      requiresTimeRange: false,
      supportsDrillDown: false,
      emptyStateMessage: "No active sessions",
    });

    this.register({
      id: "session_completion_rate",
      name: "Session Completion Rate",
      description: "Percentage of sessions that completed successfully",
      category: "operations",
      formula: "(completed_sessions / total_sessions) * 100",
      dataSources: ["sessions"],
      unit: "percent",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "Insufficient data for completion rate",
    });

    // Voice KPIs
    this.register({
      id: "total_calls",
      name: "Total Calls",
      description: "Total number of calls (inbound + outbound)",
      category: "voice",
      formula: "COUNT(calls)",
      dataSources: ["calls"],
      unit: "count",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "No calls recorded",
    });

    this.register({
      id: "inbound_calls",
      name: "Inbound Calls",
      description: "Number of inbound calls",
      category: "voice",
      formula: "COUNT(calls WHERE direction='inbound')",
      dataSources: ["calls"],
      unit: "count",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "No inbound calls",
    });

    this.register({
      id: "outbound_calls",
      name: "Outbound Calls",
      description: "Number of outbound calls",
      category: "voice",
      formula: "COUNT(calls WHERE direction='outbound')",
      dataSources: ["calls"],
      unit: "count",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "No outbound calls",
    });

    this.register({
      id: "average_call_duration",
      name: "Average Call Duration",
      description: "Average duration of completed calls in seconds",
      category: "voice",
      formula: "SUM(call.duration) / COUNT(calls WHERE status='completed' AND duration IS NOT NULL)",
      dataSources: ["calls"],
      unit: "seconds",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "No completed calls with duration data",
    });

    this.register({
      id: "call_success_rate",
      name: "Call Success Rate",
      description: "Percentage of calls that completed successfully",
      category: "voice",
      formula: "(completed_calls / total_calls) * 100",
      dataSources: ["calls"],
      unit: "percent",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "Insufficient data for success rate",
    });

    // Campaign KPIs
    this.register({
      id: "total_campaigns",
      name: "Total Campaigns",
      description: "Total number of campaigns",
      category: "campaigns",
      formula: "COUNT(campaigns)",
      dataSources: ["campaigns"],
      unit: "count",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "No campaigns created",
    });

    this.register({
      id: "active_campaigns",
      name: "Active Campaigns",
      description: "Number of currently running campaigns",
      category: "campaigns",
      formula: "COUNT(campaigns WHERE status='running')",
      dataSources: ["campaigns"],
      unit: "count",
      requiresTimeRange: false,
      supportsDrillDown: false,
      emptyStateMessage: "No active campaigns",
    });

    this.register({
      id: "campaign_contacts_reached",
      name: "Contacts Reached",
      description: "Total number of contacts reached across all campaigns",
      category: "campaigns",
      formula: "SUM(campaign.processedContacts)",
      dataSources: ["campaigns"],
      unit: "count",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "No contacts reached",
    });

    this.register({
      id: "campaign_success_rate",
      name: "Campaign Success Rate",
      description: "Percentage of campaign contacts that resulted in completed calls",
      category: "campaigns",
      formula: "(completed_calls / processed_contacts) * 100",
      dataSources: ["campaigns"],
      unit: "percent",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "Insufficient data for campaign success rate",
    });

    // Agent KPIs
    this.register({
      id: "total_agents",
      name: "Total Agents",
      description: "Total number of AI agents",
      category: "agents",
      formula: "COUNT(agents)",
      dataSources: ["agents"],
      unit: "count",
      requiresTimeRange: false,
      supportsDrillDown: true,
      emptyStateMessage: "No agents created",
    });

    this.register({
      id: "active_agents",
      name: "Active Agents",
      description: "Number of active AI agents",
      category: "agents",
      formula: "COUNT(agents WHERE status='active')",
      dataSources: ["agents"],
      unit: "count",
      requiresTimeRange: false,
      supportsDrillDown: false,
      emptyStateMessage: "No active agents",
    });

    // Usage KPIs
    this.register({
      id: "total_usage_events",
      name: "Total Usage Events",
      description: "Total number of usage events recorded",
      category: "usage",
      formula: "COUNT(usage_events)",
      dataSources: ["usage"],
      unit: "count",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "No usage events recorded",
    });

    this.register({
      id: "total_audio_seconds",
      name: "Total Audio Seconds",
      description: "Total seconds of audio processed",
      category: "usage",
      formula: "SUM(usage_events.quantity WHERE eventType='audio_seconds')",
      dataSources: ["usage"],
      unit: "seconds",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "No audio processed",
    });

    // Billing KPIs
    this.register({
      id: "total_invoices",
      name: "Total Invoices",
      description: "Total number of invoices generated",
      category: "billing",
      formula: "COUNT(invoices)",
      dataSources: ["invoices"],
      unit: "count",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "No invoices generated",
    });

    this.register({
      id: "paid_invoices",
      name: "Paid Invoices",
      description: "Number of paid invoices",
      category: "billing",
      formula: "COUNT(invoices WHERE status='paid')",
      dataSources: ["invoices"],
      unit: "count",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "No paid invoices",
    });

    this.register({
      id: "total_revenue",
      name: "Total Revenue",
      description: "Total revenue from paid invoices",
      category: "billing",
      formula: "SUM(invoices.totalAmountCents WHERE status='paid')",
      dataSources: ["invoices"],
      unit: "currency",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "No revenue recorded",
    });

    this.register({
      id: "outstanding_balance",
      name: "Outstanding Balance",
      description: "Total amount remaining on unpaid invoices",
      category: "billing",
      formula: "SUM(invoices.amountRemainingCents WHERE status IN ('open', 'draft'))",
      dataSources: ["invoices"],
      unit: "currency",
      requiresTimeRange: false,
      supportsDrillDown: true,
      emptyStateMessage: "No outstanding balance",
    });

    // QA KPIs
    this.register({
      id: "total_evaluations",
      name: "Total QA Evaluations",
      description: "Total number of QA evaluations",
      category: "qa",
      formula: "COUNT(qa_evaluations)",
      dataSources: ["qa_evaluations"],
      unit: "count",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "No QA evaluations",
    });

    this.register({
      id: "qa_pass_rate",
      name: "QA Pass Rate",
      description: "Percentage of evaluations that passed",
      category: "qa",
      formula: "(passed_evaluations / total_evaluations) * 100",
      dataSources: ["qa_evaluations"],
      unit: "percent",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "Insufficient data for QA pass rate",
    });

    this.register({
      id: "open_findings",
      name: "Open QA Findings",
      description: "Number of open QA findings",
      category: "qa",
      formula: "COUNT(qa_findings WHERE status='open')",
      dataSources: ["qa_findings"],
      unit: "count",
      requiresTimeRange: false,
      supportsDrillDown: true,
      emptyStateMessage: "No open findings",
    });

    // Compliance KPIs
    this.register({
      id: "active_policies",
      name: "Active Compliance Policies",
      description: "Number of active compliance policies",
      category: "compliance",
      formula: "COUNT(compliance_policies WHERE enabled=true)",
      dataSources: ["compliance_policies"],
      unit: "count",
      requiresTimeRange: false,
      supportsDrillDown: true,
      emptyStateMessage: "No active policies",
    });

    this.register({
      id: "compliance_violations",
      name: "Compliance Violations",
      description: "Number of compliance violations detected",
      category: "compliance",
      formula: "COUNT(compliance_evaluations WHERE status='violation')",
      dataSources: ["compliance_evaluations"],
      unit: "count",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "No violations detected",
    });

    // Connectors KPIs
    this.register({
      id: "total_connectors",
      name: "Total Connectors",
      description: "Total number of data connectors",
      category: "connectors",
      formula: "COUNT(connectors)",
      dataSources: ["connectors"],
      unit: "count",
      requiresTimeRange: false,
      supportsDrillDown: true,
      emptyStateMessage: "No connectors configured",
    });

    this.register({
      id: "connected_connectors",
      name: "Connected Connectors",
      description: "Number of connected data connectors",
      category: "connectors",
      formula: "COUNT(connectors WHERE status='connected')",
      dataSources: ["connectors"],
      unit: "count",
      requiresTimeRange: false,
      supportsDrillDown: false,
      emptyStateMessage: "No connected connectors",
    });

    // DNC KPIs
    this.register({
      id: "total_dnc_records",
      name: "Total DNC Records",
      description: "Total number of Do Not Contact records",
      category: "collections",
      formula: "COUNT(dnc_records)",
      dataSources: ["dnc_records"],
      unit: "count",
      requiresTimeRange: false,
      supportsDrillDown: true,
      emptyStateMessage: "No DNC records",
    });

    // Audit KPIs
    this.register({
      id: "total_audit_events",
      name: "Total Audit Events",
      description: "Total number of audit events",
      category: "compliance",
      formula: "COUNT(audit_events)",
      dataSources: ["audit_events"],
      unit: "count",
      requiresTimeRange: true,
      supportsDrillDown: true,
      emptyStateMessage: "No audit events",
    });
  }

  /**
   * Register a KPI definition
   */
  register(kpi: KPIDefinition): void {
    this.kpis.set(kpi.id, kpi);
  }

  /**
   * Get a KPI definition by ID
   */
  get(kpiId: string): KPIDefinition | undefined {
    return this.kpis.get(kpiId);
  }

  /**
   * Get all KPIs
   */
  get size(): number {
    return this.kpis.size;
  }

  getAll(): KPIDefinition[] {
    return Array.from(this.kpis.values());
  }

  /**
   * Get KPIs by category
   */
  getByCategory(category: KPICategory): KPIDefinition[] {
    return this.getAll().filter((kpi) => kpi.category === category);
  }

  /**
   * Validate a KPI ID exists
   */
  isValid(kpiId: string): boolean {
    return this.kpis.has(kpiId);
  }
}

/**
 * Create a KPI registry instance
 */
export function createKPIRegistry(): KPIRegistry {
  return new KPIRegistry();
}
