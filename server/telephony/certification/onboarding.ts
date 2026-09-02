/**
 * Phase 9A — Provider Onboarding Workflow
 * 
 * Manages the strict onboarding process for new telephony providers.
 * A provider MUST pass through each stage in order — no skipping allowed.
 * 
 * Onboarding Stages:
 * REGISTERED → CONFIGURATION_REQUIRED → CONFIGURED → SANDBOX_READY →
 * CERTIFICATION_PENDING → CERTIFICATION_RUNNING → CERTIFIED →
 * PRODUCTION_READY → ACTIVE
 */

import type { OnboardingStage, ProviderOnboarding } from "./types";

/**
 * Ordered list of onboarding stages.
 */
export const ONBOARDING_STAGES: readonly OnboardingStage[] = [
  "REGISTERED",
  "CONFIGURATION_REQUIRED",
  "CONFIGURED",
  "SANDBOX_READY",
  "CERTIFICATION_PENDING",
  "CERTIFICATION_RUNNING",
  "CERTIFIED",
  "PRODUCTION_READY",
  "ACTIVE",
] as const;

/**
 * Create a new onboarding workflow for a provider.
 */
export function createOnboardingWorkflow(providerId: string): ProviderOnboarding {
  const now = new Date().toISOString();
  return {
    providerId,
    currentStage: "REGISTERED",
    stageHistory: [
      { stage: "REGISTERED", enteredAt: now },
    ],
    stagesSkipped: false,
    startedAt: now,
    currentStageAt: now,
    updatedAt: now,
  };
}

/**
 * Advance the onboarding workflow to the next stage.
 * 
 * @param workflow - Current onboarding workflow
 * @param notes - Optional notes about the stage transition
 * @returns Updated workflow
 * @throws Error if trying to skip a stage
 */
export function advanceOnboardingStage(
  workflow: ProviderOnboarding,
  notes?: string
): ProviderOnboarding {
  const currentIndex = ONBOARDING_STAGES.indexOf(workflow.currentStage);
  
  if (currentIndex === ONBOARDING_STAGES.length - 1) {
    // Already at final stage
    return workflow;
  }

  const nextStage = ONBOARDING_STAGES[currentIndex + 1];
  const now = new Date().toISOString();

  // Update current stage history entry with exit time
  const updatedHistory = [...workflow.stageHistory];
  const lastEntry = updatedHistory[updatedHistory.length - 1];
  if (lastEntry && lastEntry.stage === workflow.currentStage) {
    lastEntry.exitedAt = now;
    if (notes) {
      lastEntry.notes = notes;
    }
  }

  // Add new stage entry
  updatedHistory.push({
    stage: nextStage,
    enteredAt: now,
  });

  return {
    ...workflow,
    currentStage: nextStage,
    stageHistory: updatedHistory,
    currentStageAt: now,
    updatedAt: now,
  };
}

/**
 * Advance the workflow to a specific stage (with validation).
 * 
 * @param workflow - Current onboarding workflow
 * @param targetStage - Target stage to advance to
 * @param notes - Optional notes
 * @returns Updated workflow
 * @throws Error if target stage is not the next expected stage
 */
export function advanceToStage(
  workflow: ProviderOnboarding,
  targetStage: OnboardingStage,
  notes?: string
): ProviderOnboarding {
  const currentIndex = ONBOARDING_STAGES.indexOf(workflow.currentStage);
  const targetIndex = ONBOARDING_STAGES.indexOf(targetStage);

  if (targetIndex < 0) {
    throw new Error(`Invalid stage: ${targetStage}`);
  }

  if (targetIndex <= currentIndex) {
    throw new Error(
      `Cannot advance to ${targetStage}: current stage is ${workflow.currentStage}`
    );
  }

  if (targetIndex > currentIndex + 1) {
    // Stage skip detected — this should NOT happen in practice
    const skippedStages = ONBOARDING_STAGES.slice(currentIndex + 1, targetIndex);
    throw new Error(
      `Cannot skip stages: ${skippedStages.join(" → ")}. ` +
      `Must advance through each stage in order.`
    );
  }

  return advanceOnboardingStage(workflow, notes);
}

