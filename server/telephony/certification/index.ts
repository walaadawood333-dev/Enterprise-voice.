/**
 * Phase 9A — Provider Certification Framework
 * 
 * Barrel exports for the provider certification system.
 * This framework is provider-neutral and certifies any future telephony provider.
 */

// Core types
export type {
  TestResult,
  CertificationCategory,
  CertificationTest,
  CategoryResult,
  CertificationReport,
  CertificationStatus,
  ProviderCompatibilityProfile,
  ProviderType,
  ProviderEnvironment,
  ProviderBenchmarkRecord,
  ProviderBenchmarkSummary,
  BenchmarkDataSource,
  OnboardingStage,
  ProviderOnboarding,
  OnboardingStageEntry,
  RollbackTrigger,
  RollbackActionResult,
  CertificationHarnessInput,
  CertificationHarnessOutput,
} from "./types";

// Certification harness
export {
  runCertificationHarness,
} from "./harness";

// Scoring
export {
  calculateCertificationScore,
  getScoreLabel,
  formatCertificationScore,
  type CertificationScore,
  type CategoryScore,
} from "./scoring";

// Benchmark
export {
  recordBenchmark,
  getBenchmarkRecords,
  getBenchmarkRecordsBySource,
  generateBenchmarkSummary,
  createTestBenchmarkRecord,
  createSandboxBenchmarkRecord,
  hasProductionBenchmarkData,
  compareProviders,
} from "./benchmark";

// Onboarding
export {
  ONBOARDING_STAGES,
  createOnboardingWorkflow,
  advanceOnboardingStage,
  advanceToStage,
  isOnboardingComplete,
  isProviderOnboarded,
  isProductionReady,
  getCompletedStages,
  getRemainingStages,
  getOnboardingProgress,
  summarizeOnboarding,
  isValidStageTransition,
  getNextStage,
  getPreviousStage,
  formatOnboardingStage,
} from "./onboarding";

// Rollback
export {
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
} from "./rollback";
