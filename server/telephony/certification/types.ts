/**
 * Phase 9A — Provider Certification Framework Types
 * 
 * Core type definitions for the provider certification harness.
 * This framework is provider-neutral and can certify any future telephony provider.
 */

import type { ProviderHealthStatus, AppMode } from "../../../shared/contracts";
import type { TelephonyProvider } from "../provider";
import type { ProviderHealthCheckResult } from "../providers/base/ProductionTelephonyProviderBase";

// ─── CERTIFICATION STATUS ──────────────────────────────────────────────────

/**
 * Certification result for an individual test.
 */
export type TestResult = "NOT_TESTED" | "FAILED" | "PARTIAL" | "PASSED" | "CERTIFIED";

/**
 * Certification category identifier.
 */
export type CertificationCategory =
  | "CONFIGURATION"
  | "CAPABILITIES"
  | "HEALTH"
  | "SECURITY"
  | "LIFECYCLE"
  | "IDEMPOTENCY"
  | "TENANT_ISOLATION"
  | "MEDIA"
  | "ERROR_HANDLING"
  | "OBSERVABILITY";

/**
 * Individual test case within a category.
 */
export interface CertificationTest {
  /** Unique test identifier */
  id: string;
  /** Human-readable test name */
  name: string;
  /** Test description */
  description: string;
  /** Test category */
  category: CertificationCategory;
  /** Whether this test is mandatory for certification */
  mandatory: boolean;
  /** Test result */
  result: TestResult;
  /** Test output / evidence */
  output?: string;
  /** Error message (if failed) */
  error?: string;
  /** When this test was executed */
  executedAt?: string;
  /** Duration in milliseconds */
  durationMs?: number;
}

/**
 * Certification result for an entire category.
 */
export interface CategoryResult {
  /** Category name */
  category: CertificationCategory;
  /** Category-level result */
  result: TestResult;
  /** Individual tests in this category */
  tests: CertificationTest[];
  /** Number of tests passed */
  passed: number;
  /** Number of tests failed */
  failed: number;
  /** Number of tests not yet run */
  notTested: number;
  /** Total number of tests */
  total: number;
  /** Percentage complete */
  completionPercentage: number;
}

/**
 * Full certification report for a provider.
 */
export interface CertificationReport {
  /** Provider identifier */
  providerId: string;
  /** Provider label */
  providerLabel: string;
  /** Overall certification status */
  status: CertificationStatus;
  /** Category results */
  categories: CategoryResult[];
  /** Total tests across all categories */
  totalTests: number;
  /** Total tests passed */
  totalPassed: number;
  /** Total tests failed */
  totalFailed: number;
  /** Overall completion percentage */
  overallPercentage: number;
  /** Whether provider is production eligible */
  productionEligible: boolean;
  /** When certification started */
  startedAt: string;
  /** When certification completed */
  completedAt?: string;
  /** Certification report timestamp */
  timestamp: string;
}

/**
 * Overall certification status for a provider.
 */
export type CertificationStatus =
  | "NOT_CERTIFIED"       // Never been certified
  | "CERTIFICATION_PENDING" // In progress
  | "PARTIALLY_CERTIFIED" // Some categories passed
  | "CERTIFIED"           // All mandatory categories passed
  | "CERTIFIED_PRODUCTION" // Certified and production-ready
  | "CERTIFICATION_EXPIRED" // Was certified but needs re-certification
  | "CERTIFICATION_REVOKED"; // Certification revoked due to failure

// ─── COMPATIBILITY PROFILE ────────────────────────────────────────────────

/**
 * Provider type classification.
 */
export type ProviderType = "CPaaS" | "PSTN" | "SIP" | "Carrier" | "Simulation";

/**
 * Provider environment.
 */
export type ProviderEnvironment = "demo" | "sandbox" | "production";

/**
 * Provider compatibility profile — describes a provider's full capabilities and status.
 */
export interface ProviderCompatibilityProfile {
  /** Provider identifier */
  providerId: string;
  /** Provider label */
  providerLabel: string;
  /** Provider type */
  providerType: ProviderType;
  /** Current environment */
  environment: ProviderEnvironment;
  /** Declared capabilities */
  capabilities: {
    inbound: boolean;
    outbound: boolean;
    mediaStreaming: boolean;
    recording: boolean;
  };
  /** Whether this is a simulation provider */
  isSimulation: boolean;
  /** Sandbox support */
  sandboxSupported: boolean;
  /** Health check support */
  healthCheckSupported: boolean;
  /** Current health status */
  healthStatus: ProviderHealthStatus;
  /** Current certification status */
  certificationStatus: CertificationStatus;
  /** Whether provider is eligible for production */
  productionEligible: boolean;
  /** Certification completion percentage */
  certificationPercentage: number;
  /** When this profile was generated */
  generatedAt: string;
}

// ─── BENCHMARK MODEL ──────────────────────────────────────────────────────

/**
 * Benchmark data source classification.
 */
export type BenchmarkDataSource = "TEST_DATA" | "SANDBOX_DATA" | "PRODUCTION_DATA";

