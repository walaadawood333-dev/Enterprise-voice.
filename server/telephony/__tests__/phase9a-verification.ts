/**
 * Phase 9A — Provider Certification Framework Verification Suite
 * 
 * Tests the complete certification framework:
 * 1. Certification harness initialization
 * 2. Provider profile validation
 * 3. Configuration certification
 * 4. Capability certification
 * 5. Health certification
 * 6. Webhook security certification
 * 7. Lifecycle certification
 * 8. Idempotency certification
 * 9. Tenant isolation certification
 * 10. Media capability certification
 * 11. Error normalization certification
 * 12. Observability certification
 * 13. Certification scoring
 * 14. Certification status transitions
 * 15. Production eligibility guard
 * 16. Rollback readiness
 * 17. Demo provider compatibility
 * 18. Onboarding workflow
 * 19. Benchmark model
 * 20. Rollback strategy
 * 21. Build verification
 * 22. TypeScript validation
 */

import { runCertificationHarness } from "../certification/harness";
import { calculateCertificationScore, getScoreLabel, formatCertificationScore } from "../certification/scoring";
import {
  recordBenchmark,
  getBenchmarkRecords,
  generateBenchmarkSummary,
  createTestBenchmarkRecord,
  hasProductionBenchmarkData,
  compareProviders,
} from "../certification/benchmark";
import {
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
  isValidStageTransition,
  getNextStage,
  getPreviousStage,
  formatOnboardingStage,
  summarizeOnboarding,
} from "../certification/onboarding";
import {
  createRollbackPlan,
  executeRollbackPlan,
  needsRollback,
  getRollbackTrigger,
  isDataSafeDuringRollback,
  createRollbackReadinessReport,
  formatRollbackResult,
} from "../certification/rollback";
import type { TelephonyProvider, TelephonyProviderInfo } from "../provider";
import type { AppMode } from "../../../shared/contracts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  ✗ ${message}`);
  }
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

// ─── Mock Providers ───────────────────────────────────────────────────────

class MockDemoProvider implements TelephonyProvider {
  readonly info: TelephonyProviderInfo = {
    id: "demo",
    label: "Demo Provider",
    simulation: true,
    capabilities: {
      inbound: true,
      outbound: true,
      mediaStreaming: false,
      recording: false,
    },
  };

  available(): boolean { return true; }

  async initiate(): Promise<{ callId: string; providerCallId: string; status: "created" }> {
    return { callId: "call-demo-001", providerCallId: "provider-demo-001", status: "created" };
  }

  async hangup(): Promise<{ callId: string; status: "completed" }> {
    return { callId: "call-demo-001", status: "completed" };
  }

  verifyWebhookSignature(): boolean { return true; }
}

class MockProductionProvider implements TelephonyProvider {
  readonly info: TelephonyProviderInfo = {
    id: "mock-production",
    label: "Mock Production Provider",
    simulation: false,
    capabilities: {
      inbound: true,
      outbound: true,
      mediaStreaming: true,
      recording: false,
    },
  };

  available(): boolean { return true; }

  async initiate(): Promise<{ callId: string; providerCallId: string; status: "created" }> {
    return { callId: "call-prod-001", providerCallId: "provider-prod-001", status: "created" };
  }

  async hangup(): Promise<{ callId: string; status: "completed" }> {
    return { callId: "call-prod-001", status: "completed" };
  }

  verifyWebhookSignature(payload: string, headers: Record<string, string>): boolean {
    return headers["x-signature"] === "valid";
  }
}

// ─── TEST 1: Certification Harness Initialization ────────────────────────

section("1. Certification Harness Initialization");

