import type {
  PlatformUsageFoundationDto,
  TenantUsageFoundationDto,
  UsageLimitKey,
  UsageMetricsDto,
} from "../../shared/contracts";
import { normalizeSessionStatus } from "../../shared/contracts";
import type { Db } from "../db/store";
import { ApiError } from "../lib/observability";
import type { EntitlementEngine } from "./entitlements";

const BILLING_NOT_CONFIGURED = Object.freeze({
  status: "NOT_CONFIGURED" as const,
  provider: null,
  invoiceGeneration: "UNAVAILABLE" as const,
  paymentProcessing: "UNAVAILABLE" as const,
});

const round = (value: number, decimals = 1) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

function defaultPeriod(): { start: Date; end: Date } {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

function resolvePeriod(periodStart?: string | null, periodEnd?: string | null) {
  if (!periodStart && !periodEnd) return defaultPeriod();
  if (!periodStart || !periodEnd) {
    throw new ApiError("VALIDATION_ERROR", "periodStart and periodEnd must be provided together.");
  }
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new ApiError("VALIDATION_ERROR", "A valid usage period is required.");
  }
  return { start, end };
}

const inPeriod = (value: string, period: { start: Date; end: Date }) => {
  const timestamp = new Date(value);
  return timestamp >= period.start && timestamp < period.end;
};

const emptyMetrics = (): UsageMetricsDto => ({
  voice: { audioSeconds: 0, minutes: 0, eventCount: 0 },
  sessions: { total: 0, active: 0, completed: 0, failed: 0 },
  calls: { total: 0, inbound: 0, outbound: 0, completed: 0, failed: 0, durationSeconds: 0 },
  campaigns: {
    total: 0,
    draft: 0,
    scheduled: 0,
    running: 0,
    completed: 0,
    failed: 0,
    configuredContacts: 0,
    processedContacts: 0,
    completedCalls: 0,
    failedCalls: 0,
  },
});

function addMetrics(target: UsageMetricsDto, source: UsageMetricsDto): UsageMetricsDto {
  target.voice.audioSeconds += source.voice.audioSeconds;
  target.voice.minutes += source.voice.minutes;
  target.voice.eventCount += source.voice.eventCount;
  for (const key of ["total", "active", "completed", "failed"] as const) target.sessions[key] += source.sessions[key];
  for (const key of ["total", "inbound", "outbound", "completed", "failed", "durationSeconds"] as const) {
    target.calls[key] += source.calls[key];
  }
  for (const key of [
    "total", "draft", "scheduled", "running", "completed", "failed", "configuredContacts",
    "processedContacts", "completedCalls", "failedCalls",
  ] as const) target.campaigns[key] += source.campaigns[key];
  target.voice.audioSeconds = round(target.voice.audioSeconds, 3);
  target.voice.minutes = round(target.voice.audioSeconds / 60, 1);
  return target;
}