/**
 * Provider benchmark metrics.
 * Records performance data for comparing providers.
 * NEVER fabricate — only record actual measurements.
 */
export interface ProviderBenchmarkRecord {
  /** Provider identifier */
  providerId: string;
  /** Data source classification */
  dataSource: BenchmarkDataSource;
  /** Country/region */
  country?: string;
  /** Destination type (PSTN, SIP, etc.) */
  destination?: string;
  /** Call direction */
  direction?: "inbound" | "outbound";
  /** Measured latency in ms */
  latencyMs?: number;
  /** Call success rate (0-100) */
  callSuccessRate?: number;
  /** Call failure rate (0-100) */
  failureRate?: number;
  /** Average call duration in seconds */
  averageDurationSec?: number;
  /** Webhook reliability (0-100) */
  webhookReliability?: number;
  /** Current health status */
  healthStatus?: ProviderHealthStatus;
  /** Cost reference (currency per minute, if available) */
  costReference?: {
    currency: string;
    perMinute: number;
  };
  /** When this record was created */
  recordedAt: string;
  /** When this record expires */
  expiresAt?: string;
}

/**
 * Provider benchmark summary.
 */
export interface ProviderBenchmarkSummary {
  /** Provider identifier */
  providerId: string;
  /** Total benchmark records */
  totalRecords: number;
  /** Records by data source */
  byDataSource: Record<BenchmarkDataSource, number>;
  /** Latest health status */
  latestHealthStatus?: ProviderHealthStatus;
  /** Average latency (ms) */
  averageLatencyMs?: number;
  /** Average success rate */
  averageSuccessRate?: number;
  /** When this summary was generated */
  generatedAt: string;
}

// ─── ONBOARDING WORKFLOW ──────────────────────────────────────────────────

/**
 * Provider onboarding stages.
 * A provider MUST pass through each stage in order.
 * No stage may be skipped.
 */
export type OnboardingStage =
  | "REGISTERED"
  | "CONFIGURATION_REQUIRED"
  | "CONFIGURED"
  | "SANDBOX_READY"
  | "CERTIFICATION_PENDING"
  | "CERTIFICATION_RUNNING"
  | "CERTIFIED"
  | "PRODUCTION_READY"
  | "ACTIVE";

/**
 * Onboarding workflow record.
 */
export interface ProviderOnboarding {
  /** Provider identifier */
  providerId: string;
  /** Current stage */
  currentStage: OnboardingStage;
  /** Stage history (ordered) */
  stageHistory: OnboardingStageEntry[];
  /** Whether any stage was skipped (should never happen) */
  stagesSkipped: boolean;
  /** When onboarding started */
  startedAt: string;
  /** When current stage was entered */
  currentStageAt: string;
  /** Last updated */
  updatedAt: string;
}

/**
 * A single stage entry in the onboarding history.
 */
export interface OnboardingStageEntry {
  /** Stage name */
  stage: OnboardingStage;
  /** When this stage was entered */
  enteredAt: string;
  /** When this stage was exited (if applicable) */
  exitedAt?: string;
  /** Notes about this stage */
  notes?: string;
}

// ─── ROLLBACK STRATEGY ────────────────────────────────────────────────────

/**
 * Rollback trigger condition.
 */
export type RollbackTrigger = "DEGRADED" | "UNAVAILABLE" | "MANUAL";

/**
 * Rollback action result.
 */
export interface RollbackActionResult {
  /** Whether rollback was initiated */
  initiated: boolean;
  /** Trigger condition */
  trigger: RollbackTrigger;
  /** Provider that was rolled back */
  providerId: string;
  /** Whether existing calls were preserved */
  callsPreserved: boolean;
  /** Whether voice sessions were preserved */
  voiceSessionsPreserved: boolean;
  /** Whether transcripts were preserved */
  transcriptsPreserved: boolean;
  /** Whether analytics were preserved */
  analyticsPreserved: boolean;
  /** New provider state */
  newState: string;
  /** When rollback was initiated */
  initiatedAt: string;
  /** Diagnostic message */
  message: string;
}

// ─── CERTIFICATION HARNESS ────────────────────────────────────────────────

/**
 * Input for running certification tests.
 */
export interface CertificationHarnessInput {
  /** Provider to certify */
  provider: TelephonyProvider;
  /** Application mode */
  appMode: AppMode;
  /** Whether credentials are configured */
  credentialsConfigured: boolean;
  /** Whether webhook is configured */
  webhookConfigured: boolean;
  /** Organization IDs for tenant isolation testing */
  organizationIds: string[];
  /** Health check result (if available) */
  healthCheck?: ProviderHealthCheckResult;
}

/**
 * Certification harness output.
 */
export interface CertificationHarnessOutput {
  /** Certification report */
  report: CertificationReport;
  /** Provider compatibility profile */
  profile: ProviderCompatibilityProfile;
  /** Onboarding state */
  onboarding: ProviderOnboarding;
  /** Rollback readiness */
  rollbackReady: boolean;
}