{
  const provider = new MockDemoProvider();
  const result = runCertificationHarness({
    provider,
    appMode: "demo",
    credentialsConfigured: false,
    webhookConfigured: false,
    organizationIds: ["org-1", "org-2"],
  });

  assert(result !== null, "Harness returns a result");
  assert(result.report !== null, "Harness includes a report");
  assert(result.profile !== null, "Harness includes a profile");
  assert(result.onboarding !== null, "Harness includes onboarding state");
  assert(typeof result.rollbackReady === "boolean", "Harness includes rollback readiness");
  assert(result.report.providerId === "demo", "Report has correct provider ID");
}

// ─── TEST 2: Provider Profile Validation ──────────────────────────────────

section("2. Provider Profile Validation");

{
  const demoProvider = new MockDemoProvider();
  const demoResult = runCertificationHarness({
    provider: demoProvider,
    appMode: "demo",
    credentialsConfigured: false,
    webhookConfigured: false,
    organizationIds: ["org-1"],
  });

  assert(demoResult.profile.providerId === "demo", "Demo profile has correct ID");
  assert(demoResult.profile.providerType === "Simulation", "Demo is Simulation type");
  assert(demoResult.profile.environment === "demo", "Demo is in demo environment");
  assert(demoResult.profile.isSimulation === true, "Demo is marked as simulation");
  assert(demoResult.profile.productionEligible === false, "Demo is not production eligible");

  const prodProvider = new MockProductionProvider();
  const prodResult = runCertificationHarness({
    provider: prodProvider,
    appMode: "production",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1", "org-2"],
  });

  assert(prodResult.profile.providerId === "mock-production", "Production profile has correct ID");
  assert(prodResult.profile.providerType === "CPaaS", "Production provider is CPaaS type");
  assert(prodResult.profile.environment === "production", "Production is in production environment");
  assert(prodResult.profile.isSimulation === false, "Production is not simulation");
}

// ─── TEST 3: Configuration Certification ──────────────────────────────────

section("3. Configuration Certification");

{
  const provider = new MockDemoProvider();
  const result = runCertificationHarness({
    provider,
    appMode: "demo",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1"],
  });

  const configCategory = result.report.categories.find((c) => c.category === "CONFIGURATION");
  assert(configCategory !== undefined, "Configuration category exists");
  assert(configCategory!.tests.length >= 7, "Configuration has at least 7 tests");
  assert(configCategory!.passed >= 6, "Configuration tests pass");

  // Verify specific tests
  const regTest = configCategory!.tests.find((t) => t.id === "CONFIG_001");
  assert(regTest !== undefined, "Provider Registration test exists");
  assert(regTest!.result === "PASSED", "Provider Registration passes");

  const identityTest = configCategory!.tests.find((t) => t.id === "CONFIG_002");
  assert(identityTest !== undefined, "Provider Identity test exists");
  assert(identityTest!.result === "PASSED", "Provider Identity passes");
}

// ─── TEST 4: Capability Certification ─────────────────────────────────────

section("4. Capability Certification");

{
  const provider = new MockProductionProvider();
  const result = runCertificationHarness({
    provider,
    appMode: "production",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1"],
  });

  const capCategory = result.report.categories.find((c) => c.category === "CAPABILITIES");
  assert(capCategory !== undefined, "Capabilities category exists");
  assert(capCategory!.tests.length >= 6, "Capabilities has at least 6 tests");

  const inboundTest = capCategory!.tests.find((t) => t.id === "CAP_003");
  assert(inboundTest !== undefined, "Inbound capability test exists");
  assert(inboundTest!.result === "PASSED", "Inbound capability passes for capable provider");

  const mediaTest = capCategory!.tests.find((t) => t.id === "CAP_006");
  assert(mediaTest !== undefined, "Media capability test exists");
  assert(mediaTest!.result === "PASSED", "Media capability passes for media-capable provider");
}

// ─── TEST 5: Health Certification ─────────────────────────────────────────

section("5. Health Certification");

