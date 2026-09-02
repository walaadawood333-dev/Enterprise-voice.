/**
 * QA Evaluation Service — Phase 10D
 *
 * Business logic for QA evaluation templates, evaluations, scoring, and findings.
 * Implements deterministic scoring engine and provider abstraction.
 */

import type {
  QAEvaluationTemplateRow,
  QAEvaluationCriterionRow,
  QAEvaluationRow,
  QAEvaluationScoreRow,
  QAFindingRow,
  QATemplateStatus,
  QAEvaluationType,
  QAEvaluationStatus,
  QAScoringMethod,
  QAFindingSeverity,
  QAFindingStatus,
  QAEvaluationTemplateDto,
  QAEvaluationCriterionDto,
  QAEvaluationDto,
  QAEvaluationScoreDto,
  QAFindingDto,
  QAOverviewDto,
  QAAgentPerformanceDto,
  VoiceSessionRow,
  AgentRow,
} from "../../shared/contracts";
import type { Db } from "../db/store";
import { createAuditService } from "./audit";

export interface QAEvaluationService {
  // Template management
  createTemplate(
    organizationId: string,
    input: {
      name: string;
      description?: string;
      evaluationType?: QAEvaluationType;
      maxScore?: number;
      passingScore?: number;
    }
  ): Promise<QAEvaluationTemplateDto>;

  getTemplate(
    organizationId: string,
    templateId: string
  ): Promise<QAEvaluationTemplateDto | undefined>;

  listTemplates(
    organizationId: string,
    status?: QATemplateStatus
  ): Promise<QAEvaluationTemplateDto[]>;

  updateTemplate(
    organizationId: string,
    templateId: string,
    patch: Partial<{
      name: string;
      description: string;
      status: QATemplateStatus;
      evaluationType: QAEvaluationType;
      maxScore: number;
      passingScore: number;
    }>
  ): Promise<QAEvaluationTemplateDto | undefined>;

  deleteTemplate(organizationId: string, templateId: string): Promise<boolean>;

  // Criterion management
  addCriterion(
    organizationId: string,
    templateId: string,
    input: {
      name: string;
      description?: string;
      weight?: number;
      required?: boolean;
      scoringMethod?: QAScoringMethod;
      maxScore?: number;
      displayOrder?: number;
    }
  ): Promise<QAEvaluationCriterionDto>;

  listCriteria(
    organizationId: string,
    templateId: string
  ): Promise<QAEvaluationCriterionDto[]>;

  updateCriterion(
    organizationId: string,
    criterionId: string,
    patch: Partial<{
      name: string;
      description: string;
      weight: number;
      required: boolean;
      scoringMethod: QAScoringMethod;
      maxScore: number;
      displayOrder: number;
    }>
  ): Promise<QAEvaluationCriterionDto | undefined>;

  deleteCriterion(organizationId: string, criterionId: string): Promise<boolean>;

  // Evaluation management
  createEvaluation(
    organizationId: string,
    input: {
      templateId: string;
      voiceSessionId: string;
      evaluatorId?: string | null;
      evaluatorName?: string;
    }
  ): Promise<QAEvaluationDto>;

  getEvaluation(
    organizationId: string,
    evaluationId: string
  ): Promise<QAEvaluationDto | undefined>;

  listEvaluations(
    organizationId: string,
    status?: QAEvaluationStatus
  ): Promise<QAEvaluationDto[]>;

  listByVoiceSession(
    organizationId: string,
    voiceSessionId: string
  ): Promise<QAEvaluationDto[]>;

  updateEvaluation(
    organizationId: string,
    evaluationId: string,
    patch: Partial<{
      status: QAEvaluationStatus;
      evaluatorName: string;
      notes: string;
    }>
  ): Promise<QAEvaluationDto | undefined>;

  submitEvaluation(
    organizationId: string,
    evaluationId: string
  ): Promise<QAEvaluationDto | undefined>;

  voidEvaluation(
    organizationId: string,
    evaluationId: string
  ): Promise<QAEvaluationDto | undefined>;

