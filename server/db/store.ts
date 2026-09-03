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
  type AuditEventRow,
  type CallDirection,
  type CallEventRow,
  type CallEventType,
  type CallOutcome,
  type CallOutcomeType,
  type CallRow,
  type CallStatus,
  type CampaignContactPhase12Row,
  type CampaignContactRow,
  type CampaignEventRow,
  type CampaignEventType12,
  type CampaignRow,
  type CampaignScheduleRow,
  type ComplianceCategory,
  type ComplianceEvaluationRow,
  type ComplianceEvaluationStatus,
  type CompliancePolicyRow,
  type ComplianceSeverity,
  type ConnectorActivityType,
  type ConnectorStatus,
  type ContactQueueStatus,
  type ContactRow,
  type ContactValidationStatus,
  type DataConnectorActivityRow,
  type DataConnectorFieldMappingRow,
  type DataConnectorRow,
  type DataConnectorSyncJobRow,
  type DataTransformerType,
  type DialAttemptRow,
  type DialingQueueItemStatus,
  type DNCIdentifierType,
  type DNCRecordRow,
  type DNCSource,
  type DNCStatus,
  type IndustryName,
  type InvoiceRow,
  type InvoiceStatus,
  type MessageRow,
  type OperationalAlertRow,
  type OperationalAlertSeverity,
  type OperationalAlertSource,
  type OrganizationBrandingRow,
  type OrganizationEntitlementRow,
  type OrganizationRow,
  type OrganizationTelephonyProviderRow,
  type OrgRole,
  type PaymentRow,
  type PaymentStatus,
  type PaymentMethodType,
  type PhoneValidationStatus,
  type PlanRow,
  type RetryBackoffStrategy,
  type RetryPolicyRow,
  type SubscriptionRow,
  type SyncDirection,
  type SyncJobStatus,
  type SyncMode,
  type UserCredential,
  type UserRow,
  type UsageEventRow,
  type UsageEventType,
  type VoiceSessionRow,
  type QAEvaluationTemplateRow,
  type QAEvaluationCriterionRow,
  type QAEvaluationRow,
  type QAEvaluationScoreRow,
  type QAFindingRow,
  type QATemplateStatus,
  type QAEvaluationType,
  type QAEvaluationStatus,
  type QAScoringMethod,
  type QAFindingSeverity,
  type QAFindingStatus,
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
  calls: {
    create(input: Omit<CallRow, "startedAt" | "answeredAt" | "endedAt" | "durationSeconds" | "createdAt" | "updatedAt">): Promise<CallRow>;
    /** Scoped: another tenant's id reads as missing, never as the row. */
    get(id: string, organizationId: string): Promise<CallRow | undefined>;
    listByOrg(organizationId: string): Promise<CallRow[]>;
    findByProviderCallId(provider: string, providerCallId: string): Promise<CallRow | undefined>;
    update(id: string, organizationId: string, changes: Partial<Pick<CallRow, "status" | "agentId" | "voiceSessionId" | "answeredAt" | "endedAt" | "durationSeconds">>): Promise<CallRow | undefined>;
  };
  callEvents: {
    create(input: Omit<CallEventRow, "createdAt">): Promise<CallEventRow>;
    listByCall(callId: string): Promise<CallEventRow[]>;
    findByProviderEventId(provider: string, providerEventId: string): Promise<CallEventRow | undefined>;
  };
  orgProviders: {
    create(input: Omit<OrganizationTelephonyProviderRow, "createdAt" | "updatedAt">): Promise<OrganizationTelephonyProviderRow>;
    get(id: string, organizationId: string): Promise<OrganizationTelephonyProviderRow | undefined>;
    listByOrg(organizationId: string): Promise<OrganizationTelephonyProviderRow[]>;
    findByOrgAndProvider(organizationId: string, provider: string): Promise<OrganizationTelephonyProviderRow | undefined>;
    update(id: string, organizationId: string, changes: Partial<Pick<OrganizationTelephonyProviderRow, "enabled" | "isDefault" | "configurationReference" | "status">>): Promise<OrganizationTelephonyProviderRow | undefined>;
    remove(id: string, organizationId: string): Promise<boolean>;
  };
  /** Phase 10A — Subscription & Entitlement repositories */
  plans: {
    get(id: string): Promise<PlanRow | undefined>;
    list(): Promise<PlanRow[]>;
    create(input: Omit<PlanRow, "createdAt" | "updatedAt">): Promise<PlanRow>;
    update(id: string, changes: Partial<Pick<PlanRow, "name" | "planType" | "status" | "features" | "limits">>): Promise<PlanRow | undefined>;
  };
  subscriptions: {
    getByOrg(organizationId: string): Promise<SubscriptionRow | undefined>;
    create(
      input: Omit<SubscriptionRow, "id" | "startedAt" | "createdAt" | "updatedAt"> & {
        id?: string;
        startedAt?: string;
      }
    ): Promise<SubscriptionRow>;
    update(id: string, changes: Partial<Pick<SubscriptionRow, "planId" | "status" | "effectiveLimits" | "trialEndsAt" | "currentPeriodStart" | "currentPeriodEnd" | "cancelledAt">>): Promise<SubscriptionRow | undefined>;
    listAll(): Promise<SubscriptionRow[]>;
  };
  entitlements: {
    get(organizationId: string, feature: OrganizationEntitlementRow["feature"]): Promise<OrganizationEntitlementRow | undefined>;
    listByOrg(organizationId: string): Promise<OrganizationEntitlementRow[]>;
    upsert(input: Omit<OrganizationEntitlementRow, "id" | "createdAt" | "updatedAt">): Promise<OrganizationEntitlementRow>;
    remove(organizationId: string, feature: OrganizationEntitlementRow["feature"]): Promise<boolean>;
  };
  /* ── Phase 15 — Billing ── */
  invoices: {
    create(input: Omit<InvoiceRow, "id" | "createdAt" | "updatedAt">): Promise<InvoiceRow>;
    get(id: string, organizationId: string): Promise<InvoiceRow | undefined>;
    listByOrg(organizationId: string): Promise<InvoiceRow[]>;
    listBySubscription(subscriptionId: string): Promise<InvoiceRow[]>;
    update(id: string, organizationId: string, changes: Partial<Pick<InvoiceRow, "status" | "amountPaidCents" | "amountRemainingCents" | "paidAt" | "voidedAt" | "notes">>): Promise<InvoiceRow | undefined>;
    getByInvoiceNumber(invoiceNumber: string): Promise<InvoiceRow | undefined>;
  };
  payments: {
    create(input: Omit<PaymentRow, "id" | "createdAt" | "updatedAt">): Promise<PaymentRow>;
    get(id: string, organizationId: string): Promise<PaymentRow | undefined>;
    listByInvoice(invoiceId: string): Promise<PaymentRow[]>;
    listByOrg(organizationId: string): Promise<PaymentRow[]>;
    update(id: string, organizationId: string, changes: Partial<Pick<PaymentRow, "status" | "failureReason" | "refundedAt">>): Promise<PaymentRow | undefined>;
    getByIdempotencyKey(idempotencyKey: string): Promise<PaymentRow | undefined>;
  };
  branding: {
    getByOrg(organizationId: string): Promise<OrganizationBrandingRow | undefined>;
    upsert(input: Omit<OrganizationBrandingRow, "createdAt" | "updatedAt">): Promise<OrganizationBrandingRow>;
    update(organizationId: string, changes: Partial<Pick<OrganizationBrandingRow, "displayName" | "logoUrl" | "faviconUrl" | "primaryColor" | "accentColor" | "theme">>): Promise<OrganizationBrandingRow | undefined>;
  };
  audit: {
    create(input: Omit<AuditEventRow, "id" | "createdAt">): Promise<AuditEventRow>;
    listByOrg(organizationId: string, limit?: number): Promise<AuditEventRow[]>;
    listAll(limit?: number): Promise<AuditEventRow[]>;
  };
  campaigns: {
    create(input: Omit<CampaignRow, "id" | "createdAt" | "updatedAt" | "processedContacts" | "completedCalls" | "failedCalls">): Promise<CampaignRow>;
    get(id: string, organizationId: string): Promise<CampaignRow | undefined>;
    listByOrg(organizationId: string): Promise<CampaignRow[]>;
    update(id: string, organizationId: string, patch: Partial<Pick<CampaignRow, "name" | "description" | "agentId" | "status" | "scheduledAt" | "startedAt" | "completedAt" | "totalContacts" | "processedContacts" | "completedCalls" | "failedCalls" | "configuration">>): Promise<CampaignRow | undefined>;
    delete(id: string, organizationId: string): Promise<boolean>;
    count(organizationId: string): Promise<number>;
    countByStatus(organizationId: string): Promise<Record<string, number>>;
  };
  /** Phase 10C — Compliance Policy repositories */
  compliancePolicies: {
    create(input: Omit<CompliancePolicyRow, "id" | "createdAt" | "updatedAt">): Promise<CompliancePolicyRow>;
    get(id: string, organizationId: string): Promise<CompliancePolicyRow | undefined>;
    listByOrg(organizationId: string): Promise<CompliancePolicyRow[]>;
    update(id: string, organizationId: string, patch: Partial<Pick<CompliancePolicyRow, "name" | "category" | "enabled" | "severity" | "configuration" | "description">>): Promise<CompliancePolicyRow | undefined>;
    delete(id: string, organizationId: string): Promise<boolean>;
    count(organizationId: string): Promise<number>;
    countByCategory(organizationId: string): Promise<Record<string, number>>;
  };
  complianceEvaluations: {
    create(input: Omit<ComplianceEvaluationRow, "id" | "evaluatedAt">): Promise<ComplianceEvaluationRow>;
    listByOrg(organizationId: string, limit?: number): Promise<ComplianceEvaluationRow[]>;
    listByPolicy(organizationId: string, policyId: string): Promise<ComplianceEvaluationRow[]>;
    listByResource(resourceType: string, resourceId: string): Promise<ComplianceEvaluationRow[]>;
    count(organizationId: string): Promise<number>;
    countByStatus(organizationId: string): Promise<Record<string, number>>;
  };
  /** Phase 10C — DNC (Do Not Contact) repository */
  dncRecords: {
    create(input: Omit<DNCRecordRow, "id" | "createdAt" | "updatedAt">): Promise<DNCRecordRow>;
    get(id: string, organizationId: string): Promise<DNCRecordRow | undefined>;
    listByOrg(organizationId: string): Promise<DNCRecordRow[]>;
    delete(id: string, organizationId: string): Promise<boolean>;
    count(organizationId: string): Promise<number>;
    countByStatus(organizationId: string): Promise<Record<string, number>>;
    /** Find active DNC record by identifier — returns the record or undefined */
    findByIdentifier(organizationId: string, identifier: string, identifierType: DNCIdentifierType): Promise<DNCRecordRow | undefined>;
  };
  /** Phase 10D — QA Evaluation repositories */
  qaTemplates: {
    create(input: Omit<QAEvaluationTemplateRow, "id" | "createdAt" | "updatedAt">): Promise<QAEvaluationTemplateRow>;
    get(id: string, organizationId: string): Promise<QAEvaluationTemplateRow | undefined>;
    listByOrg(organizationId: string, status?: QATemplateStatus): Promise<QAEvaluationTemplateRow[]>;
    update(id: string, organizationId: string, patch: Partial<Pick<QAEvaluationTemplateRow, "name" | "description" | "status" | "evaluationType" | "maxScore" | "passingScore">>): Promise<QAEvaluationTemplateRow | undefined>;
    delete(id: string, organizationId: string): Promise<boolean>;
    count(organizationId: string): Promise<number>;
    countByStatus(organizationId: string): Promise<Record<string, number>>;
  };
  qaCriteria: {
    create(input: Omit<QAEvaluationCriterionRow, "id" | "createdAt" | "updatedAt">): Promise<QAEvaluationCriterionRow>;
    get(id: string, organizationId: string): Promise<QAEvaluationCriterionRow | undefined>;
    listByTemplate(organizationId: string, templateId: string): Promise<QAEvaluationCriterionRow[]>;
    update(id: string, organizationId: string, patch: Partial<Pick<QAEvaluationCriterionRow, "name" | "description" | "weight" | "required" | "scoringMethod" | "maxScore" | "displayOrder">>): Promise<QAEvaluationCriterionRow | undefined>;
    delete(id: string, organizationId: string): Promise<boolean>;
    deleteByTemplate(organizationId: string, templateId: string): Promise<number>;
  };
  qaEvaluations: {
    create(input: Omit<QAEvaluationRow, "id" | "createdAt" | "updatedAt" | "totalScore" | "passed" | "submittedAt">): Promise<QAEvaluationRow>;
    get(id: string, organizationId: string): Promise<QAEvaluationRow | undefined>;
    listByOrg(organizationId: string, status?: QAEvaluationStatus): Promise<QAEvaluationRow[]>;
    listByVoiceSession(organizationId: string, voiceSessionId: string): Promise<QAEvaluationRow[]>;
    listByEvaluator(organizationId: string, evaluatorId: string): Promise<QAEvaluationRow[]>;
    update(id: string, organizationId: string, patch: Partial<Pick<QAEvaluationRow, "status" | "evaluatorName" | "totalScore" | "passed" | "notes" | "submittedAt">>): Promise<QAEvaluationRow | undefined>;
    delete(id: string, organizationId: string): Promise<boolean>;
    count(organizationId: string): Promise<number>;
    countByStatus(organizationId: string): Promise<Record<string, number>>;
  };
  qaScores: {
    create(input: Omit<QAEvaluationScoreRow, "id" | "createdAt" | "updatedAt">): Promise<QAEvaluationScoreRow>;
    get(id: string, organizationId: string): Promise<QAEvaluationScoreRow | undefined>;
    listByEvaluation(organizationId: string, evaluationId: string): Promise<QAEvaluationScoreRow[]>;
    update(id: string, organizationId: string, patch: Partial<Pick<QAEvaluationScoreRow, "score" | "comments">>): Promise<QAEvaluationScoreRow | undefined>;
    delete(id: string, organizationId: string): Promise<boolean>;
    deleteByEvaluation(organizationId: string, evaluationId: string): Promise<number>;
  };
    qaFindings: {
    create(input: Omit<QAFindingRow, "id" | "createdAt" | "updatedAt">): Promise<QAFindingRow>;
    get(id: string, organizationId: string): Promise<QAFindingRow | undefined>;
    listByEvaluation(organizationId: string, evaluationId: string): Promise<QAFindingRow[]>;
    listByOrg(organizationId: string, status?: QAFindingStatus): Promise<QAFindingRow[]>;
    update(id: string, organizationId: string, patch: Partial<Pick<QAFindingRow, "category" | "severity" | "status" | "description">>): Promise<QAFindingRow | undefined>;
    delete(id: string, organizationId: string): Promise<boolean>;
    count(organizationId: string): Promise<number>;
    countByStatus(organizationId: string): Promise<Record<string, number>>;
  };
  /** Phase 10E — Data Connector repositories */
  connectors: {
    create(input: Omit<DataConnectorRow, "id" | "createdAt" | "updatedAt" | "status" | "healthStatus" | "lastSyncAt" | "lastTestedAt" | "lastHealthCheckAt" | "enabled">): Promise<DataConnectorRow>;
    get(id: string, organizationId: string): Promise<DataConnectorRow | undefined>;
    listByOrg(organizationId: string, type?: string, status?: ConnectorStatus): Promise<DataConnectorRow[]>;
    update(id: string, organizationId: string, patch: Partial<Omit<DataConnectorRow, "id" | "organizationId" | "createdAt" | "updatedAt">>): Promise<DataConnectorRow | undefined>;
    delete(id: string, organizationId: string): Promise<boolean>;
    count(organizationId: string): Promise<number>;
    countByStatus(organizationId: string): Promise<Record<string, number>>;
  };
  /** Phase 11 — Campaign Contact Queue */
  campaignContacts: {
    create(input: Omit<CampaignContactRow, "id" | "createdAt" | "updatedAt" | "queuedAt" | "startedAt" | "endedAt" | "attempts" | "callOutcome">): Promise<CampaignContactRow>;
    get(id: string, organizationId: string): Promise<CampaignContactRow | undefined>;
    listByCampaign(organizationId: string, campaignId: string, status?: ContactQueueStatus): Promise<CampaignContactRow[]>;
    update(id: string, organizationId: string, patch: Partial<Pick<CampaignContactRow, "status" | "callOutcome" | "callId" | "voiceSessionId" | "startedAt" | "endedAt" | "attempts" | "metadata">>): Promise<CampaignContactRow | undefined>;
    count(organizationId: string, campaignId: string, status?: ContactQueueStatus): Promise<number>;
    countByStatus(organizationId: string, campaignId: string): Promise<Record<string, number>>;
    countByOutcome(organizationId: string, campaignId: string): Promise<Record<string, number>>;
  };
  /** Phase 11 — Operational Alerts */
  operationalAlerts: {
    create(input: Omit<OperationalAlertRow, "id" | "createdAt" | "updatedAt" | "acknowledged" | "acknowledgedAt" | "resolved" | "resolvedAt">): Promise<OperationalAlertRow>;
    get(id: string, organizationId: string): Promise<OperationalAlertRow | undefined>;
    listByOrg(organizationId: string, unresolvedOnly?: boolean): Promise<OperationalAlertRow[]>;
    acknowledge(id: string, organizationId: string): Promise<OperationalAlertRow | undefined>;
    resolve(id: string, organizationId: string): Promise<OperationalAlertRow | undefined>;
    count(organizationId: string, unresolvedOnly?: boolean): Promise<number>;
  };
  /** Phase 12 — Campaign Execution Engine repositories */
  contactsPhase12: {
    create(input: Omit<ContactRow, "id" | "createdAt" | "updatedAt" | "importedAt" | "validationStatus" | "phoneValidation" | "isDnc" | "isDuplicate" | "priority"> & { validationStatus?: ContactValidationStatus; phoneValidation?: PhoneValidationStatus; isDnc?: boolean; isDuplicate?: boolean; priority?: number; importedAt?: string }): Promise<ContactRow>;
    get(id: string, organizationId: string): Promise<ContactRow | undefined>;
    listByOrg(organizationId: string, status?: ContactValidationStatus): Promise<ContactRow[]>;
    findByNormalizedPhone(organizationId: string, normalizedPhone: string): Promise<ContactRow | undefined>;
    update(id: string, organizationId: string, patch: Partial<Omit<ContactRow, "id" | "organizationId" | "createdAt" | "updatedAt" | "importedAt">>): Promise<ContactRow | undefined>;
    delete(id: string, organizationId: string): Promise<boolean>;
    count(organizationId: string, status?: ContactValidationStatus): Promise<number>;
    countByValidationStatus(organizationId: string): Promise<Record<string, number>>;
  };
  campaignContactsPhase12: {
    create(input: Omit<CampaignContactPhase12Row, "id" | "createdAt" | "updatedAt" | "status" | "attemptNumber" | "blocked" | "isCallback" | "lastOutcome" | "lastOutcomeDetail" | "lastAttemptAt" | "nextAttemptAt" | "callId" | "voiceSessionId" | "lockedAt" | "lockedBy" | "expiresAt">): Promise<CampaignContactPhase12Row>;
    get(id: string, organizationId: string): Promise<CampaignContactPhase12Row | undefined>;
    listByCampaign(organizationId: string, campaignId: string, status?: DialingQueueItemStatus): Promise<CampaignContactPhase12Row[]>;
    getNextQueued(organizationId: string, campaignId: string): Promise<CampaignContactPhase12Row | undefined>;
    reserve(id: string, organizationId: string, workerId: string, lockTimeoutSeconds?: number): Promise<CampaignContactPhase12Row | undefined>;
    release(id: string, organizationId: string): Promise<CampaignContactPhase12Row | undefined>;
    update(id: string, organizationId: string, patch: Partial<Omit<CampaignContactPhase12Row, "id" | "organizationId" | "campaignId" | "contactId" | "createdAt" | "updatedAt">>): Promise<CampaignContactPhase12Row | undefined>;
    countByStatus(organizationId: string, campaignId: string): Promise<Record<string, number>>;
    countByOutcome(organizationId: string, campaignId: string): Promise<Record<string, number>>;
  };
  dialAttemptsPhase12: {
    create(input: Omit<DialAttemptRow, "id" | "createdAt" | "startedAt" | "connectedAt" | "endedAt" | "outcome" | "outcomeDetail" | "durationSeconds" | "errorMessage">): Promise<DialAttemptRow>;
    get(id: string, organizationId: string): Promise<DialAttemptRow | undefined>;
    listByCampaignContact(organizationId: string, campaignContactId: string): Promise<DialAttemptRow[]>;
    listByCampaign(organizationId: string, campaignId: string, limit?: number): Promise<DialAttemptRow[]>;
    update(id: string, organizationId: string, patch: Partial<Pick<DialAttemptRow, "outcome" | "outcomeDetail" | "durationSeconds" | "connectedAt" | "endedAt" | "errorMessage" | "callId" | "voiceSessionId" | "metadata">>): Promise<DialAttemptRow | undefined>;
  };
  campaignEventsPhase12: {
    create(input: Omit<CampaignEventRow, "id" | "createdAt">): Promise<CampaignEventRow>;
    listByCampaign(organizationId: string, campaignId: string, limit?: number): Promise<CampaignEventRow[]>;
  };
  retryPoliciesPhase12: {
    create(input: Omit<RetryPolicyRow, "id" | "createdAt" | "updatedAt" | "isActive">): Promise<RetryPolicyRow>;
    get(id: string, organizationId: string): Promise<RetryPolicyRow | undefined>;
    listByOrg(organizationId: string): Promise<RetryPolicyRow[]>;
    getDefault(organizationId: string): Promise<RetryPolicyRow | undefined>;
    update(id: string, organizationId: string, patch: Partial<Omit<RetryPolicyRow, "id" | "organizationId" | "createdAt" | "updatedAt">>): Promise<RetryPolicyRow | undefined>;
  };
  campaignSchedulesPhase12: {
    create(input: Omit<CampaignScheduleRow, "id" | "createdAt" | "updatedAt" | "isActive">): Promise<CampaignScheduleRow>;
    get(id: string, organizationId: string): Promise<CampaignScheduleRow | undefined>;
    getByCampaign(organizationId: string, campaignId: string): Promise<CampaignScheduleRow | undefined>;
    update(id: string, organizationId: string, patch: Partial<Omit<CampaignScheduleRow, "id" | "organizationId" | "createdAt" | "updatedAt">>): Promise<CampaignScheduleRow | undefined>;
  };
  connectorMappings: {
    create(input: Omit<DataConnectorFieldMappingRow, "id" | "createdAt" | "updatedAt">): Promise<DataConnectorFieldMappingRow>;
    get(id: string, organizationId: string): Promise<DataConnectorFieldMappingRow | undefined>;
    listByConnector(organizationId: string, connectorId: string): Promise<DataConnectorFieldMappingRow[]>;
    update(id: string, organizationId: string, patch: Partial<Omit<DataConnectorFieldMappingRow, "id" | "organizationId" | "connectorId" | "createdAt" | "updatedAt">>): Promise<DataConnectorFieldMappingRow | undefined>;
    delete(id: string, organizationId: string): Promise<boolean>;
    deleteByConnector(organizationId: string, connectorId: string): Promise<number>;
    count(organizationId: string, connectorId: string): Promise<number>;
  };
  connectorSyncJobs: {
    create(input: Omit<DataConnectorSyncJobRow, "id" | "createdAt" | "updatedAt" | "status" | "startedAt" | "completedAt" | "recordsProcessed" | "recordsFailed" | "errorMessage">): Promise<DataConnectorSyncJobRow>;
    get(id: string, organizationId: string): Promise<DataConnectorSyncJobRow | undefined>;
    listByConnector(organizationId: string, connectorId: string, limit?: number): Promise<DataConnectorSyncJobRow[]>;
    update(id: string, organizationId: string, patch: Partial<Pick<DataConnectorSyncJobRow, "status" | "startedAt" | "completedAt" | "recordsProcessed" | "recordsFailed" | "errorMessage" | "metadata">>): Promise<DataConnectorSyncJobRow | undefined>;
    count(organizationId: string, connectorId: string, status?: SyncJobStatus): Promise<number>;
  };
  connectorActivities: {
    create(input: Omit<DataConnectorActivityRow, "id" | "createdAt">): Promise<DataConnectorActivityRow>;
    listByConnector(organizationId: string, connectorId: string, limit?: number): Promise<DataConnectorActivityRow[]>;
    listByOrg(organizationId: string, limit?: number): Promise<DataConnectorActivityRow[]>;
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
    calls: Map<string, CallRow>;
    callEvents: CallEventRow[];
    orgProviders: Map<string, OrganizationTelephonyProviderRow>;
    plans: Map<string, PlanRow>;
    subscriptions: Map<string, SubscriptionRow>;
    entitlements: Map<string, OrganizationEntitlementRow>;
    invoices: Map<string, InvoiceRow>;
    payments: Map<string, PaymentRow>;
    branding: Map<string, OrganizationBrandingRow>;
    audit: AuditEventRow[];
    campaigns: Map<string, CampaignRow>;
    compliancePolicies: Map<string, CompliancePolicyRow>;
    complianceEvaluations: Map<string, ComplianceEvaluationRow>;
    dncRecords: Map<string, DNCRecordRow>;
    qaTemplates: Map<string, QAEvaluationTemplateRow>;
    qaCriteria: Map<string, QAEvaluationCriterionRow>;
    qaEvaluations: Map<string, QAEvaluationRow>;
    qaScores: Map<string, QAEvaluationScoreRow>;
    qaFindings: Map<string, QAFindingRow>;
    connectors: Map<string, DataConnectorRow>;
    connectorMappings: Map<string, DataConnectorFieldMappingRow>;
    connectorSyncJobs: Map<string, DataConnectorSyncJobRow>;
    connectorActivities: DataConnectorActivityRow[];
    campaignContacts: Map<string, CampaignContactRow>;
    operationalAlerts: Map<string, OperationalAlertRow>;
    contactsPhase12: Map<string, ContactRow>;
    campaignContactsPhase12: Map<string, CampaignContactPhase12Row>;
    dialAttemptsPhase12: Map<string, DialAttemptRow>;
    campaignEventsPhase12: CampaignEventRow[];
    retryPoliciesPhase12: Map<string, RetryPolicyRow>;
    campaignSchedulesPhase12: Map<string, CampaignScheduleRow>;
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

    // The in-browser demo tenant has a real local subscription so entitlement checks exercise
    // the same fail-closed path as production. This is capability seeding, never fake billing.
    const plans = new Map<string, PlanRow>();
    plans.set("plan_starter", {
      id: "plan_starter",
      name: "Starter",
      planType: "starter",
      status: "active",
      features: ["ai_agents", "voice_calls", "analytics"],
      limits: { maxUsers: 5, maxAgents: 3, maxMonthlyMinutes: 1000, maxCampaigns: 0, maxConnectors: 1 },
      createdAt: stamp,
      updatedAt: stamp,
    });
    const subscriptions = new Map<string, SubscriptionRow>();
    subscriptions.set("sub_demo_starter", {
      id: "sub_demo_starter",
      organizationId: DEMO_ORGANIZATION_ID,
      planId: "plan_starter",
      status: "active",
      effectiveLimits: null,
      trialEndsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelledAt: null,
      startedAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    });

    return {
      organizations,
      users,
      credentials: new Map(),
      agents,
      sessions: new Map(),
      messages: new Map(),
      usage: [],
      calls: new Map(),
      callEvents: [],
      orgProviders: new Map(),
      plans,
      subscriptions,
      entitlements: new Map(),
      invoices: new Map(),
      payments: new Map(),
      branding: new Map(),
      audit: [],
      campaigns: new Map(),
      compliancePolicies: new Map(),
      complianceEvaluations: new Map(),
      dncRecords: new Map(),
      qaTemplates: new Map(),
      qaCriteria: new Map(),
      qaEvaluations: new Map(),
      qaScores: new Map(),
      qaFindings: new Map(),
      connectors: new Map(),
      connectorMappings: new Map(),
      connectorSyncJobs: new Map(),
      connectorActivities: [],
      campaignContacts: new Map(),
      operationalAlerts: new Map(),
      contactsPhase12: new Map(),
      campaignContactsPhase12: new Map(),
      dialAttemptsPhase12: new Map(),
      campaignEventsPhase12: [],
      retryPoliciesPhase12: new Map(),
      campaignSchedulesPhase12: new Map(),
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

    calls: {
      create: async (input) => {
        const stamp = now();
        const row: CallRow = {
          ...input,
          startedAt: stamp,
          answeredAt: null,
          endedAt: null,
          durationSeconds: null,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.calls.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.calls.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByOrg: async (organizationId) =>
        [...data.calls.values()].filter((c) => c.organizationId === organizationId),
      findByProviderCallId: async (provider, providerCallId) =>
        [...data.calls.values()].find(
          (c) => c.provider === provider && c.providerCallId === providerCallId
        ) ?? undefined,
      update: async (id, organizationId, changes) => {
        const row = data.calls.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...changes, updatedAt: now() };
        data.calls.set(id, next);
        return next;
      },
    },

    callEvents: {
      create: async (input) => {
        const row: CallEventRow = {
          ...input,
          createdAt: now(),
        };
        data.callEvents.push(row);
        return row;
      },
      listByCall: async (callId) =>
        data.callEvents
          .filter((e) => e.callId === callId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      findByProviderEventId: async (provider, providerEventId) =>
        data.callEvents.find(
          (e) => e.provider === provider && e.providerEventId === providerEventId
        ) ?? undefined,
    },

    orgProviders: {
      create: async (input) => {
        const stamp = now();
        const row: OrganizationTelephonyProviderRow = {
          ...input,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.orgProviders.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.orgProviders.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByOrg: async (organizationId) =>
        [...data.orgProviders.values()].filter((p) => p.organizationId === organizationId),
      findByOrgAndProvider: async (organizationId, provider) =>
        [...data.orgProviders.values()].find(
          (p) => p.organizationId === organizationId && p.provider === provider
        ) ?? undefined,
      update: async (id, organizationId, changes) => {
        const row = data.orgProviders.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...changes, updatedAt: now() };
        data.orgProviders.set(id, next);
        return next;
      },
      remove: async (id, organizationId) => {
        const row = data.orgProviders.get(id);
        if (!row || row.organizationId !== organizationId) return false;
        data.orgProviders.delete(id);
        return true;
      },
    },

    plans: {
      get: async (id: string) => data.plans.get(id),
      list: async () => Array.from(data.plans.values()),
      create: async (input) => {
        const row: PlanRow = { ...input, createdAt: now(), updatedAt: now() };
        data.plans.set(row.id, row);
        return row;
      },
      update: async (id, changes) => {
        const existing = data.plans.get(id);
        if (!existing) return undefined;
        const updated = { ...existing, ...changes, updatedAt: now() };
        data.plans.set(id, updated);
        return updated;
      },
    },

    subscriptions: {
      getByOrg: async (organizationId: string) => {
        for (const sub of data.subscriptions.values()) {
          if (sub.organizationId === organizationId) return sub;
        }
        return undefined;
      },
      create: async (input) => {
        const stamp = now();
        const row: SubscriptionRow = {
          ...input,
          id: input.id || newId("sub"),
          startedAt: input.startedAt || stamp,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.subscriptions.set(row.id, row);
        return row;
      },
      update: async (id, changes) => {
        const existing = data.subscriptions.get(id);
        if (!existing) return undefined;
        const updated = { ...existing, ...changes, updatedAt: now() };
        data.subscriptions.set(id, updated);
        return updated;
      },
      listAll: async () => Array.from(data.subscriptions.values()),
    },

    entitlements: {
      get: async (organizationId, feature) =>
        data.entitlements.get(`${organizationId}:${feature}`),
      listByOrg: async (organizationId) =>
        [...data.entitlements.values()]
          .filter((row) => row.organizationId === organizationId)
          .sort((a, b) => a.feature.localeCompare(b.feature)),
      upsert: async (input) => {
        const key = `${input.organizationId}:${input.feature}`;
        const current = data.entitlements.get(key);
        const stamp = now();
        const row: OrganizationEntitlementRow = {
          ...input,
          id: current?.id ?? newId("ent"),
          createdAt: current?.createdAt ?? stamp,
          updatedAt: stamp,
        };
        data.entitlements.set(key, row);
        return row;
      },
      remove: async (organizationId, feature) =>
        data.entitlements.delete(`${organizationId}:${feature}`),
    },

    /* ── Phase 15 — Billing Storage (unused until a payment provider is configured) ── */
    invoices: {
      create: async (input) => {
        const stamp = now();
        const row: InvoiceRow = {
          ...input,
          id: newId("inv"),
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.invoices.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.invoices.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByOrg: async (organizationId) =>
        [...data.invoices.values()]
          .filter((i) => i.organizationId === organizationId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      listBySubscription: async (subscriptionId) =>
        [...data.invoices.values()]
          .filter((i) => i.subscriptionId === subscriptionId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      update: async (id, organizationId, changes) => {
        const row = data.invoices.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const updated = { ...row, ...changes, updatedAt: now() };
        data.invoices.set(id, updated);
        return updated;
      },
      getByInvoiceNumber: async (invoiceNumber) => {
        for (const inv of data.invoices.values()) {
          if (inv.invoiceNumber === invoiceNumber) return inv;
        }
        return undefined;
      },
    },

    payments: {
      create: async (input) => {
        const stamp = now();
        const row: PaymentRow = {
          ...input,
          id: newId("pay"),
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.payments.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.payments.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByInvoice: async (invoiceId) =>
        [...data.payments.values()]
          .filter((p) => p.invoiceId === invoiceId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      listByOrg: async (organizationId) =>
        [...data.payments.values()]
          .filter((p) => p.organizationId === organizationId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      update: async (id, organizationId, changes) => {
        const row = data.payments.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const updated = { ...row, ...changes, updatedAt: now() };
        data.payments.set(id, updated);
        return updated;
      },
      getByIdempotencyKey: async (idempotencyKey) => {
        for (const pay of data.payments.values()) {
          if (pay.idempotencyKey === idempotencyKey) return pay;
        }
        return undefined;
      },
    },

    branding: {
      getByOrg: async (organizationId: string) => data.branding.get(organizationId),
      upsert: async (input) => {
        const row: OrganizationBrandingRow = {
          ...input,
          id: input.id || newId("brand"),
          createdAt: data.branding.get(input.organizationId)?.createdAt || now(),
          updatedAt: now(),
        };
        data.branding.set(input.organizationId, row);
        return row;
      },
      update: async (organizationId, changes) => {
        const existing = data.branding.get(organizationId);
        if (!existing) return undefined;
        const updated = { ...existing, ...changes, updatedAt: now() };
        data.branding.set(organizationId, updated);
        return updated;
      },
    },

    audit: {
      create: async (input) => {
        const row: AuditEventRow = {
          ...input,
          id: newId("audit"),
          createdAt: now(),
        };
        data.audit.push(row);
        return row;
      },
      listByOrg: async (organizationId: string, limit?: number) => {
        const filtered = data.audit.filter((e) => e.organizationId === organizationId);
        filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return limit ? filtered.slice(0, limit) : filtered;
      },
      listAll: async (limit?: number) => {
        const sorted = [...data.audit].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return limit ? sorted.slice(0, limit) : sorted;
      },
    },

    campaigns: {
      create: async (input) => {
        const stamp = now();
        const row: CampaignRow = {
          ...input,
          id: newId("cmp"),
          processedContacts: 0,
          completedCalls: 0,
          failedCalls: 0,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.campaigns.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.campaigns.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByOrg: async (organizationId) =>
        [...data.campaigns.values()]
          .filter((c) => c.organizationId === organizationId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      update: async (id, organizationId, patch) => {
        const row = data.campaigns.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.campaigns.set(id, next);
        return next;
      },
      delete: async (id, organizationId) => {
        const row = data.campaigns.get(id);
        if (!row || row.organizationId !== organizationId) return false;
        data.campaigns.delete(id);
        return true;
      },
      count: async (organizationId) =>
        [...data.campaigns.values()].filter((c) => c.organizationId === organizationId).length,
      countByStatus: async (organizationId) => {
        const campaigns = [...data.campaigns.values()].filter(
          (c) => c.organizationId === organizationId
        );
        const counts: Record<string, number> = {};
        for (const c of campaigns) {
          counts[c.status] = (counts[c.status] || 0) + 1;
        }
        return counts;
      },
    },

    // ─── Phase 10C — Compliance Policy repositories ──────────────────────
    compliancePolicies: {
      create: async (input) => {
        const stamp = now();
        const row: CompliancePolicyRow = {
          ...input,
          id: newId("cpol"),
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.compliancePolicies.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.compliancePolicies.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByOrg: async (organizationId) =>
        [...data.compliancePolicies.values()]
          .filter((p) => p.organizationId === organizationId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      update: async (id, organizationId, patch) => {
        const row = data.compliancePolicies.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.compliancePolicies.set(id, next);
        return next;
      },
      delete: async (id, organizationId) => {
        const row = data.compliancePolicies.get(id);
        if (!row || row.organizationId !== organizationId) return false;
        data.compliancePolicies.delete(id);
        return true;
      },
      count: async (organizationId) =>
        [...data.compliancePolicies.values()].filter((p) => p.organizationId === organizationId).length,
      countByCategory: async (organizationId) => {
        const policies = [...data.compliancePolicies.values()].filter(
          (p) => p.organizationId === organizationId
        );
        const counts: Record<string, number> = {};
        for (const p of policies) {
          counts[p.category] = (counts[p.category] || 0) + 1;
        }
        return counts;
      },
    },

    complianceEvaluations: {
      create: async (input) => {
        const row: ComplianceEvaluationRow = {
          ...input,
          id: newId("ceval"),
          evaluatedAt: now(),
        };
        data.complianceEvaluations.set(row.id, row);
        return row;
      },
      listByOrg: async (organizationId, limit) => {
        const filtered = [...data.complianceEvaluations.values()]
          .filter((e) => e.organizationId === organizationId)
          .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt));
        return limit ? filtered.slice(0, limit) : filtered;
      },
      listByPolicy: async (organizationId, policyId) =>
        [...data.complianceEvaluations.values()]
          .filter((e) => e.organizationId === organizationId && e.policyId === policyId)
          .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt)),
      listByResource: async (resourceType, resourceId) =>
        [...data.complianceEvaluations.values()]
          .filter((e) => e.resourceType === resourceType && e.resourceId === resourceId)
          .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt)),
      count: async (organizationId) =>
        [...data.complianceEvaluations.values()].filter((e) => e.organizationId === organizationId).length,
      countByStatus: async (organizationId) => {
        const evaluations = [...data.complianceEvaluations.values()].filter(
          (e) => e.organizationId === organizationId
        );
        const counts: Record<string, number> = {};
        for (const e of evaluations) {
          counts[e.status] = (counts[e.status] || 0) + 1;
        }
        return counts;
      },
    },

    // ─── Phase 10C — DNC repository ──────────────────────────────────────
    dncRecords: {
      create: async (input) => {
        const stamp = now();
        const row: DNCRecordRow = {
          ...input,
          id: newId("dnc"),
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.dncRecords.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.dncRecords.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByOrg: async (organizationId) =>
        [...data.dncRecords.values()]
          .filter((r) => r.organizationId === organizationId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      delete: async (id, organizationId) => {
        const row = data.dncRecords.get(id);
        if (!row || row.organizationId !== organizationId) return false;
        data.dncRecords.delete(id);
        return true;
      },
      count: async (organizationId) =>
        [...data.dncRecords.values()].filter((r) => r.organizationId === organizationId).length,
      countByStatus: async (organizationId) => {
        const records = [...data.dncRecords.values()].filter(
          (r) => r.organizationId === organizationId
        );
        const counts: Record<string, number> = {};
        for (const r of records) {
          counts[r.status] = (counts[r.status] || 0) + 1;
        }
        return counts;
      },
      findByIdentifier: async (organizationId, identifier, identifierType) => {
        const record = [...data.dncRecords.values()].find(
          (r) =>
            r.organizationId === organizationId &&
            r.identifier === identifier &&
            r.identifierType === identifierType &&
            r.status === "ACTIVE"
        );
        return record ?? undefined;
      },
    },

    // ─── Phase 10D — QA Evaluation repositories ─────────────────────────
    qaTemplates: {
      create: async (input) => {
        const stamp = now();
        const row: QAEvaluationTemplateRow = {
          ...input,
          id: newId("qat"),
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.qaTemplates.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.qaTemplates.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByOrg: async (organizationId, status) => {
        let templates = [...data.qaTemplates.values()].filter(
          (t) => t.organizationId === organizationId
        );
        if (status) {
          templates = templates.filter((t) => t.status === status);
        }
        return templates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      update: async (id, organizationId, patch) => {
        const row = data.qaTemplates.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.qaTemplates.set(id, next);
        return next;
      },
      delete: async (id, organizationId) => {
        const row = data.qaTemplates.get(id);
        if (!row || row.organizationId !== organizationId) return false;
        data.qaTemplates.delete(id);
        return true;
      },
      count: async (organizationId) =>
        [...data.qaTemplates.values()].filter((t) => t.organizationId === organizationId).length,
      countByStatus: async (organizationId) => {
        const templates = [...data.qaTemplates.values()].filter(
          (t) => t.organizationId === organizationId
        );
        const counts: Record<string, number> = {};
        for (const t of templates) {
          counts[t.status] = (counts[t.status] || 0) + 1;
        }
        return counts;
      },
    },

    qaCriteria: {
      create: async (input) => {
        const stamp = now();
        const row: QAEvaluationCriterionRow = {
          ...input,
          id: newId("qac"),
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.qaCriteria.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.qaCriteria.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByTemplate: async (organizationId, templateId) =>
        [...data.qaCriteria.values()]
          .filter((c) => c.organizationId === organizationId && c.templateId === templateId)
          .sort((a, b) => a.displayOrder - b.displayOrder),
      update: async (id, organizationId, patch) => {
        const row = data.qaCriteria.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.qaCriteria.set(id, next);
        return next;
      },
      delete: async (id, organizationId) => {
        const row = data.qaCriteria.get(id);
        if (!row || row.organizationId !== organizationId) return false;
        data.qaCriteria.delete(id);
        return true;
      },
      deleteByTemplate: async (organizationId, templateId) => {
        const criteria = [...data.qaCriteria.values()].filter(
          (c) => c.organizationId === organizationId && c.templateId === templateId
        );
        for (const c of criteria) {
          data.qaCriteria.delete(c.id);
        }
        return criteria.length;
      },
    },

    qaEvaluations: {
      create: async (input) => {
        const stamp = now();
        const row: QAEvaluationRow = {
          ...input,
          id: newId("qae"),
          totalScore: null,
          passed: null,
          submittedAt: null,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.qaEvaluations.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.qaEvaluations.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByOrg: async (organizationId, status) => {
        let evaluations = [...data.qaEvaluations.values()].filter(
          (e) => e.organizationId === organizationId
        );
        if (status) {
          evaluations = evaluations.filter((e) => e.status === status);
        }
        return evaluations.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      listByVoiceSession: async (organizationId, voiceSessionId) =>
        [...data.qaEvaluations.values()]
          .filter((e) => e.organizationId === organizationId && e.voiceSessionId === voiceSessionId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      listByEvaluator: async (organizationId, evaluatorId) =>
        [...data.qaEvaluations.values()]
          .filter((e) => e.organizationId === organizationId && e.evaluatorId === evaluatorId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      update: async (id, organizationId, patch) => {
        const row = data.qaEvaluations.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.qaEvaluations.set(id, next);
        return next;
      },
      delete: async (id, organizationId) => {
        const row = data.qaEvaluations.get(id);
        if (!row || row.organizationId !== organizationId) return false;
        data.qaEvaluations.delete(id);
        return true;
      },
      count: async (organizationId) =>
        [...data.qaEvaluations.values()].filter((e) => e.organizationId === organizationId).length,
      countByStatus: async (organizationId) => {
        const evaluations = [...data.qaEvaluations.values()].filter(
          (e) => e.organizationId === organizationId
        );
        const counts: Record<string, number> = {};
        for (const e of evaluations) {
          counts[e.status] = (counts[e.status] || 0) + 1;
        }
        return counts;
      },
    },

    qaScores: {
      create: async (input) => {
        const stamp = now();
        const row: QAEvaluationScoreRow = {
          ...input,
          id: newId("qas"),
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.qaScores.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.qaScores.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByEvaluation: async (organizationId, evaluationId) =>
        [...data.qaScores.values()]
          .filter((s) => s.organizationId === organizationId && s.evaluationId === evaluationId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      update: async (id, organizationId, patch) => {
        const row = data.qaScores.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.qaScores.set(id, next);
        return next;
      },
      delete: async (id, organizationId) => {
        const row = data.qaScores.get(id);
        if (!row || row.organizationId !== organizationId) return false;
        data.qaScores.delete(id);
        return true;
      },
      deleteByEvaluation: async (organizationId, evaluationId) => {
        const scores = [...data.qaScores.values()].filter(
          (s) => s.organizationId === organizationId && s.evaluationId === evaluationId
        );
        for (const s of scores) {
          data.qaScores.delete(s.id);
        }
        return scores.length;
      },
    },

    qaFindings: {
      create: async (input) => {
        const stamp = now();
        const row: QAFindingRow = {
          ...input,
          id: newId("qaf"),
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.qaFindings.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.qaFindings.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByEvaluation: async (organizationId, evaluationId) =>
        [...data.qaFindings.values()]
          .filter((f) => f.organizationId === organizationId && f.evaluationId === evaluationId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      listByOrg: async (organizationId, status) => {
        let findings = [...data.qaFindings.values()].filter(
          (f) => f.organizationId === organizationId
        );
        if (status) {
          findings = findings.filter((f) => f.status === status);
        }
        return findings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      update: async (id, organizationId, patch) => {
        const row = data.qaFindings.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.qaFindings.set(id, next);
        return next;
      },
      delete: async (id, organizationId) => {
        const row = data.qaFindings.get(id);
        if (!row || row.organizationId !== organizationId) return false;
        data.qaFindings.delete(id);
        return true;
      },
      count: async (organizationId) =>
        [...data.qaFindings.values()].filter((f) => f.organizationId === organizationId).length,
      countByStatus: async (organizationId) => {
        const findings = [...data.qaFindings.values()].filter(
          (f) => f.organizationId === organizationId
        );
        const counts: Record<string, number> = {};
        for (const f of findings) {
          counts[f.status] = (counts[f.status] || 0) + 1;
        }
        return counts;
      },
    },

    // ─── Phase 10E — Data Connector repositories ─────────────────────────
    connectors: {
      create: async (input) => {
        const stamp = now();
        const row: DataConnectorRow = {
          ...input,
          id: newId("conn"),
          status: "DRAFT",
          healthStatus: "UNKNOWN",
          lastSyncAt: null,
          lastTestedAt: null,
          lastHealthCheckAt: null,
          enabled: false,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.connectors.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.connectors.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByOrg: async (organizationId, type, status) => {
        let connectors = [...data.connectors.values()].filter(
          (c) => c.organizationId === organizationId
        );
        if (type) {
          connectors = connectors.filter((c) => c.type === type);
        }
        if (status) {
          connectors = connectors.filter((c) => c.status === status);
        }
        return connectors.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      update: async (id, organizationId, patch) => {
        const row = data.connectors.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.connectors.set(id, next);
        return next;
      },
      delete: async (id, organizationId) => {
        const row = data.connectors.get(id);
        if (!row || row.organizationId !== organizationId) return false;
        data.connectors.delete(id);
        // Cascade delete mappings, sync jobs, and activities
        for (const [mid, m] of data.connectorMappings) {
          if (m.connectorId === id && m.organizationId === organizationId) {
            data.connectorMappings.delete(mid);
          }
        }
        for (const [jid, j] of data.connectorSyncJobs) {
          if (j.connectorId === id && j.organizationId === organizationId) {
            data.connectorSyncJobs.delete(jid);
          }
        }
        data.connectorActivities = data.connectorActivities.filter(
          (a) => !(a.connectorId === id && a.organizationId === organizationId)
        );
        return true;
      },
      count: async (organizationId) =>
        [...data.connectors.values()].filter((c) => c.organizationId === organizationId).length,
      countByStatus: async (organizationId) => {
        const connectors = [...data.connectors.values()].filter(
          (c) => c.organizationId === organizationId
        );
        const counts: Record<string, number> = {};
        for (const c of connectors) {
          counts[c.status] = (counts[c.status] || 0) + 1;
        }
        return counts;
      },
    },

    connectorMappings: {
      create: async (input) => {
        const stamp = now();
        const row: DataConnectorFieldMappingRow = {
          ...input,
          id: newId("cmap"),
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.connectorMappings.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.connectorMappings.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        return row;
      },
      listByConnector: async (organizationId, connectorId) =>
        [...data.connectorMappings.values()]
          .filter((m) => m.organizationId === organizationId && m.connectorId === connectorId)
          .sort((a, b) => a.displayOrder - b.displayOrder),
      update: async (id, organizationId, patch) => {
        const row = data.connectorMappings.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.connectorMappings.set(id, next);
        return next;
      },
      delete: async (id, organizationId) => {
        const row = data.connectorMappings.get(id);
        if (!row || row.organizationId !== organizationId) return false;
        data.connectorMappings.delete(id);
        return true;
      },
      deleteByConnector: async (organizationId, connectorId) => {
        const mappings = [...data.connectorMappings.values()].filter(
          (m) => m.organizationId === organizationId && m.connectorId === connectorId
        );
        for (const m of mappings) {
          data.connectorMappings.delete(m.id);
        }
        return mappings.length;
      },
      count: async (organizationId, connectorId) =>
        [...data.connectorMappings.values()].filter(
          (m) => m.organizationId === organizationId && m.connectorId === connectorId
        ).length,
    },

    connectorSyncJobs: {
      create: async (input) => {
        const stamp = now();
        const row: DataConnectorSyncJobRow = {
          ...input,
          id: newId("csj"),
          status: "PENDING",
          startedAt: null,
          completedAt: null,
          recordsProcessed: 0,
          recordsFailed: 0,
          errorMessage: null,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.connectorSyncJobs.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.connectorSyncJobs.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByConnector: async (organizationId, connectorId, limit) => {
        const filtered = [...data.connectorSyncJobs.values()]
          .filter((j) => j.organizationId === organizationId && j.connectorId === connectorId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return limit ? filtered.slice(0, limit) : filtered;
      },
      update: async (id, organizationId, patch) => {
        const row = data.connectorSyncJobs.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.connectorSyncJobs.set(id, next);
        return next;
      },
      count: async (organizationId, connectorId, status) => {
        let jobs = [...data.connectorSyncJobs.values()].filter(
          (j) => j.organizationId === organizationId && j.connectorId === connectorId
        );
        if (status) {
          jobs = jobs.filter((j) => j.status === status);
        }
        return jobs.length;
      },
    },

    connectorActivities: {
      create: async (input) => {
        const row: DataConnectorActivityRow = {
          ...input,
          id: newId("cact"),
          createdAt: now(),
        };
        data.connectorActivities.push(row);
        return row;
      },
      listByConnector: async (organizationId, connectorId, limit) => {
        const filtered = data.connectorActivities
          .filter((a) => a.organizationId === organizationId && a.connectorId === connectorId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return limit ? filtered.slice(0, limit) : filtered;
      },
      listByOrg: async (organizationId, limit) => {
        const filtered = data.connectorActivities
          .filter((a) => a.organizationId === organizationId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return limit ? filtered.slice(0, limit) : filtered;
      },
    },

    // ─── Phase 11 — Campaign Contact Queue ──────────────────────────────
    campaignContacts: {
      create: async (input) => {
        const stamp = now();
        const row: CampaignContactRow = {
          ...input,
          id: newId("cc"),
          queuedAt: stamp,
          startedAt: null,
          endedAt: null,
          attempts: 0,
          callOutcome: null,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.campaignContacts.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.campaignContacts.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByCampaign: async (organizationId, campaignId, status) => {
        let contacts = [...data.campaignContacts.values()].filter(
          (c) => c.organizationId === organizationId && c.campaignId === campaignId
        );
        if (status) {
          contacts = contacts.filter((c) => c.status === status);
        }
        return contacts.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
      },
      update: async (id, organizationId, patch) => {
        const row = data.campaignContacts.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.campaignContacts.set(id, next);
        return next;
      },
      count: async (organizationId, campaignId, status) => {
        let contacts = [...data.campaignContacts.values()].filter(
          (c) => c.organizationId === organizationId && c.campaignId === campaignId
        );
        if (status) {
          contacts = contacts.filter((c) => c.status === status);
        }
        return contacts.length;
      },
      countByStatus: async (organizationId, campaignId) => {
        const contacts = [...data.campaignContacts.values()].filter(
          (c) => c.organizationId === organizationId && c.campaignId === campaignId
        );
        const counts: Record<string, number> = {};
        for (const c of contacts) {
          counts[c.status] = (counts[c.status] || 0) + 1;
        }
        return counts;
      },
      countByOutcome: async (organizationId, campaignId) => {
        const contacts = [...data.campaignContacts.values()].filter(
          (c) => c.organizationId === organizationId && c.campaignId === campaignId
        );
        const counts: Record<string, number> = {};
        for (const c of contacts) {
          const outcome = c.callOutcome || "NONE";
          counts[outcome] = (counts[outcome] || 0) + 1;
        }
        return counts;
      },
    },

    // ─── Phase 11 — Operational Alerts ──────────────────────────────────
    operationalAlerts: {
      create: async (input) => {
        const stamp = now();
        const row: OperationalAlertRow = {
          ...input,
          id: newId("alert"),
          acknowledged: false,
          acknowledgedAt: null,
          resolved: false,
          resolvedAt: null,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.operationalAlerts.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.operationalAlerts.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByOrg: async (organizationId, unresolvedOnly) => {
        let alerts = [...data.operationalAlerts.values()].filter(
          (a) => a.organizationId === organizationId
        );
        if (unresolvedOnly) {
          alerts = alerts.filter((a) => !a.resolved);
        }
        return alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      acknowledge: async (id, organizationId) => {
        const row = data.operationalAlerts.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = {
          ...row,
          acknowledged: true,
          acknowledgedAt: now(),
          updatedAt: now(),
        };
        data.operationalAlerts.set(id, next);
        return next;
      },
      resolve: async (id, organizationId) => {
        const row = data.operationalAlerts.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = {
          ...row,
          resolved: true,
          resolvedAt: now(),
          updatedAt: now(),
        };
        data.operationalAlerts.set(id, next);
        return next;
      },
      count: async (organizationId, unresolvedOnly) => {
        let alerts = [...data.operationalAlerts.values()].filter(
          (a) => a.organizationId === organizationId
        );
        if (unresolvedOnly) {
          alerts = alerts.filter((a) => !a.resolved);
        }
        return alerts.length;
      },
    },

    // ─── Phase 12 — Campaign Execution Engine ─────────────────────────
    contactsPhase12: {
      create: async (input) => {
        const stamp = now();
        const row: ContactRow = {
          ...input,
          id: newId("p12c"),
          validationStatus: input.validationStatus ?? "PENDING",
          phoneValidation: input.phoneValidation ?? "UNKNOWN",
          isDnc: input.isDnc ?? false,
          isDuplicate: input.isDuplicate ?? false,
          priority: input.priority ?? 0,
          importedAt: input.importedAt ?? stamp,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.contactsPhase12.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.contactsPhase12.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByOrg: async (organizationId, status) => {
        let contacts = [...data.contactsPhase12.values()].filter(
          (c) => c.organizationId === organizationId
        );
        if (status) {
          contacts = contacts.filter((c) => c.validationStatus === status);
        }
        return contacts.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
      },
      findByNormalizedPhone: async (organizationId, normalizedPhone) => {
        return [...data.contactsPhase12.values()].find(
          (c) => c.organizationId === organizationId && c.normalizedPhone === normalizedPhone
        );
      },
      update: async (id, organizationId, patch) => {
        const row = data.contactsPhase12.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.contactsPhase12.set(id, next);
        return next;
      },
      delete: async (id, organizationId) => {
        const row = data.contactsPhase12.get(id);
        if (!row || row.organizationId !== organizationId) return false;
        data.contactsPhase12.delete(id);
        return true;
      },
      count: async (organizationId, status) => {
        let contacts = [...data.contactsPhase12.values()].filter(
          (c) => c.organizationId === organizationId
        );
        if (status) {
          contacts = contacts.filter((c) => c.validationStatus === status);
        }
        return contacts.length;
      },
      countByValidationStatus: async (organizationId) => {
        const contacts = [...data.contactsPhase12.values()].filter(
          (c) => c.organizationId === organizationId
        );
        const counts: Record<string, number> = {};
        for (const c of contacts) {
          counts[c.validationStatus] = (counts[c.validationStatus] || 0) + 1;
        }
        return counts;
      },
    },

    campaignContactsPhase12: {
      create: async (input) => {
        const stamp = now();
        const row: CampaignContactPhase12Row = {
          ...input,
          id: newId("p12cc"),
          status: "QUEUED",
          attemptNumber: 0,
          blocked: false,
          isCallback: false,
          lastOutcome: null,
          lastOutcomeDetail: null,
          lastAttemptAt: null,
          nextAttemptAt: null,
          callId: null,
          voiceSessionId: null,
          lockedAt: null,
          lockedBy: null,
          expiresAt: null,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.campaignContactsPhase12.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.campaignContactsPhase12.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByCampaign: async (organizationId, campaignId, status) => {
        let contacts = [...data.campaignContactsPhase12.values()].filter(
          (c) => c.organizationId === organizationId && c.campaignId === campaignId
        );
        if (status) {
          contacts = contacts.filter((c) => c.status === status);
        }
        return contacts.sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
      },
      getNextQueued: async (organizationId, campaignId) => {
        return [...data.campaignContactsPhase12.values()]
          .filter(
            (c) =>
              c.organizationId === organizationId &&
              c.campaignId === campaignId &&
              c.status === "QUEUED" &&
              !c.blocked &&
              (c.nextAttemptAt === null || c.nextAttemptAt <= now())
          )
          .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))[0];
      },
      reserve: async (id, organizationId, workerId, lockTimeoutSeconds = 300) => {
        const row = data.campaignContactsPhase12.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        if (row.status !== "QUEUED" || row.blocked) return undefined;
        const lockExpiry = new Date(Date.now() + lockTimeoutSeconds * 1000).toISOString();
        const next: CampaignContactPhase12Row = {
          ...row,
          status: "RESERVED",
          lockedAt: now(),
          lockedBy: workerId,
          expiresAt: lockExpiry,
          updatedAt: now(),
        };
        data.campaignContactsPhase12.set(id, next);
        return next;
      },
      release: async (id, organizationId) => {
        const row = data.campaignContactsPhase12.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next: CampaignContactPhase12Row = {
          ...row,
          status: "QUEUED",
          lockedAt: null,
          lockedBy: null,
          expiresAt: null,
          updatedAt: now(),
        };
        data.campaignContactsPhase12.set(id, next);
        return next;
      },
      update: async (id, organizationId, patch) => {
        const row = data.campaignContactsPhase12.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.campaignContactsPhase12.set(id, next);
        return next;
      },
      countByStatus: async (organizationId, campaignId) => {
        const contacts = [...data.campaignContactsPhase12.values()].filter(
          (c) => c.organizationId === organizationId && c.campaignId === campaignId
        );
        const counts: Record<string, number> = {};
        for (const c of contacts) {
          counts[c.status] = (counts[c.status] || 0) + 1;
        }
        return counts;
      },
      countByOutcome: async (organizationId, campaignId) => {
        const contacts = [...data.campaignContactsPhase12.values()].filter(
          (c) => c.organizationId === organizationId && c.campaignId === campaignId
        );
        const counts: Record<string, number> = {};
        for (const c of contacts) {
          const outcome = c.lastOutcome || "NONE";
          counts[outcome] = (counts[outcome] || 0) + 1;
        }
        return counts;
      },
    },

    dialAttemptsPhase12: {
      create: async (input) => {
        const stamp = now();
        const row: DialAttemptRow = {
          ...input,
          id: newId("p12da"),
          startedAt: stamp,
          connectedAt: null,
          endedAt: null,
          outcome: null,
          outcomeDetail: null,
          durationSeconds: null,
          errorMessage: null,
          createdAt: stamp,
        };
        data.dialAttemptsPhase12.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.dialAttemptsPhase12.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByCampaignContact: async (organizationId, campaignContactId) => {
        return [...data.dialAttemptsPhase12.values()]
          .filter(
            (a) => a.organizationId === organizationId && a.campaignContactId === campaignContactId
          )
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      },
      listByCampaign: async (organizationId, campaignId, limit) => {
        // Get campaign contacts first, then filter attempts
        const campaignContacts = [...data.campaignContactsPhase12.values()].filter(
          (c) => c.organizationId === organizationId && c.campaignId === campaignId
        );
        const contactIds = new Set(campaignContacts.map((c) => c.id));
        let attempts = [...data.dialAttemptsPhase12.values()].filter(
          (a) => a.organizationId === organizationId && contactIds.has(a.campaignContactId)
        );
        attempts.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        return limit ? attempts.slice(0, limit) : attempts;
      },
      update: async (id, organizationId, patch) => {
        const row = data.dialAttemptsPhase12.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch };
        data.dialAttemptsPhase12.set(id, next);
        return next;
      },
    },

    campaignEventsPhase12: {
      create: async (input) => {
        const row: CampaignEventRow = {
          ...input,
          id: newId("p12ce"),
          createdAt: now(),
        };
        data.campaignEventsPhase12.push(row);
        return row;
      },
      listByCampaign: async (organizationId, campaignId, limit) => {
        const filtered = data.campaignEventsPhase12
          .filter((e) => e.organizationId === organizationId && e.campaignId === campaignId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return limit ? filtered.slice(0, limit) : filtered;
      },
    },

    retryPoliciesPhase12: {
      create: async (input) => {
        const stamp = now();
        const row: RetryPolicyRow = {
          ...input,
          id: newId("p12rp"),
          isActive: true,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.retryPoliciesPhase12.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.retryPoliciesPhase12.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      listByOrg: async (organizationId) => {
        return [...data.retryPoliciesPhase12.values()].filter(
          (r) => r.organizationId === organizationId
        );
      },
      getDefault: async (organizationId) => {
        return [...data.retryPoliciesPhase12.values()].find(
          (r) => r.organizationId === organizationId && r.isActive
        );
      },
      update: async (id, organizationId, patch) => {
        const row = data.retryPoliciesPhase12.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.retryPoliciesPhase12.set(id, next);
        return next;
      },
    },

    campaignSchedulesPhase12: {
      create: async (input) => {
        const stamp = now();
        const row: CampaignScheduleRow = {
          ...input,
          id: newId("p12cs"),
          isActive: true,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.campaignSchedulesPhase12.set(row.id, row);
        return row;
      },
      get: async (id, organizationId) => {
        const row = data.campaignSchedulesPhase12.get(id);
        return row && row.organizationId === organizationId ? row : undefined;
      },
      getByCampaign: async (organizationId, campaignId) => {
        return [...data.campaignSchedulesPhase12.values()].find(
          (s) => s.organizationId === organizationId && s.campaignId === campaignId
        );
      },
      update: async (id, organizationId, patch) => {
        const row = data.campaignSchedulesPhase12.get(id);
        if (!row || row.organizationId !== organizationId) return undefined;
        const next = { ...row, ...patch, updatedAt: now() };
        data.campaignSchedulesPhase12.set(id, next);
        return next;
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
