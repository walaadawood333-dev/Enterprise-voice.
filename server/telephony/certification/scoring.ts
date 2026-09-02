/**
 * Phase 9A — Provider Certification Scoring
 * 
 * Calculates certification scores for providers across all categories.
 * Scores are used to determine production eligibility.
 */

import type {
  CertificationReport,
  CategoryResult,
  CertificationCategory,
  TestResult,
} from "./types";

/**
 * Certification score for a single category.
 */
export interface CategoryScore {
  category: CertificationCategory;
  /** Raw score (0-100) */
  score: number;
  /** Weight factor for this category */
  weight: number;
  /** Weighted score */
  weightedScore: number;
  /** Result status */
  result: TestResult;
  /** Whether all mandatory tests passed */
  allMandatoryPassed: boolean;
}

/**
 * Overall certification score.
 */
export interface CertificationScore {
  /** Provider identifier */
  providerId: string;
  /** Overall weighted score (0-100) */
  overallScore: number;
  /** Category scores */
  categoryScores: CategoryScore[];
  /** Certification result */
  result: TestResult;
  /** Whether provider is production eligible */
  productionEligible: boolean;
  /** Score timestamp */
  timestamp: string;
}

/**
 * Category weights for scoring.
 * Higher weight = more important for certification.
 */
const CATEGORY_WEIGHTS: Record<CertificationCategory, number> = {
  CONFIGURATION: 1.0,
  CAPABILITIES: 0.8,
  HEALTH: 1.2,
  SECURITY: 1.5,         // Security is critical
  LIFECYCLE: 1.3,        // Lifecycle is critical
  IDEMPOTENCY: 1.4,      // Idempotency is critical
  TENANT_ISOLATION: 1.5, // Tenant isolation is critical
  MEDIA: 0.5,            // Optional capability
  ERROR_HANDLING: 1.2,   // Error handling is important
  OBSERVABILITY: 0.8,    // Important but not blocking
};

/**
 * Calculate certification scores from a certification report.
 */
export function calculateCertificationScore(report: CertificationReport): CertificationScore {
  const categoryScores = report.categories.map((cat) => calculateCategoryScore(cat));

  // Calculate overall weighted score
  const totalWeight = categoryScores.reduce((sum, cs) => sum + cs.weight, 0);
  const weightedSum = categoryScores.reduce((sum, cs) => sum + cs.weightedScore, 0);
  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  // Determine overall result
  const hasFailures = categoryScores.some((cs) => cs.result === "FAILED");
  const allMandatory = categoryScores.every((cs) => cs.allMandatoryPassed);
  let result: TestResult;

  if (hasFailures) {
    result = "FAILED";
  } else if (allMandatory && overallScore >= 90) {
    result = "CERTIFIED";
  } else if (overallScore >= 70) {
    result = "PASSED";
  } else if (overallScore >= 50) {
    result = "PARTIAL";
  } else {
    result = "NOT_TESTED";
  }

  // Production eligibility: CERTIFIED + all mandatory passed + non-simulation
  const productionEligible = result === "CERTIFIED" && allMandatory && !report.providerId.includes("demo");

  return {
    providerId: report.providerId,
    overallScore,
    categoryScores,
    result,
    productionEligible,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Calculate the score for a single category.
 */
function calculateCategoryScore(category: CategoryResult): CategoryScore {
  const weight = CATEGORY_WEIGHTS[category.category] ?? 1.0;

  // Calculate raw score
  let score: number;
  if (category.total === 0) {
    score = 0;
  } else {
    // Passed tests count as full, partial as half
    const passedWeight = category.passed * 1.0;
    const partialWeight = category.tests.filter((t) => t.result === "PARTIAL").length * 0.5;
    score = Math.round(((passedWeight + partialWeight) / category.total) * 100);
  }

  // Check if all mandatory tests passed
  const mandatoryTests = category.tests.filter((t) => t.mandatory);
  const allMandatoryPassed = mandatoryTests.every(
    (t) => t.result === "PASSED" || t.result === "CERTIFIED"
  );

  return {
    category: category.category,
    score,
    weight,
    weightedScore: score * weight,
    result: category.result,
    allMandatoryPassed,
  };
}

/**
 * Get a human-readable score label.
 */
export function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 30) return "Poor";
  return "Failed";
}

/**
 * Format a certification score for display.
 */
export function formatCertificationScore(score: CertificationScore): string {
  const lines: string[] = [
    `=== Certification Score: ${score.providerId} ===`,
    `Overall: ${score.overallScore}/100 (${score.result})`,
    `Production Eligible: ${score.productionEligible ? "Yes" : "No"}`,
    ``,
    `Category Scores:`,
  ];

  for (const cs of score.categoryScores) {
    const label = getScoreLabel(cs.score);
    lines.push(`  ${cs.category}: ${cs.score}/100 (${label}, weight: ${cs.weight}x)`);
  }

  return lines.join("\n");
}