  deleteEvaluation(organizationId: string, evaluationId: string): Promise<boolean>;

  // Score management
  setScore(
    organizationId: string,
    evaluationId: string,
    criterionId: string,
    input: {
      score: number;
      comments?: string;
    }
  ): Promise<QAEvaluationScoreDto>;

  listScores(
    organizationId: string,
    evaluationId: string
  ): Promise<QAEvaluationScoreDto[]>;

  // Finding management
  createFinding(
    organizationId: string,
    evaluationId: string,
    input: {
      criterionId?: string | null;
      category?: string;
      severity?: QAFindingSeverity;
      description: string;
    }
  ): Promise<QAFindingDto>;

  listFindings(
    organizationId: string,
    evaluationId: string
  ): Promise<QAFindingDto[]>;

  listFindingsByOrg(
    organizationId: string,
    status?: QAFindingStatus
  ): Promise<QAFindingDto[]>;

  updateFinding(
    organizationId: string,
    findingId: string,
    patch: Partial<{
      category: string;
      severity: QAFindingSeverity;
      status: QAFindingStatus;
      description: string;
    }>
  ): Promise<QAFindingDto | undefined>;

  deleteFinding(organizationId: string, findingId: string): Promise<boolean>;

  // Analytics
  getOverview(organizationId: string): Promise<QAOverviewDto>;
  getAgentPerformance(organizationId: string): Promise<QAAgentPerformanceDto[]>;
}

/**
 * Create the QA evaluation service.
 */