{
  const provider = new MockDemoProvider();
  const result = runCertificationHarness({
    provider,
    appMode: "demo",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1"],
    healthCheck: {
      healthy: true,
      status: "healthy",
      latencyMs: 50,
      detail: "OK",
      checkedAt: new Date().toISOString(),
    },
  });

  const healthCategory = result.report.categories.find((c) => c.category === "HEALTH");
  assert(healthCategory !== undefined, "Health category exists");
  assert(healthCategory!.tests.length >= 5, "Health has at least 5 tests");

  const healthyTest = healthCategory!.tests.find((t) => t.id === "HEALTH_001");
  assert(healthyTest !== undefined, "Healthy state test exists");
  assert(healthyTest!.result === "PASSED", "Healthy state passes when healthy");
}

// ─── TEST 6: Webhook Security Certification ───────────────────────────────

section("6. Webhook Security Certification");

{
  const provider = new MockProductionProvider();
  const result = runCertificationHarness({
    provider,
    appMode: "production",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1"],
  });

  const secCategory = result.report.categories.find((c) => c.category === "SECURITY");
  assert(secCategory !== undefined, "Security category exists");
  assert(secCategory!.tests.length >= 6, "Security has at least 6 tests");

  const secretTest = secCategory!.tests.find((t) => t.id === "SEC_001");
  assert(secretTest !== undefined, "Secret exposure test exists");
  assert(secretTest!.result === "PASSED", "No secret exposure");

  const sigTest = secCategory!.tests.find((t) => t.id === "SEC_002");
  assert(sigTest !== undefined, "Invalid signature rejection test exists");
  assert(sigTest!.result === "PASSED", "Invalid signature rejection passes");

  const replayTest = secCategory!.tests.find((t) => t.id === "SEC_004");
  assert(replayTest !== undefined, "Replay protection test exists");
  assert(replayTest!.result === "PASSED", "Replay protection passes");
}

// ─── TEST 7: Lifecycle Certification ──────────────────────────────────────

section("7. Lifecycle Certification");

{
  const provider = new MockDemoProvider();
  const result = runCertificationHarness({
    provider,
    appMode: "demo",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1"],
  });

  const lcCategory = result.report.categories.find((c) => c.category === "LIFECYCLE");
  assert(lcCategory !== undefined, "Lifecycle category exists");
  assert(lcCategory!.tests.length >= 8, "Lifecycle has at least 8 tests");

  // Verify all states are tested
  const stateIds = ["LC_001", "LC_002", "LC_003", "LC_004", "LC_005", "LC_006", "LC_007", "LC_008"];
  for (const id of stateIds) {
    const test = lcCategory!.tests.find((t) => t.id === id);
    assert(test !== undefined, `Lifecycle test ${id} exists`);
    assert(test!.result === "PASSED", `Lifecycle test ${id} passes`);
  }
}

// ─── TEST 8: Idempotency Certification ────────────────────────────────────

section("8. Idempotency Certification");

{
  const provider = new MockDemoProvider();
  const result = runCertificationHarness({
    provider,
    appMode: "demo",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1"],
  });

  const idemCategory = result.report.categories.find((c) => c.category === "IDEMPOTENCY");
  assert(idemCategory !== undefined, "Idempotency category exists");
  assert(idemCategory!.tests.length >= 6, "Idempotency has at least 6 tests");

  const dupCreated = idemCategory!.tests.find((t) => t.id === "IDEM_001");
  assert(dupCreated !== undefined, "Duplicate call_created test exists");
  assert(dupCreated!.result === "PASSED", "Duplicate call_created handling passes");

  const reconnect = idemCategory!.tests.find((t) => t.id === "IDEM_005");
  assert(reconnect !== undefined, "Reconnect handling test exists");
  assert(reconnect!.result === "PASSED", "Reconnect handling passes");
}

// ─── TEST 9: Tenant Isolation Certification ───────────────────────────────

section("9. Tenant Isolation Certification");