/**
 * Check if a provider has completed onboarding.
 */
export function isOnboardingComplete(workflow: ProviderOnboarding): boolean {
  return workflow.currentStage === "ACTIVE";
}

/**
 * Check if a provider is certified.
 */
export function isProviderOnboarded(workflow: ProviderOnboarding): boolean {
  const certifiedIndex = ONBOARDING_STAGES.indexOf("CERTIFIED");
  const currentIndex = ONBOARDING_STAGES.indexOf(workflow.currentStage);
  return currentIndex >= certifiedIndex;
}

/**
 * Check if a provider is production ready.
 */
export function isProductionReady(workflow: ProviderOnboarding): boolean {
  const prodReadyIndex = ONBOARDING_STAGES.indexOf("PRODUCTION_READY");
  const currentIndex = ONBOARDING_STAGES.indexOf(workflow.currentStage);
  return currentIndex >= prodReadyIndex;
}

/**
 * Get the stages that have been completed.
 */
export function getCompletedStages(workflow: ProviderOnboarding): OnboardingStage[] {
  return workflow.stageHistory
    .filter((entry) => entry.exitedAt !== undefined)
    .map((entry) => entry.stage);
}

/**
 * Get the stages that are remaining.
 */
export function getRemainingStages(workflow: ProviderOnboarding): OnboardingStage[] {
  const currentIndex = ONBOARDING_STAGES.indexOf(workflow.currentStage);
  return ONBOARDING_STAGES.slice(currentIndex);
}

/**
 * Get onboarding progress as a percentage.
 */
export function getOnboardingProgress(workflow: ProviderOnboarding): number {
  const currentIndex = ONBOARDING_STAGES.indexOf(workflow.currentStage);
  return Math.round(((currentIndex + 1) / ONBOARDING_STAGES.length) * 100);
}

/**
 * Create a summary of onboarding state (safe for logging).
 */
export function summarizeOnboarding(workflow: ProviderOnboarding): {
  providerId: string;
  currentStage: OnboardingStage;
  progress: number;
  completedStages: number;
  totalStages: number;
  stagesSkipped: boolean;
} {
  return {
    providerId: workflow.providerId,
    currentStage: workflow.currentStage,
    progress: getOnboardingProgress(workflow),
    completedStages: getCompletedStages(workflow).length,
    totalStages: ONBOARDING_STAGES.length,
    stagesSkipped: workflow.stagesSkipped,
  };
}

/**
 * Validate that a stage transition is legal.
 */
export function isValidStageTransition(
  from: OnboardingStage,
  to: OnboardingStage
): boolean {
  const fromIndex = ONBOARDING_STAGES.indexOf(from);
  const toIndex = ONBOARDING_STAGES.indexOf(to);

  if (fromIndex < 0 || toIndex < 0) return false;
  return toIndex === fromIndex + 1;
}

/**
 * Get the next expected stage.
 */
export function getNextStage(current: OnboardingStage): OnboardingStage | null {
  const currentIndex = ONBOARDING_STAGES.indexOf(current);
  if (currentIndex === ONBOARDING_STAGES.length - 1) return null;
  return ONBOARDING_STAGES[currentIndex + 1];
}

/**
 * Get the previous stage.
 */
export function getPreviousStage(current: OnboardingStage): OnboardingStage | null {
  const currentIndex = ONBOARDING_STAGES.indexOf(current);
  if (currentIndex <= 0) return null;
  return ONBOARDING_STAGES[currentIndex - 1];
}

/**
 * Format onboarding stage for display.
 */
export function formatOnboardingStage(stage: OnboardingStage): string {
  const labels: Record<OnboardingStage, string> = {
    REGISTERED: "Registered",
    CONFIGURATION_REQUIRED: "Configuration Required",
    CONFIGURED: "Configured",
    SANDBOX_READY: "Sandbox Ready",
    CERTIFICATION_PENDING: "Certification Pending",
    CERTIFICATION_RUNNING: "Certification Running",
    CERTIFIED: "Certified",
    PRODUCTION_READY: "Production Ready",
    ACTIVE: "Active",
  };
  return labels[stage];
}