export function createQAEvaluationService(db: Db): QAEvaluationService {
  const audit = createAuditService(db);

  return {
    // ─── Template Management ─────────────────────────────────────────────
    async createTemplate(organizationId, input) {
      const template = await db.qaTemplates.create({
        organizationId,
        name: input.name,
        description: input.description || "",
        status: "draft",
        evaluationType: input.evaluationType || "human",
        maxScore: input.maxScore || 100,
        passingScore: input.passingScore || 70,
      });

      await audit.record({
        organizationId,
        action: "QA_TEMPLATE_CREATED",
        actorId: null,
        actorEmail: null,
        metadata: {
          templateId: template.id,
          templateName: template.name,
          evaluationType: template.evaluationType,
        },
      });

      return toTemplateDto(template, 0);
    },

    async getTemplate(organizationId, templateId) {
      const template = await db.qaTemplates.get(templateId, organizationId);
      if (!template) return undefined;

      const criteria = await db.qaCriteria.listByTemplate(organizationId, templateId);
      return toTemplateDto(template, criteria.length);
    },

    async listTemplates(organizationId, status) {
      const templates = await db.qaTemplates.listByOrg(organizationId, status);
      const dtos: QAEvaluationTemplateDto[] = [];

      for (const template of templates) {
        const criteria = await db.qaCriteria.listByTemplate(organizationId, template.id);
        dtos.push(toTemplateDto(template, criteria.length));
      }

      return dtos;
    },

    async updateTemplate(organizationId, templateId, patch) {
      const template = await db.qaTemplates.update(templateId, organizationId, patch);
      if (!template) return undefined;

      if (patch.status === "archived") {
        await audit.record({
          organizationId,
          action: "QA_TEMPLATE_ARCHIVED",
          actorId: null,
          actorEmail: null,
          metadata: {
            templateId: template.id,
            templateName: template.name,
          },
        });
      } else {
        await audit.record({
          organizationId,
          action: "QA_TEMPLATE_UPDATED",
          actorId: null,
          actorEmail: null,
          metadata: {
            templateId: template.id,
            templateName: template.name,
            changes: Object.keys(patch).join(","),
          },
        });
      }

      const criteria = await db.qaCriteria.listByTemplate(organizationId, templateId);
      return toTemplateDto(template, criteria.length);
    },

    async deleteTemplate(organizationId, templateId) {
      const template = await db.qaTemplates.get(templateId, organizationId);
      // Delete all criteria first
      await db.qaCriteria.deleteByTemplate(organizationId, templateId);
      const deleted = await db.qaTemplates.delete(templateId, organizationId);

      if (deleted && template) {
        await audit.record({
          organizationId,
          action: "QA_TEMPLATE_DELETED",
          actorId: null,
          actorEmail: null,
          metadata: {
            templateId: template.id,
            templateName: template.name,
          },
        });
      }

      return deleted;
    },

    // ─── Criterion Management ────────────────────────────────────────────
    async addCriterion(organizationId, templateId, input) {
      // Verify template exists and belongs to organization
      const template = await db.qaTemplates.get(templateId, organizationId);
      if (!template) throw new Error("Template not found");

      // If template is archived, cannot add criteria
      if (template.status === "archived") {
        throw new Error("Cannot add criteria to archived template");
      }

      const criterion = await db.qaCriteria.create({
        organizationId,
        templateId,
        name: input.name,
        description: input.description || "",
        weight: input.weight || 10,
        required: input.required !== false,
        scoringMethod: input.scoringMethod || "numeric",
        maxScore: input.maxScore || 10,
        displayOrder: input.displayOrder || 0,
      });

      return toCriterionDto(criterion);
    },

    async listCriteria(organizationId, templateId) {
      const criteria = await db.qaCriteria.listByTemplate(organizationId, templateId);
      return criteria.map(toCriterionDto);
    },

    async updateCriterion(organizationId, criterionId, patch) {
      const criterion = await db.qaCriteria.update(criterionId, organizationId, patch);
      if (!criterion) return undefined;
      return toCriterionDto(criterion);
    },

    async deleteCriterion(organizationId, criterionId) {
      return await db.qaCriteria.delete(criterionId, organizationId);
    },

    // ─── Evaluation Management ───────────────────────────────────────────
    async createEvaluation(organizationId, input) {
      // Verify template exists
      const template = await db.qaTemplates.get(input.templateId, organizationId);
      if (!template) throw new Error("Template not found");

      // Verify voice session exists
      const session = await db.sessions.get(input.voiceSessionId, organizationId);
      if (!session) throw new Error("Voice session not found");

      const evaluation = await db.qaEvaluations.create({
        organizationId,
        templateId: input.templateId,
        voiceSessionId: input.voiceSessionId,
        evaluatorId: input.evaluatorId || null,
        evaluatorName: input.evaluatorName || "",
        status: "draft",
        notes: "",
      });

      await audit.record({
        organizationId,
        action: "QA_EVALUATION_CREATED",
        actorId: input.evaluatorId || null,
        actorEmail: null,
        metadata: {
          evaluationId: evaluation.id,
          templateId: template.id,
          voiceSessionId: session.id,
          evaluatorName: input.evaluatorName || "",
        },
      });

      return await this.getEvaluation(organizationId, evaluation.id);
    },

    async getEvaluation(organizationId, evaluationId) {
      const evaluation = await db.qaEvaluations.get(evaluationId, organizationId);
      if (!evaluation) return undefined;

      const [template, session, scores, findings, agents] = await Promise.all([
        db.qaTemplates.get(evaluation.templateId, organizationId),
        db.sessions.get(evaluation.voiceSessionId, organizationId),
        db.qaScores.listByEvaluation(organizationId, evaluationId),
        db.qaFindings.listByEvaluation(organizationId, evaluationId),
        db.agents.listByOrg(organizationId),
      ]);

      if (!template || !session) return undefined;

      const agent = agents.find((a) => a.id === session.agentId);

      // Get criterion details for each score
      const criteriaScores: QAEvaluationDto["criteriaScores"] = [];
      for (const score of scores) {
        const criterion = await db.qaCriteria.get(score.criterionId, organizationId);
        if (criterion) {
          criteriaScores.push({
            criterionId: criterion.id,
            criterionName: criterion.name,
            score: score.score,
            maxScore: criterion.maxScore,
            weight: criterion.weight,
            comments: score.comments,
          });
        }
      }

      return toEvaluationDto(evaluation, template, session, agent, criteriaScores, findings);
    },

    async listEvaluations(organizationId, status) {
      const evaluations = await db.qaEvaluations.listByOrg(organizationId, status);
      const dtos: QAEvaluationDto[] = [];

      for (const evaluation of evaluations) {
        const dto = await this.getEvaluation(organizationId, evaluation.id);
        if (dto) dtos.push(dto);
      }

      return dtos;
    },

    async listByVoiceSession(organizationId, voiceSessionId) {
      const evaluations = await db.qaEvaluations.listByVoiceSession(organizationId, voiceSessionId);
      const dtos: QAEvaluationDto[] = [];

      for (const evaluation of evaluations) {
        const dto = await this.getEvaluation(organizationId, evaluation.id);
        if (dto) dtos.push(dto);
      }

      return dtos;
    },

    async updateEvaluation(organizationId, evaluationId, patch) {
      const evaluation = await db.qaEvaluations.update(evaluationId, organizationId, patch);
      if (!evaluation) return undefined;
      return await this.getEvaluation(organizationId, evaluationId);
    },

    async submitEvaluation(organizationId, evaluationId) {
      const evaluation = await db.qaEvaluations.get(evaluationId, organizationId);
      if (!evaluation) return undefined;

      // Cannot submit if already completed or voided
      if (evaluation.status === "completed" || evaluation.status === "void") {
        throw new Error("Cannot submit evaluation in current status");
      }

      // Calculate total score
      const scores = await db.qaScores.listByEvaluation(organizationId, evaluationId);
      const criteria = await db.qaCriteria.listByTemplate(organizationId, evaluation.templateId);

      const { totalScore, passed } = calculateTotalScore(scores, criteria, evaluation);

      // Update evaluation
      const updated = await db.qaEvaluations.update(evaluationId, organizationId, {
        status: "completed",
        totalScore,
        passed,
        submittedAt: new Date().toISOString(),
      });

      if (!updated) return undefined;

      await audit.record({
        organizationId,
        action: "QA_EVALUATION_SUBMITTED",
        actorId: evaluation.evaluatorId,
        actorEmail: null,
        metadata: {
          evaluationId: evaluation.id,
          totalScore,
          passed,
          templateId: evaluation.templateId,
          voiceSessionId: evaluation.voiceSessionId,
        },
      });

      return await this.getEvaluation(organizationId, evaluationId);
    },

    async voidEvaluation(organizationId, evaluationId) {
      const evaluation = await db.qaEvaluations.get(evaluationId, organizationId);
      if (!evaluation) return undefined;

      const updated = await db.qaEvaluations.update(evaluationId, organizationId, {
        status: "void",
      });

      if (!updated) return undefined;

      await audit.record({
        organizationId,
        action: "QA_EVALUATION_VOIDED",
        actorId: null,
        actorEmail: null,
        metadata: {
          evaluationId: evaluation.id,
          templateId: evaluation.templateId,
          voiceSessionId: evaluation.voiceSessionId,
        },
      });

      return await this.getEvaluation(organizationId, evaluationId);
    },

    async deleteEvaluation(organizationId, evaluationId) {
      // Delete all scores and findings first
      await db.qaScores.deleteByEvaluation(organizationId, evaluationId);
      return await db.qaEvaluations.delete(evaluationId, organizationId);
    },

    // ─── Score Management ────────────────────────────────────────────────
    async setScore(organizationId, evaluationId, criterionId, input) {
      // Verify evaluation exists
      const evaluation = await db.qaEvaluations.get(evaluationId, organizationId);
      if (!evaluation) throw new Error("Evaluation not found");

      // Cannot score if completed or voided
      if (evaluation.status === "completed" || evaluation.status === "void") {
        throw new Error("Cannot score evaluation in current status");
      }

      // Verify criterion exists
      const criterion = await db.qaCriteria.get(criterionId, organizationId);
      if (!criterion) throw new Error("Criterion not found");

      // Validate score
      if (input.score < 0 || input.score > criterion.maxScore) {
        throw new Error(`Score must be between 0 and ${criterion.maxScore}`);
      }

      // Check if score already exists
      const existingScores = await db.qaScores.listByEvaluation(organizationId, evaluationId);
      const existing = existingScores.find((s) => s.criterionId === criterionId);

      let score: QAEvaluationScoreRow;
      if (existing) {
        score = (await db.qaScores.update(existing.id, organizationId, {
          score: input.score,
          comments: input.comments || "",
        }))!;
      } else {
        score = await db.qaScores.create({
          organizationId,
          evaluationId,
          criterionId,
          score: input.score,
          comments: input.comments || "",
        });
      }

      return toScoreDto(score, criterion);
    },

    async listScores(organizationId, evaluationId) {
      const scores = await db.qaScores.listByEvaluation(organizationId, evaluationId);
      const dtos: QAEvaluationScoreDto[] = [];

      for (const score of scores) {
        const criterion = await db.qaCriteria.get(score.criterionId, organizationId);
        if (criterion) {
          dtos.push(toScoreDto(score, criterion));
        }
      }

      return dtos;
    },

    // ─── Finding Management ──────────────────────────────────────────────
    async createFinding(organizationId, evaluationId, input) {
      // Verify evaluation exists
      const evaluation = await db.qaEvaluations.get(evaluationId, organizationId);
      if (!evaluation) throw new Error("Evaluation not found");

      const finding = await db.qaFindings.create({
        organizationId,
        evaluationId,
        criterionId: input.criterionId || null,
        category: input.category || "",
        severity: input.severity || "medium",
        status: "open",
        description: input.description,
      });

      await audit.record({
        organizationId,
        action: "QA_FINDING_CREATED",
        actorId: null,
        actorEmail: null,
        metadata: {
          findingId: finding.id,
          evaluationId: evaluation.id,
          category: finding.category,
          severity: finding.severity,
        },
      });

      return toFindingDto(finding, null);
    },

    async listFindings(organizationId, evaluationId) {
      const findings = await db.qaFindings.listByEvaluation(organizationId, evaluationId);
      const dtos: QAFindingDto[] = [];

      for (const finding of findings) {
        const criterion = finding.criterionId
          ? await db.qaCriteria.get(finding.criterionId, organizationId)
          : null;
        dtos.push(toFindingDto(finding, criterion));
      }

      return dtos;
    },

    async listFindingsByOrg(organizationId, status) {
      const findings = await db.qaFindings.listByOrg(organizationId, status);
      const dtos: QAFindingDto[] = [];

      for (const finding of findings) {
        const criterion = finding.criterionId
          ? await db.qaCriteria.get(finding.criterionId, organizationId)
          : null;
        dtos.push(toFindingDto(finding, criterion));
      }

      return dtos;
    },

    async updateFinding(organizationId, findingId, patch) {
      const finding = await db.qaFindings.update(findingId, organizationId, patch);
      if (!finding) return undefined;

      const criterion = finding.criterionId
        ? await db.qaCriteria.get(finding.criterionId, organizationId)
        : null;

      return toFindingDto(finding, criterion);
    },

    async deleteFinding(organizationId, findingId) {
      return await db.qaFindings.delete(findingId, organizationId);
    },

    // ─── Analytics ───────────────────────────────────────────────────────
    async getOverview(organizationId) {
      const evaluations = await db.qaEvaluations.listByOrg(organizationId);
      const completed = evaluations.filter((e) => e.status === "completed");
      const pending = evaluations.filter((e) => e.status === "draft" || e.status === "in_progress");

      const scores = completed.filter((e) => e.totalScore !== null).map((e) => e.totalScore!);
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

      const passed = completed.filter((e) => e.passed === true).length;
      const passRate = completed.length > 0 ? (passed / completed.length) * 100 : null;

      // Get recent evaluations (last 10)
      const recent = evaluations
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10);

      const recentDtos: QAEvaluationDto[] = [];
      for (const evaluation of recent) {
        const dto = await this.getEvaluation(organizationId, evaluation.id);
        if (dto) recentDtos.push(dto);
      }

      return {
        organizationId,
        totalEvaluations: evaluations.length,
        pendingReviews: pending.length,
        completedReviews: completed.length,
        averageQualityScore: avgScore,
        passRate,
        recentEvaluations: recentDtos,
        empty: evaluations.length === 0,
      };
    },

    async getAgentPerformance(organizationId) {
      const evaluations = await db.qaEvaluations.listByOrg(organizationId);
      const completed = evaluations.filter((e) => e.status === "completed");
      const agents = await db.agents.listByOrg(organizationId);

      const performance: QAAgentPerformanceDto[] = [];

      for (const agent of agents) {
        // Get evaluations for this agent's sessions
        const agentEvaluations: QAEvaluationRow[] = [];
        for (const evaluation of completed) {
          const session = await db.sessions.get(evaluation.voiceSessionId, organizationId);
          if (session && session.agentId === agent.id) {
            agentEvaluations.push(evaluation);
          }
        }

        const scores = agentEvaluations
          .filter((e) => e.totalScore !== null)
          .map((e) => e.totalScore!);

        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
        const passed = agentEvaluations.filter((e) => e.passed === true).length;
        const failed = agentEvaluations.filter((e) => e.passed === false).length;
        const passRate = agentEvaluations.length > 0 ? (passed / agentEvaluations.length) * 100 : null;

        performance.push({
          agentId: agent.id,
          agentName: agent.name,
          evaluations: agentEvaluations.length,
          averageScore: avgScore,
          passRate,
          completedEvaluations: passed,
          failedEvaluations: failed,
        });
      }

      return performance;
    },
  };
}