{
  const provider = new MockDemoProvider();
  const result = runCertificationHarness({
    provider,
    appMode: "demo",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1", "org-2"],
  });

  const tenantCategory = result.report.categories.find((c) => c.category === "TENANT_ISOLATION");
  assert(tenantCategory !== undefined, "Tenant isolation category exists");
  assert(tenantCategory!.tests.length >= 3, "Tenant isolation has at least 3 tests");

  const orgA = tenantCategory!.tests.find((t) => t.id === "TENANT_001");
  assert(orgA !== undefined, "Organization A isolation test exists");
  assert(orgA!.result === "PASSED", "Organization A isolation passes");

  const crossTenant = tenantCategory!.tests.find((t) => t.id === "TENANT_003");
  assert(crossTenant !== undefined, "Cross-tenant access prevention test exists");
  assert(crossTenant!.result === "PASSED", "Cross-tenant access prevention passes");
}

// ─── TEST 10: Media Capability Certification ──────────────────────────────

section("10. Media Capability Certification");

{
  // Test with media-capable provider
  const mediaProvider = new MockProductionProvider();
  const mediaResult = runCertificationHarness({
    provider: mediaProvider,
    appMode: "production",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1"],
  });

  const mediaCategory = mediaResult.report.categories.find((c) => c.category === "MEDIA");
  assert(mediaCategory !== undefined, "Media category exists");
  assert(mediaCategory!.tests.length >= 3, "Media has at least 3 tests");

  // Test with non-media provider
  const noMediaProvider = new MockDemoProvider();
  const noMediaResult = runCertificationHarness({
    provider: noMediaProvider,
    appMode: "demo",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1"],
  });

  const noMediaCategory = noMediaResult.report.categories.find((c) => c.category === "MEDIA");
  assert(noMediaCategory !== undefined, "Media category exists for non-media provider");
  // Media connection test should be NOT_TESTED for non-media provider
  const mediaConnTest = noMediaCategory!.tests.find((t) => t.id === "MEDIA_002");
  assert(mediaConnTest!.result === "PASSED", "Non-media provider passes media tests (not required)");
}

// ─── TEST 11: Error Normalization Certification ───────────────────────────

section("11. Error Normalization Certification");

{
  const provider = new MockDemoProvider();
  const result = runCertificationHarness({
    provider,
    appMode: "demo",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1"],
  });

  const errCategory = result.report.categories.find((c) => c.category === "ERROR_HANDLING");
  assert(errCategory !== undefined, "Error handling category exists");
  assert(errCategory!.tests.length >= 7, "Error handling has at least 7 tests");

  // Verify all error types are tested
  const errorIds = ["ERR_001", "ERR_002", "ERR_003", "ERR_004", "ERR_005", "ERR_006", "ERR_007"];
  for (const id of errorIds) {
    const test = errCategory!.tests.find((t) => t.id === id);
    assert(test !== undefined, `Error test ${id} exists`);
  }
}

// ─── TEST 12: Observability Certification ─────────────────────────────────

section("12. Observability Certification");

{
  const provider = new MockDemoProvider();
  const result = runCertificationHarness({
    provider,
    appMode: "demo",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1"],
  });

  const obsCategory = result.report.categories.find((c) => c.category === "OBSERVABILITY");
  assert(obsCategory !== undefined, "Observability category exists");
  assert(obsCategory!.tests.length >= 3, "Observability has at least 3 tests");

  const loggingTest = obsCategory!.tests.find((t) => t.id === "OBS_001");
  assert(loggingTest !== undefined, "Structured logging test exists");
  assert(loggingTest!.result === "PASSED", "Structured logging passes");
}

// ─── TEST 13: Certification Scoring ──────────────────────────────────────

section("13. Certification Scoring");

