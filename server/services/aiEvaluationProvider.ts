/**
 * AI Evaluation Provider Service — Phase 17
 *
 * Provides provider abstraction for AI-powered QA evaluation.
 * Supports optional AI evaluation that complements (never replaces) human/rule-based scoring.
 */

import type {
  AIEvaluationProvider,
  AIEvaluationRequest,
  AIEvaluationResponse,
  AIEvaluationResult,
  AIEvaluationConfig,
} from "../../shared/contracts";
import type { Logger } from "../lib/observability";

/**
 * AI Evaluation Provider Interface
 */
export interface AIEvaluationProviderAdapter {
  readonly provider: AIEvaluationProvider;
  readonly name: string;
  evaluate(request: AIEvaluationRequest, config: AIEvaluationConfig): Promise<AIEvaluationResponse>;
  isAvailable(): boolean;
}

/**
 * Mock AI Provider (for testing and demo)
 * Evaluates based on simple heuristics without real AI
 */
export class MockAIEvaluationProvider implements AIEvaluationProviderAdapter {
  readonly provider: AIEvaluationProvider = "openai";
  readonly name = "Mock AI Provider";

  constructor(private logger: Logger) {}

  isAvailable(): boolean {
    return true;
  }

  async evaluate(request: AIEvaluationRequest, config: AIEvaluationConfig): Promise<AIEvaluationResponse> {
    const startTime = Date.now();
    this.logger.info("mock_ai_evaluation_start", {
      organizationId: request.organizationId,
      evaluationId: request.evaluationId,
      criteriaCount: request.criteria.length,
    });

    try {
      const results: AIEvaluationResult[] = [];

      for (const criterion of request.criteria) {
        // Simple heuristic evaluation based on transcript analysis
        const analysis = this.analyzeTranscript(request.transcript, criterion);

        results.push({
          criterionId: criterion.id,
          score: analysis.score,
          maxScore: criterion.maxScore,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          evidence: analysis.evidence,
          suggestions: analysis.suggestions,
        });
      }

      const overallConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

      const response: AIEvaluationResponse = {
        success: true,
        results,
        overallConfidence,
        provider: this.provider,
        model: "mock-v1",
        latencyMs: Date.now() - startTime,
      };

      this.logger.info("mock_ai_evaluation_complete", {
        organizationId: request.organizationId,
        evaluationId: request.evaluationId,
        overallConfidence,
        latencyMs: response.latencyMs,
      });

      return response;
    } catch (error) {
      this.logger.error("mock_ai_evaluation_error", {
        organizationId: request.organizationId,
        evaluationId: request.evaluationId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        results: [],
        overallConfidence: 0,
        provider: this.provider,
        model: "mock-v1",
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private analyzeTranscript(
    transcript: Array<{ role: string; content: string; timestamp: string }>,
    criterion: { name: string; description: string; maxScore: number }
  ): {
    score: number;
    confidence: number;
    reasoning: string;
    evidence: string[];
    suggestions?: string[];
  } {
    const evidence: string[] = [];
    const suggestions: string[] = [];

    // Analyze based on criterion name/description
    const lowerName = criterion.name.toLowerCase();
    const lowerDesc = criterion.description.toLowerCase();

    // Professionalism check
    if (lowerName.includes("professional") || lowerDesc.includes("professional")) {
      const professionalIndicators = ["thank", "please", "appreciate", "help", "assist"];
      const unprofessionalIndicators = ["hmm", "uh", "um", "i don't know", "can't"];

      let professionalCount = 0;
      let unprofessionalCount = 0;

      for (const msg of transcript) {
        if (msg.role === "assistant") {
          const content = msg.content.toLowerCase();
          professionalIndicators.forEach((ind) => {
            if (content.includes(ind)) {
              professionalCount++;
              if (evidence.length < 3) evidence.push(`"${msg.content}"`);
            }
          });
          unprofessionalIndicators.forEach((ind) => {
            if (content.includes(ind)) unprofessionalCount++;
          });
        }
      }

      const score = Math.min(
        criterion.maxScore,
        Math.max(0, professionalCount * 2 - unprofessionalCount * 3)
      );
      const confidence = Math.min(0.9, 0.5 + professionalCount * 0.1);

      if (professionalCount === 0) {
        suggestions.push("Consider using more professional language");
      }
      if (unprofessionalCount > 2) {
        suggestions.push("Reduce filler words and uncertain language");
      }

      return {
        score,
        confidence,
        reasoning: `Found ${professionalCount} professional indicators and ${unprofessionalCount} unprofessional indicators`,
        evidence,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      };
    }

    // Empathy check
    if (lowerName.includes("empathy") || lowerDesc.includes("empathy")) {
      const empathyIndicators = ["understand", "sorry", "concern", "frustrat", "feel"];
      let empathyCount = 0;

      for (const msg of transcript) {
        if (msg.role === "assistant") {
          const content = msg.content.toLowerCase();
          empathyIndicators.forEach((ind) => {
            if (content.includes(ind)) {
              empathyCount++;
              if (evidence.length < 3) evidence.push(`"${msg.content}"`);
            }
          });
        }
      }

      const score = Math.min(criterion.maxScore, empathyCount * 3);
      const confidence = Math.min(0.85, 0.4 + empathyCount * 0.15);

      if (empathyCount === 0) {
        suggestions.push("Show more empathy and understanding");
      }

      return {
        score,
        confidence,
        reasoning: `Found ${empathyCount} empathy indicators in the conversation`,
        evidence,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      };
    }

    // Solution-oriented check
    if (lowerName.includes("solution") || lowerDesc.includes("solution")) {
      const solutionIndicators = ["solution", "fix", "resolve", "here's what", "let me", "we can"];
      let solutionCount = 0;

      for (const msg of transcript) {
        if (msg.role === "assistant") {
          const content = msg.content.toLowerCase();
          solutionIndicators.forEach((ind) => {
            if (content.includes(ind)) {
              solutionCount++;
              if (evidence.length < 3) evidence.push(`"${msg.content}"`);
            }
          });
        }
      }

      const score = Math.min(criterion.maxScore, solutionCount * 2);
      const confidence = Math.min(0.8, 0.3 + solutionCount * 0.15);

      if (solutionCount === 0) {
        suggestions.push("Provide more concrete solutions and next steps");
      }

      return {
        score,
        confidence,
        reasoning: `Found ${solutionCount} solution-oriented statements`,
        evidence,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      };
    }

    // Default: generic evaluation
    const transcriptLength = transcript.length;
    const assistantMessages = transcript.filter((m) => m.role === "assistant").length;
    const avgResponseLength =
      transcript
        .filter((m) => m.role === "assistant")
        .reduce((sum, m) => sum + m.content.length, 0) / Math.max(1, assistantMessages);

    const score = Math.min(criterion.maxScore, Math.floor(avgResponseLength / 50));
    const confidence = Math.min(0.6, 0.3 + transcriptLength * 0.02);

    evidence.push(`Conversation had ${transcriptLength} messages`);
    evidence.push(`Average response length: ${Math.floor(avgResponseLength)} characters`);

    if (avgResponseLength < 50) {
      suggestions.push("Provide more detailed responses");
    }

    return {
      score,
      confidence,
      reasoning: `Generic evaluation based on conversation structure`,
      evidence,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }
}

/**
 * Create AI Evaluation Provider
 */
export function createAIEvaluationProvider(
  provider: AIEvaluationProvider,
  logger: Logger
): AIEvaluationProviderAdapter {
  // Currently only mock provider is implemented
  // Real providers (OpenAI, Anthropic) would be added here
  return new MockAIEvaluationProvider(logger);
}