export function createUsageFoundationService({ db, entitlements }: { db: Db; entitlements: EntitlementEngine }) {
  const tenantUsage = async (
    organizationId: string,
    periodStart?: string | null,
    periodEnd?: string | null
  ): Promise<TenantUsageFoundationDto> => {
    const period = resolvePeriod(periodStart, periodEnd);
    const [usageRows, sessions, calls, campaigns, limits, currentUsage, capabilities, subscription] =
      await Promise.all([
        db.usage.listByOrg(organizationId),
        db.sessions.listByOrg(organizationId),
        db.calls.listByOrg(organizationId),
        db.campaigns.listByOrg(organizationId),
        entitlements.getEffectiveLimits(organizationId),
        entitlements.getCurrentLimitUsage(organizationId),
        entitlements.getCapabilities(organizationId),
        entitlements.getSubscription(organizationId),
      ]);

    const periodUsage = usageRows.filter((row) => inPeriod(row.createdAt, period));
    const audioEvents = periodUsage.filter(
      (row) => row.eventType === "audio_seconds" && Number.isFinite(row.quantity) && row.quantity > 0
    );
    const audioSeconds = round(audioEvents.reduce((total, row) => total + row.quantity, 0), 3);
    const periodSessions = sessions.filter((row) => inPeriod(row.startedAt, period));
    const periodCalls = calls.filter((row) => inPeriod(row.startedAt, period));
    const periodCampaigns = campaigns.filter((row) => inPeriod(row.createdAt, period));

    const usage: UsageMetricsDto = {
      voice: { audioSeconds, minutes: round(audioSeconds / 60, 1), eventCount: audioEvents.length },
      sessions: {
        total: periodSessions.length,
        active: periodSessions.filter((row) => normalizeSessionStatus(row.status) === "active").length,
        completed: periodSessions.filter((row) => normalizeSessionStatus(row.status) === "completed").length,
        failed: periodSessions.filter((row) => normalizeSessionStatus(row.status) === "failed").length,
      },
      calls: {
        total: periodCalls.length,
        inbound: periodCalls.filter((row) => row.direction === "inbound").length,
        outbound: periodCalls.filter((row) => row.direction === "outbound").length,
        completed: periodCalls.filter((row) => row.status === "completed").length,
        failed: periodCalls.filter((row) => row.status === "failed").length,
        durationSeconds: periodCalls.reduce(
          (total, row) => total + (typeof row.durationSeconds === "number" && row.durationSeconds > 0 ? row.durationSeconds : 0),
          0
        ),
      },
      campaigns: {
        total: periodCampaigns.length,
        draft: periodCampaigns.filter((row) => row.status === "draft").length,
        scheduled: periodCampaigns.filter((row) => row.status === "scheduled").length,
        running: periodCampaigns.filter((row) => row.status === "running").length,
        completed: periodCampaigns.filter((row) => row.status === "completed").length,
        failed: periodCampaigns.filter((row) => row.status === "failed").length,
        configuredContacts: periodCampaigns.reduce((total, row) => total + Math.max(0, row.totalContacts), 0),
        processedContacts: periodCampaigns.reduce((total, row) => total + Math.max(0, row.processedContacts), 0),
        completedCalls: periodCampaigns.reduce((total, row) => total + Math.max(0, row.completedCalls), 0),
        failedCalls: periodCampaigns.reduce((total, row) => total + Math.max(0, row.failedCalls), 0),
      },
    };

    const keys: UsageLimitKey[] = [
      "maxUsers", "maxAgents", "maxMonthlyMinutes", "maxCampaigns", "maxConnectors",
    ];
    const limitStates = Object.fromEntries(
      keys.map((key) => {
        const used = round(currentUsage[key], key === "maxMonthlyMinutes" ? 1 : 0);
        const limit = limits[key];
        return [key, { key, used, limit, remaining: Math.max(0, round(limit - used, 1)), reached: used >= limit }];
      })
    ) as TenantUsageFoundationDto["limits"];

    const empty =
      usage.voice.audioSeconds === 0 && usage.sessions.total === 0 && usage.calls.total === 0 && usage.campaigns.total === 0;
    return {
      organizationId,
      period: { start: period.start.toISOString(), end: period.end.toISOString(), timezone: "UTC" },
      usage,
      limits: limitStates,
      entitlements: capabilities,
      subscription: subscription ? { planName: subscription.plan.name, status: subscription.status } : null,
      billing: { ...BILLING_NOT_CONFIGURED },
      empty,
    };
  };

  return {
    tenant: tenantUsage,

    async platform(periodStart?: string | null, periodEnd?: string | null): Promise<PlatformUsageFoundationDto> {
      const organizations = await db.organizations.list();
      const rows = await Promise.all(
        organizations.map(async (organization) => ({
          organization,
          report: await tenantUsage(organization.id, periodStart, periodEnd),
        }))
      );
      const totals = rows.reduce((aggregate, row) => addMetrics(aggregate, row.report.usage), emptyMetrics());
      return {
        period: rows[0]?.report.period ?? (() => {
          const period = resolvePeriod(periodStart, periodEnd);
          return { start: period.start.toISOString(), end: period.end.toISOString(), timezone: "UTC" as const };
        })(),
        totals,
        byOrganization: rows.map(({ organization, report }) => ({
          organizationId: organization.id,
          organizationName: organization.name,
          usage: report.usage,
          empty: report.empty,
        })),
        billing: { ...BILLING_NOT_CONFIGURED },
        empty: rows.every(({ report }) => report.empty),
        generatedAt: new Date().toISOString(),
      };
    },
  };
}

export type UsageFoundationService = ReturnType<typeof createUsageFoundationService>;