{
  const provider = new MockDemoProvider();
  const result = runCertificationHarness({
    provider,
    appMode: "demo",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1", "org-2"],
  });

  const score = calculateCertificationScore(result.report);

  assert(score !== null, "Score is calculated");
  assert(score.overallScore > 0, "Overall score is positive");
  assert(score.overallScore <= 100, "Overall score is within range");
  assert(score.categoryScores.length === 10, "All 10 categories scored");

  // Verify score labels
  assert(getScoreLabel(95) === "Excellent", "95 is Excellent");
  assert(getScoreLabel(75) === "Good", "75 is Good");
  assert(getScoreLabel(55) === "Fair", "55 is Fair");
  assert(getScoreLabel(35) === "Poor", "35 is Poor");
  assert(getScoreLabel(10) === "Failed", "10 is Failed");

  // Format test
  const formatted = formatCertificationScore(score);
  assert(formatted.includes(score.providerId), "Formatted score includes provider ID");
  assert(formatted.includes("Overall:"), "Formatted score includes overall");
}

// ─── TEST 14: Certification Status Transitions ───────────────────────────

section("14. Certification Status Transitions");

{
  const demoProvider = new MockDemoProvider();
  const demoResult = runCertificationHarness({
    provider: demoProvider,
    appMode: "demo",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1", "org-2"],
  });

  assert(demoResult.report.status !== "NOT_CERTIFIED", "Demo provider has a certification status");

  const prodProvider = new MockProductionProvider();
  const prodResult = runCertificationHarness({
    provider: prodProvider,
    appMode: "production",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1", "org-2"],
  });

  assert(prodResult.report.status !== "NOT_CERTIFIED", "Production provider has a certification status");
  assert(prodResult.report.totalTests > 0, "Production provider has tests");
}

// ─── TEST 15: Production Eligibility Guard ────────────────────────────────

section("15. Production Eligibility Guard");

{
  // Demo provider should never be production eligible
  const demoProvider = new MockDemoProvider();
  const demoResult = runCertificationHarness({
    provider: demoProvider,
    appMode: "demo",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1"],
  });

  assert(demoResult.profile.productionEligible === false, "Demo provider is NOT production eligible");
  assert(demoResult.report.productionEligible === false, "Demo report is NOT production eligible");

  const score = calculateCertificationScore(demoResult.report);
  assert(score.productionEligible === false, "Demo score is NOT production eligible");
}

// ─── TEST 16: Rollback Readiness ──────────────────────────────────────────

section("16. Rollback Readiness");

{
  const provider = new MockDemoProvider();
  const result = runCertificationHarness({
    provider,
    appMode: "demo",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1"],
  });

  assert(result.rollbackReady === true, "Architecture is rollback ready");

  const dataSafe = isDataSafeDuringRollback();
  assert(dataSafe.callsSafe === true, "Calls are safe during rollback");
  assert(dataSafe.voiceSessionsSafe === true, "Voice sessions are safe during rollback");
  assert(dataSafe.transcriptsSafe === true, "Transcripts are safe during rollback");
  assert(dataSafe.analyticsSafe === true, "Analytics are safe during rollback");

  const readinessReport = createRollbackReadinessReport("demo");
  assert(readinessReport.rollbackReady === true, "Rollback readiness report is ready");
  assert(readinessReport.dataPreservation.callsSafe === true, "Report confirms calls are safe");
}

// ─── TEST 17: Demo Provider Compatibility ─────────────────────────────────

section("17. Demo Provider Compatibility");

{
  const provider = new MockDemoProvider();
  const result = runCertificationHarness({
    provider,
    appMode: "demo",
    credentialsConfigured: false,
    webhookConfigured: false,
    organizationIds: ["org-1", "org-2"],
  });

  assert(result.report.providerId === "demo", "Report is for demo provider");
  assert(result.profile.providerType === "Simulation", "Profile identifies as Simulation");
  assert(result.profile.isSimulation === true, "Profile flags simulation");
  assert(result.report.categories.length === 10, "All 10 categories tested");
  assert(result.report.totalTests > 50, "At least 50 tests run");

  // Demo provider should not require credentials
  const configCategory = result.report.categories.find((c) => c.category === "CONFIGURATION");
  const credTest = configCategory!.tests.find((t) => t.id === "CONFIG_004");
  assert(credTest!.result === "PASSED", "Demo provider passes credential check (not required)");
}

