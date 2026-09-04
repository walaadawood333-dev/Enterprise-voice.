/**
 * Telephony Gateway — barrel exports.
 *
 * This module is the single import point for all telephony functionality.
 * The gateway depends on these abstractions; nothing here imports from routes or UI.
 */

export { createTelephonyGateway, type TelephonyGateway, type TelephonyGatewayDeps } from "./gateway";
export {
  CALL_STATES,
  CALL_TRANSITIONS,
  assertCallTransition,
  canCallTransition,
  eventToCallStatus,
  isCallTerminal,
} from "./callStateMachine";
export { DemoTelephonyProvider } from "./demo";
export {
  NullMediaBridge,
  type MediaBridge,
  type MediaBridgeConfig,
  type MediaStreamHandle,
  type MediaStreamInfo,
} from "./mediaBridge";
export type {
  TelephonyEvent,
  TelephonyHangupResult,
  TelephonyInitiateInput,
  TelephonyInitiateResult,
  TelephonyProvider,
  TelephonyProviderInfo,
  WebhookVerificationResult,
} from "./provider";
export {
  extractTimestamp,
  isTimestampFresh,
  verifyWebhook,
  type WebhookContext,
} from "./webhooks";

// Phase 8A — Production Provider Readiness
export {
  createProviderRegistry,
  getCapabilities,
  type ProviderRegistry,
  type ProviderRegistrationInput,
  type RegistryEntry,
  type RegistryEntryDto,
} from "./registry";
export {
  checkAllProvidersHealth,
  checkProviderHealth,
  type HealthCheckOptions,
  type HealthCheckResult,
} from "./healthCheck";
export {
  selectProvider,
  type ProviderSelectionInput,
  type ProviderSelectionOutcome,
} from "./selection";
export {
  readTelephonyCredentials,
  buildCredentialSummary,
  readTelephonyApiKey,
  readTelephonyWebhookSecret,
  redactTelephonySecrets,
  TELEPHONY_SECRET_ENV_NAMES,
  type TelephonyCredentialSummary,
  type TelephonyCredentials,
} from "./credentials";
export {
  validateProviderConfiguration,
  validateAllProviderConfigurations,
  isProductionReady,
  type ConfigurationValidationResult,
} from "./config";
export {
  createOrgProviderPolicy,
  type OrgProviderPolicy,
  type OrgProviderInput,
} from "./orgPolicy";

// Phase 8B — Provider Adapter Infrastructure
export {
  // Base provider class
  ProductionTelephonyProviderBase,
  type ProductionProviderConfig,
  type ProviderHealthCheckResult,
  // Event normalization
  normalizeProviderEvent,
  normalizeProviderEvents,
  type RawProviderEvent,
  // Error normalization
  normalizeProviderError,
  createProviderError,
  isRetryableError,
  getUserFriendlyMessage,
  type ProviderError,
  type ProviderErrorCode,
  // Readiness validation
  validateProviderReadiness,
  validateMultipleProvidersReadiness,
  hasProductionReadyProvider,
  type ReadinessCheck,
  type ReadinessCheckResult,
  type ReadinessConfig,
  // Certification checklist
  createProviderCertification,
  verifyCertificationItem,
  isProviderCertified,
  getUnverifiedItems,
  getVerifiedItems,
  summarizeCertification,
  type CertificationItem,
  type CertificationStatus,
  type ProviderCertification,
  // Activation gate
  checkActivationGate,
  createActivationDiagnostic,
  type ActivationCheck,
  type ActivationGateConfig,
  type ActivationGateResult,
  // Sandbox support
  createDemoEnvironmentConfig,
  createSandboxEnvironmentConfig,
  createProductionEnvironmentConfig,
  determineProviderEnvironment,
  validateEnvironmentConfig,
  getEnvironmentLabel,
  environmentAllowsCalls,
  environmentRequiresCredentials,
  summarizeEnvironmentConfig,
  type ProviderEnvironment,
  type ProviderEnvironmentConfig,
} from "./providers/index";

// Phase 9A — Provider Certification Framework
export {
  // Certification harness
  runCertificationHarness,
  // Scoring
  calculateCertificationScore,
  getScoreLabel,
  formatCertificationScore,
  type CertificationScore,
  type CategoryScore,
  // Benchmark
  recordBenchmark,
  getBenchmarkRecords,
  getBenchmarkRecordsBySource,
  generateBenchmarkSummary,
  createTestBenchmarkRecord,
  createSandboxBenchmarkRecord,
  hasProductionBenchmarkData,
  compareProviders,
  // Onboarding
  ONBOARDING_STAGES,
  createOnboardingWorkflow,
  advanceOnboardingStage,
  advanceToStage,
  isOnboardingComplete,
  isProviderOnboarded,
  isProductionReady as isProviderProductionReady,
  getCompletedStages,
  getRemainingStages,
  getOnboardingProgress,
  summarizeOnboarding,
  isValidStageTransition,
  getNextStage,
  getPreviousStage,
  formatOnboardingStage,
  // Rollback
  createRollbackPlan,
  executeRollbackPlan,
  needsRollback,
  getRollbackTrigger,
  isDataSafeDuringRollback,
  createRollbackReadinessReport,
  formatRollbackResult,
  type RollbackConfig,
  type RollbackPlan,
  type RollbackAction,
  // Types
  type TestResult,
  type CertificationCategory,
  type CertificationTest,
  type CategoryResult,
  type CertificationReport,
  type ProviderCompatibilityProfile,
  type ProviderType,
  type BenchmarkDataSource,
  type OnboardingStage,
  type ProviderOnboarding,
  type OnboardingStageEntry,
  type RollbackTrigger,
  type RollbackActionResult,
  type CertificationHarnessInput,
  type CertificationHarnessOutput,
  type ProviderBenchmarkRecord,
  type ProviderBenchmarkSummary,
} from "./certification/index";
// Re-export Phase 9A CertificationStatus with alias to avoid conflict with Phase 8B
export type { CertificationStatus as CertificationFrameworkStatus } from "./certification/index";