// ─── Helper Functions ───────────────────────────────────────────────────

function toTemplateDto(
  template: QAEvaluationTemplateRow,
  criteriaCount: number
): QAEvaluationTemplateDto {
  return {
    id: template.id,
    organizationId: template.organizationId,
    name: template.name,
    description: template.description,
    status: template.status,
    evaluationType: template.evaluationType,
    maxScore: template.maxScore,
    passingScore: template.passingScore,
    criteriaCount,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function toCriterionDto(criterion: QAEvaluationCriterionRow): QAEvaluationCriterionDto {
  return {
    id: criterion.id,
    organizationId: criterion.organizationId,
    templateId: criterion.templateId,
    name: criterion.name,
    description: criterion.description,
    weight: criterion.weight,
    required: criterion.required,
    scoringMethod: criterion.scoringMethod,
    maxScore: criterion.maxScore,
    displayOrder: criterion.displayOrder,
    createdAt: criterion.createdAt,
    updatedAt: criterion.updatedAt,
  };
}

function toEvaluationDto(
  evaluation: QAEvaluationRow,
  template: QAEvaluationTemplateRow,
  session: VoiceSessionRow,
  agent: AgentRow | undefined,
  criteriaScores: QAEvaluationDto["criteriaScores"],
  findings: QAFindingRow[]
): QAEvaluationDto {
  return {
    id: evaluation.id,
    organizationId: evaluation.organizationId,
    templateId: evaluation.templateId,
    templateName: template.name,
    voiceSessionId: evaluation.voiceSessionId,
    agentId: session.agentId,
    agentName: agent?.name || "Unknown Agent",
    evaluatorId: evaluation.evaluatorId,
    evaluatorName: evaluation.evaluatorName,
    status: evaluation.status,
    totalScore: evaluation.totalScore,
    passed: evaluation.passed,
    notes: evaluation.notes,
    submittedAt: evaluation.submittedAt,
    criteriaScores,
    findings: findings.map((f) => toFindingDto(f, null)),
    createdAt: evaluation.createdAt,
    updatedAt: evaluation.updatedAt,
  };
}

function toScoreDto(
  score: QAEvaluationScoreRow,
  criterion: QAEvaluationCriterionRow
): QAEvaluationScoreDto {
  return {
    id: score.id,
    organizationId: score.organizationId,
    evaluationId: score.evaluationId,
    criterionId: score.criterionId,
    criterionName: criterion.name,
    score: score.score,
    maxScore: criterion.maxScore,
    weight: criterion.weight,
    comments: score.comments,
    createdAt: score.createdAt,
    updatedAt: score.updatedAt,
  };
}

function toFindingDto(
  finding: QAFindingRow,
  criterion: QAEvaluationCriterionRow | null
): QAFindingDto {
  return {
    id: finding.id,
    organizationId: finding.organizationId,
    evaluationId: finding.evaluationId,
    criterionId: finding.criterionId,
    criterionName: criterion?.name || null,
    category: finding.category,
    severity: finding.severity,
    status: finding.status,
    description: finding.description,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
  };
}

/**
 * Calculate total score from individual criterion scores.
 * Uses weighted average based on criterion weights.
 */
function calculateTotalScore(
  scores: QAEvaluationScoreRow[],
  criteria: QAEvaluationCriterionRow[],
  evaluation: QAEvaluationRow
): { totalScore: number; passed: boolean } {
  if (scores.length === 0) {
    return { totalScore: 0, passed: false };
  }

  const template = criteria[0] ? { maxScore: 100, passingScore: 70 } : { maxScore: 100, passingScore: 70 };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const score of scores) {
    const criterion = criteria.find((c) => c.id === score.criterionId);
    if (criterion) {
      // Normalize score to 0-100 scale
      const normalizedScore = (score.score / criterion.maxScore) * 100;
      weightedSum += normalizedScore * criterion.weight;
      totalWeight += criterion.weight;
    }
  }

  const totalScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const passed = totalScore >= template.passingScore;

  return { totalScore, passed };
}

// ─── Phase 17: AI Evaluation Integration ─────────────────────────────────

import type {
  AIEvaluationConfig,
  AIEvaluationRequest,
  AIEvaluationResponse,
  AIEvaluationMetrics,
  MessageRow,
} from "../../shared/contracts";
import {
  createAIEvaluationProvider,
  type AIEvaluationProviderAdapter,
} from "./aiEvaluationProvider";

/**
 * Extended QA Service with AI Evaluation Support
 */
export interface QAEvaluationServiceExtended extends QAEvaluationService {
  // AI Evaluation
  triggerAIEvaluation(
    organizationId: string,
    evaluationId: string,
    config: AIEvaluationConfig
  ): Promise<AIEvaluationResponse>;

  getAIEvaluationMetrics(organizationId: string): Promise<AIEvaluationMetrics>;

  // Transcript extraction
  extractTranscript(
    organizationId: string,
    voiceSessionId: string
  ): Promise<Array<{ role: string; content: string; timestamp: string }>>;
}

/**
 * Create Extended QA Service with AI Support
 */
export function createQAEvaluationServiceExtended(db: Db, logger: any): QAEvaluationServiceExtended {
  const baseService = createQAEvaluationService(db);
  const audit = createAuditService(db);

  return {
    ...baseService,

    /**
     * Extract transcript from voice session messages
     */
    async extractTranscript(organizationId, voiceSessionId) {
      const messages = await db.messages.listBySession(voiceSessionId, organizationId);
      return messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      }));
    },

    /**
     * Trigger AI evaluation for an evaluation
     */
    async triggerAIEvaluation(organizationId, evaluationId, config) {
      // Get evaluation
      const evaluation = await db.qaEvaluations.get(evaluationId, organizationId);
      if (!evaluation) {
        throw new Error("Evaluation not found");
      }

      // Verify evaluation is in draft or in_progress status
      if (evaluation.status !== "draft" && evaluation.status !== "in_progress") {
        throw new Error("Evaluation must be in draft or in_progress status for AI evaluation");
      }

      // Get template
      const template = await db.qaTemplates.get(evaluation.templateId, organizationId);
      if (!template) {
        throw new Error("Template not found");
      }

      // Extract transcript
      const transcript = await this.extractTranscript(organizationId, evaluation.voiceSessionId);

      if (transcript.length === 0) {
        throw new Error("No transcript available for evaluation");
      }

      // Get criteria
      const criteria = await db.qaCriteria.listByTemplate(organizationId, template.id);

      // Build AI evaluation request
      const request: AIEvaluationRequest = {
        organizationId,
        evaluationId,
        templateId: template.id,
        voiceSessionId: evaluation.voiceSessionId,
        transcript,
        criteria: criteria.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          maxScore: c.maxScore,
          weight: c.weight,
        })),
      };

      // Create AI provider
      const provider = createAIEvaluationProvider(config.provider, logger);

      // Perform AI evaluation
      logger.info("ai_evaluation_triggered", {
        organizationId,
        evaluationId,
        provider: config.provider,
        transcriptLength: transcript.length,
        criteriaCount: criteria.length,
      });

      const response = await provider.evaluate(request, config);

      // Log audit event
      await audit.record({
        organizationId,
        action: response.success ? "AI_EVALUATION_COMPLETED" : "AI_EVALUATION_FAILED",
        actorId: null,
        actorEmail: null,
        metadata: {
          evaluationId,
          provider: config.provider,
          model: response.model,
          success: response.success,
          overallConfidence: response.overallConfidence,
          resultsCount: response.results.length,
          latencyMs: response.latencyMs,
          error: response.error,
        },
      });

      // If successful, store AI evaluation results
      if (response.success) {
        for (const result of response.results) {
          // Set score from AI evaluation
          await baseService.setScore(organizationId, evaluationId, result.criterionId, {
            score: result.score,
            comments: `[AI Evaluation - ${Math.round(result.confidence * 100)}% confidence]\n${result.reasoning}\n\nEvidence:\n${result.evidence.join("\n")}${result.suggestions ? "\n\nSuggestions:\n" + result.suggestions.join("\n") : ""}`,
          });

          // Create findings for low-confidence scores or suggestions
          if (result.confidence < 0.6 || (result.suggestions && result.suggestions.length > 0)) {
            await baseService.createFinding(organizationId, evaluationId, {
              criterionId: result.criterionId,
              category: "AI Observation",
              severity: result.confidence < 0.4 ? "high" : result.confidence < 0.6 ? "medium" : "low",
              description: `${result.reasoning}\n\nSuggestions:\n${result.suggestions?.join("\n") || "No specific suggestions"}`,
            });
          }
        }

        logger.info("ai_evaluation_scores_stored", {
          organizationId,
          evaluationId,
          scoresStored: response.results.length,
          averageConfidence: response.overallConfidence,
        });
      }

      return response;
    },

    /**
     * Get AI evaluation metrics for an organization
     */
    async getAIEvaluationMetrics(organizationId) {
      const auditEvents = await db.audit.listByOrg(organizationId, 1000);

      const aiEvents = auditEvents.filter(
        (e) => e.action === "AI_EVALUATION_COMPLETED" || e.action === "AI_EVALUATION_FAILED"
      );

      const completed = aiEvents.filter((e) => e.action === "AI_EVALUATION_COMPLETED");
      const failed = aiEvents.filter((e) => e.action === "AI_EVALUATION_FAILED");

      const providerUsage: Record<string, number> = {
        openai: 0,
        anthropic: 0,
        custom: 0,
      };

      let totalConfidence = 0;
      let totalLatency = 0;

      for (const event of completed) {
        const provider = event.metadata.provider as string;
        if (provider in providerUsage) {
          providerUsage[provider]++;
        }
        totalConfidence += (event.metadata.overallConfidence as number) || 0;
        totalLatency += (event.metadata.latencyMs as number) || 0;
      }

      return {
        totalEvaluations: aiEvents.length,
        averageConfidence: completed.length > 0 ? totalConfidence / completed.length : 0,
        providerUsage: providerUsage as Record<AIEvaluationProvider, number>,
        averageLatencyMs: completed.length > 0 ? totalLatency / completed.length : 0,
        errorRate: aiEvents.length > 0 ? (failed.length / aiEvents.length) * 100 : 0,
      };
    },
  };
}