// ─── TEST 18: Onboarding Workflow ─────────────────────────────────────────

section("18. Onboarding Workflow");

{
  // Create onboarding
  const workflow = createOnboardingWorkflow("test-provider");
  assert(workflow.currentStage === "REGISTERED", "Initial stage is REGISTERED");
  assert(workflow.stagesSkipped === false, "No stages skipped initially");
  assert(getOnboardingProgress(workflow) > 0, "Progress is positive");

  // Advance through stages
  let wf = workflow;
  wf = advanceOnboardingStage(wf, "Provider registered");
  assert(wf.currentStage === "CONFIGURATION_REQUIRED", "Advanced to CONFIGURATION_REQUIRED");

  wf = advanceOnboardingStage(wf);
  assert(wf.currentStage === "CONFIGURED", "Advanced to CONFIGURED");

  wf = advanceOnboardingStage(wf);
  assert(wf.currentStage === "SANDBOX_READY", "Advanced to SANDBOX_READY");

  wf = advanceOnboardingStage(wf);
  assert(wf.currentStage === "CERTIFICATION_PENDING", "Advanced to CERTIFICATION_PENDING");

  wf = advanceOnboardingStage(wf);
  assert(wf.currentStage === "CERTIFICATION_RUNNING", "Advanced to CERTIFICATION_RUNNING");

  wf = advanceOnboardingStage(wf);
  assert(wf.currentStage === "CERTIFIED", "Advanced to CERTIFIED");

  wf = advanceOnboardingStage(wf);
  assert(wf.currentStage === "PRODUCTION_READY", "Advanced to PRODUCTION_READY");

  wf = advanceOnboardingStage(wf);
  assert(wf.currentStage === "ACTIVE", "Advanced to ACTIVE");
  assert(isOnboardingComplete(wf), "Onboarding is complete at ACTIVE");
  assert(isProviderOnboarded(wf), "Provider is onboarded when CERTIFIED or beyond");
  assert(isProductionReady(wf), "Provider is production ready when PRODUCTION_READY or beyond");

  // Test stage skip prevention
  const skipWf = createOnboardingWorkflow("skip-test");
  try {
    advanceToStage(skipWf, "CERTIFIED");
    assert(false, "Should throw when skipping stages");
  } catch (e: any) {
    assert(e.message.includes("Cannot skip stages"), "Throws on stage skip attempt");
  }

  // Test valid transitions
  assert(isValidStageTransition("REGISTERED", "CONFIGURATION_REQUIRED"), "REGISTERED → CONFIGURATION_REQUIRED is valid");
  assert(!isValidStageTransition("REGISTERED", "CERTIFIED"), "REGISTERED → CERTIFIED is not valid");
  assert(!isValidStageTransition("ACTIVE", "REGISTERED"), "ACTIVE → REGISTERED is not valid");

  // Test getNextStage / getPreviousStage
  assert(getNextStage("REGISTERED") === "CONFIGURATION_REQUIRED", "Next after REGISTERED is CONFIGURATION_REQUIRED");
  assert(getNextStage("ACTIVE") === null, "No next stage after ACTIVE");
  assert(getPreviousStage("CONFIGURATION_REQUIRED") === "REGISTERED", "Previous of CONFIGURATION_REQUIRED is REGISTERED");
  assert(getPreviousStage("REGISTERED") === null, "No previous stage before REGISTERED");

  // Test formatOnboardingStage
  assert(formatOnboardingStage("REGISTERED") === "Registered", "REGISTERED formats to Registered");
  assert(formatOnboardingStage("CERTIFIED") === "Certified", "CERTIFIED formats to Certified");

  // Test completed/remaining stages
  const completed = getCompletedStages(wf);
  assert(completed.length >= 7, "Has completed stages");
  const remaining = getRemainingStages(wf);
  assert(remaining.length === 1, "Only ACTIVE remains when at ACTIVE");

  // Test summarizeOnboarding
  const summary = summarizeOnboarding(wf);
  assert(summary.providerId === "test-provider", "Summary has correct provider ID");
  assert(summary.totalStages === ONBOARDING_STAGES.length, "Summary has correct total stages");
}

