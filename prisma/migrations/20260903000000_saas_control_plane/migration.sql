-- SaaS commercial control plane: plans, one subscription per organization,
-- tenant entitlement overrides, and immutable audit events.
-- No invoice, payment, or transaction tables are created because no payment provider is configured.

CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED', 'PAST_DUE');
CREATE TYPE "AuditAction" AS ENUM (
  'ORGANIZATION_CREATED',
  'ORGANIZATION_UPDATED',
  'SUBSCRIPTION_CREATED',
  'SUBSCRIPTION_CHANGED',
  'PLAN_CREATED',
  'PLAN_CHANGED',
  'ENTITLEMENT_CHANGED',
  'FEATURE_ENABLED',
  'FEATURE_DISABLED',
  'LIMIT_CHANGED',
  'PROVIDER_POLICY_CHANGED',
  'USER_INVITED',
  'USER_REMOVED',
  'ROLE_CHANGED',
  'BRANDING_UPDATED',
  'AGENT_CREATED',
  'AGENT_UPDATED',
  'AGENT_DELETED',
  'AGENT_STATUS_CHANGED',
  'CAMPAIGN_CREATED',
  'CAMPAIGN_UPDATED',
  'CAMPAIGN_STATUS_CHANGED',
  'DNC_RECORD_ADDED',
  'DNC_RECORD_REMOVED',
  'DNC_ENFORCEMENT_BLOCKED',
  'DNC_ENFORCEMENT_CHECKED',
  'COMPLIANCE_POLICY_CREATED',
  'COMPLIANCE_POLICY_UPDATED',
  'COMPLIANCE_POLICY_DELETED',
  'COMPLIANCE_POLICY_ENABLED',
  'COMPLIANCE_POLICY_DISABLED',
  'COMPLIANCE_EVALUATION_RUN',
  'COMPLIANCE_VIOLATION_DETECTED',
  'INTEGRATION_CONFIGURED',
  'INTEGRATION_UPDATED',
  'INTEGRATION_REMOVED',
  'REPORT_EXPORTED',
  'QA_TEMPLATE_CREATED',
  'QA_TEMPLATE_UPDATED',
  'QA_TEMPLATE_ARCHIVED',
  'QA_TEMPLATE_DELETED',
  'QA_EVALUATION_CREATED',
  'QA_EVALUATION_SUBMITTED',
  'QA_EVALUATION_VOIDED',
  'QA_FINDING_CREATED',
  'QA_FINDING_RESOLVED',
  'CONNECTOR_CREATED',
  'CONNECTOR_UPDATED',
  'CONNECTOR_DELETED',
  'CONNECTOR_ENABLED',
  'CONNECTOR_DISABLED',
  'CONNECTOR_TESTED',
  'CONNECTOR_MAPPING_CREATED',
  'CONNECTOR_MAPPING_UPDATED',
  'CONNECTOR_MAPPING_DELETED',
  'CONNECTOR_SYNC_STARTED',
  'CONNECTOR_SYNC_COMPLETED',
  'CONNECTOR_SYNC_FAILED',
  'CALL_ENDED_BY_SUPERVISOR',
  'ALERT_ACKNOWLEDGED',
  'ALERT_RESOLVED',
  'CONTACT_QUEUED',
  'CONTACT_SKIPPED',
  'CAMPAIGN_EXECUTION_STARTED',
  'CAMPAIGN_EXECUTION_PAUSED',
  'CAMPAIGN_EXECUTION_RESUMED',
  'CAMPAIGN_EXECUTION_STOPPED',
  'CONTACTS_IMPORTED_PHASE12',
  'CONTACTS_VALIDATED',
  'CONTACTS_DEDUPLICATED',
  'DNC_SCREENING_COMPLETED',
  'DIALING_QUEUE_PREPARED',
  'DIAL_ATTEMPT_CREATED',
  'CALL_OUTCOME_RECORDED',
  'RETRY_SCHEDULED',
  'CALLBACK_SCHEDULED'
);

CREATE TABLE "plans" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
  "features" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "limits" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plans_features_array_check" CHECK (jsonb_typeof("features") = 'array'),
  CONSTRAINT "plans_limits_object_check" CHECK (jsonb_typeof("limits") = 'object')
);

CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");
CREATE INDEX "plans_status_idx" ON "plans"("status");

CREATE TABLE "subscriptions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
  "effective_limits" JSONB,
  "trial_ends_at" TIMESTAMP(3),
  "current_period_start" TIMESTAMP(3),
  "current_period_end" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscriptions_effective_limits_object_check"
    CHECK ("effective_limits" IS NULL OR jsonb_typeof("effective_limits") = 'object'),
  CONSTRAINT "subscriptions_period_check"
    CHECK ("current_period_end" IS NULL OR "current_period_start" IS NULL OR "current_period_end" > "current_period_start"),
  CONSTRAINT "subscriptions_trial_check"
    CHECK ("trial_ends_at" IS NULL OR "trial_ends_at" >= "started_at")
);

CREATE UNIQUE INDEX "subscriptions_organization_id_key" ON "subscriptions"("organization_id");
CREATE INDEX "subscriptions_plan_id_status_idx" ON "subscriptions"("plan_id", "status");
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "organization_entitlements" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_entitlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_entitlements_feature_check" CHECK ("feature" IN ('ai_agents', 'voice_calls', 'inbound_calls', 'outbound_calls', 'campaigns', 'live_call_monitoring', 'analytics', 'advanced_analytics', 'reporting', 'data_connectors', 'knowledge_base', 'compliance', 'dnc_management', 'audit_trail', 'qa_evaluation', 'custom_branding', 'api_access', 'custom_integrations', 'contact_center_operations'))
);

CREATE UNIQUE INDEX "organization_entitlements_organization_id_feature_key"
  ON "organization_entitlements"("organization_id", "feature");
CREATE INDEX "organization_entitlements_organization_id_enabled_idx"
  ON "organization_entitlements"("organization_id", "enabled");
ALTER TABLE "organization_entitlements" ADD CONSTRAINT "organization_entitlements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "audit_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "actor_id" TEXT,
  "actor_email" TEXT,
  "action" "AuditAction" NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "ip_address" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_events_organization_id_created_at_idx" ON "audit_events"("organization_id", "created_at");
CREATE INDEX "audit_events_action_idx" ON "audit_events"("action");