// ─── TEST 19: Benchmark Model ─────────────────────────────────────────────

section("19. Benchmark Model");

{
  // Record test data
  const testRecord = createTestBenchmarkRecord("test-provider", 150, true);
  assert(testRecord.dataSource === "TEST_DATA", "Test record has TEST_DATA source");
  recordBenchmark(testRecord);

  // Verify record was stored
  const records = getBenchmarkRecords("test-provider");
  assert(records.length >= 1, "Benchmark record was stored");

  // Record sandbox data
  const sandboxRecord = {
    providerId: "test-provider",
    dataSource: "SANDBOX_DATA" as const,
    latencyMs: 200,
    callSuccessRate: 95,
    webhookReliability: 99,
    healthStatus: "healthy" as const,
    recordedAt: new Date().toISOString(),
  };
  recordBenchmark(sandboxRecord);

  // Generate summary
  const summary = generateBenchmarkSummary("test-provider");
  assert(summary.providerId === "test-provider", "Summary has correct provider ID");
  assert(summary.totalRecords >= 2, "Summary has at least 2 records");
  assert(summary.byDataSource.TEST_DATA >= 1, "Has TEST_DATA records");
  assert(summary.byDataSource.SANDBOX_DATA >= 1, "Has SANDBOX_DATA records");

  // Check no production data
  assert(hasProductionBenchmarkData("test-provider") === false, "No production data for test provider");

  // Compare providers
  const comparison = compareProviders(["test-provider", "nonexistent-provider"]);
  assert(comparison.length === 2, "Comparison returns both providers");
}

// ─── TEST 20: Rollback Strategy ───────────────────────────────────────────

section("20. Rollback Strategy");

{
  // Create rollback plan
  const plan = createRollbackPlan({
    providerId: "test-provider",
    trigger: "DEGRADED",
    healthStatus: "degraded",
    stopNewCalls: true,
    preserveExistingCalls: true,
  });

  assert(plan.providerId === "test-provider", "Plan has correct provider ID");
  assert(plan.actions.length >= 5, "Plan has at least 5 actions");
  assert(plan.dataPreserved === true, "Plan guarantees data preservation");

  // Execute rollback plan
  const result = executeRollbackPlan(plan);
  assert(result.initiated === true, "Rollback was initiated");
  assert(result.callsPreserved === true, "Calls preserved during rollback");
  assert(result.voiceSessionsPreserved === true, "Voice sessions preserved");
  assert(result.transcriptsPreserved === true, "Transcripts preserved");
  assert(result.analyticsPreserved === true, "Analytics preserved");
  assert(result.newState === "degraded", "New state is degraded");

  // Test needsRollback
  assert(needsRollback("degraded") === true, "Degraded needs rollback");
  assert(needsRollback("unavailable") === true, "Unavailable needs rollback");
  assert(needsRollback("healthy") === false, "Healthy does not need rollback");

  // Test getRollbackTrigger
  assert(getRollbackTrigger("degraded") === "DEGRADED", "Degraded trigger is DEGRADED");
  assert(getRollbackTrigger("unavailable") === "UNAVAILABLE", "Unavailable trigger is UNAVAILABLE");
  assert(getRollbackTrigger("healthy") === null, "Healthy has no trigger");

  // Test formatRollbackResult
  const formatted = formatRollbackResult(result);
  assert(formatted.includes("test-provider"), "Formatted result includes provider ID");
  assert(formatted.includes("Preserved"), "Formatted result shows preservation");
}

// ─── TEST 21: Full Integration Test ───────────────────────────────────────

section("21. Full Integration Test");

{
  // Run full certification for demo provider
  const demoResult = runCertificationHarness({
    provider: new MockDemoProvider(),
    appMode: "demo",
    credentialsConfigured: false,
    webhookConfigured: false,
    organizationIds: ["org-a", "org-b"],
    healthCheck: {
      healthy: true,
      status: "healthy",
      latencyMs: 10,
      detail: "Demo OK",
      checkedAt: new Date().toISOString(),
    },
  });

  assert(demoResult.report.totalTests > 0, "Demo has tests");
  assert(demoResult.report.totalFailed === 0, "Demo has no failures");
  assert(demoResult.report.overallPercentage > 0, "Demo has positive completion");

  // Calculate score
  const score = calculateCertificationScore(demoResult.report);
  assert(score.overallScore > 0, "Demo has positive score");
  assert(score.result !== "FAILED", "Demo did not fail certification");

  // Generate onboarding from report
  assert(demoResult.onboarding.currentStage !== "REGISTERED", "Onboarding has progressed");
}

// ─── TEST 22: Report Structure Validation ─────────────────────────────────

section("22. Report Structure Validation");

{
  const result = runCertificationHarness({
    provider: new MockDemoProvider(),
    appMode: "demo",
    credentialsConfigured: true,
    webhookConfigured: true,
    organizationIds: ["org-1", "org-2"],
  });

  // Validate report structure
  assert(typeof result.report.providerId === "string", "Report has providerId");
  assert(typeof result.report.providerLabel === "string", "Report has providerLabel");
  assert(typeof result.report.status === "string", "Report has status");
  assert(Array.isArray(result.report.categories), "Report has categories array");
  assert(typeof result.report.totalTests === "number", "Report has totalTests");
  assert(typeof result.report.totalPassed === "number", "Report has totalPassed");
  assert(typeof result.report.totalFailed === "number", "Report has totalFailed");
  assert(typeof result.report.overallPercentage === "number", "Report has overallPercentage");
  assert(typeof result.report.productionEligible === "boolean", "Report has productionEligible");
  assert(typeof result.report.startedAt === "string", "Report has startedAt");
  assert(typeof result.report.timestamp === "string", "Report has timestamp");

  // Validate category structure
  for (const cat of result.report.categories) {
    assert(typeof cat.category === "string", `Category has name`);
    assert(typeof cat.result === "string", `Category has result`);
    assert(Array.isArray(cat.tests), `Category has tests array`);
    assert(typeof cat.passed === "number", `Category has passed count`);
    assert(typeof cat.failed === "number", `Category has failed count`);
    assert(typeof cat.total === "number", `Category has total count`);
    assert(typeof cat.completionPercentage === "number", `Category has completionPercentage`);
  }

  // Validate profile structure
  assert(typeof result.profile.providerId === "string", "Profile has providerId");
  assert(typeof result.profile.providerType === "string", "Profile has providerType");
  assert(typeof result.profile.environment === "string", "Profile has environment");
  assert(typeof result.profile.certificationStatus === "string", "Profile has certificationStatus");
  assert(typeof result.profile.productionEligible === "boolean", "Profile has productionEligible");

  // Validate onboarding structure
  assert(typeof result.onboarding.providerId === "string", "Onboarding has providerId");
  assert(typeof result.onboarding.currentStage === "string", "Onboarding has currentStage");
  assert(Array.isArray(result.onboarding.stageHistory), "Onboarding has stageHistory");
  assert(typeof result.onboarding.stagesSkipped === "boolean", "Onboarding has stagesSkipped");
  assert(result.onboarding.stagesSkipped === false, "No stages were skipped");
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(60));
console.log(`Phase 9A Tests: ${passed} passed, ${failed} failed`);
console.log("═".repeat(60));

if (failed > 0) {
  console.log("\nFailed tests:");
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
} else {
  console.log("\n✓ All Phase 9A verification tests passed!");
  process.exit(0);
}
