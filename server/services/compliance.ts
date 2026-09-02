/**
 * Compliance Service — Phase 10C
 *
 * Evaluates organizational compliance policies against resources (calls, campaigns, contacts).
 * Supports deterministic rule-based evaluation for policies where reliable data exists.
 * Does NOT fabricate AI compliance scoring.
 */

import type {
  CompliancePolicyRow,
  ComplianceEvaluationRow,
  ComplianceCategory,
  ComplianceEvaluationStatus,
  CallRow,
  CampaignRow,
} from "../../shared/contracts";
import type { Db } from "../db/store";

export interface ComplianceEvaluationRequest {
  organizationId: string;
  policyId: string;
  resourceType: "call" | "campaign" | "contact" | "agent";
  resourceId: string;
}

export interface ComplianceEvaluationResult {
  status: ComplianceEvaluationStatus;
  result: string;
  context: Record<string, string | number | boolean | null>;
}

export interface ComplianceService {
  evaluate(request: ComplianceEvaluationRequest): Promise<ComplianceEvaluationResult>;
  evaluateCall(organizationId: string, policy: CompliancePolicyRow, call: CallRow): Promise<ComplianceEvaluationResult>;
  evaluateCampaign(organizationId: string, policy: CompliancePolicyRow, campaign: CampaignRow): Promise<ComplianceEvaluationResult>;
  getRecentEvaluations(organizationId: string, limit?: number): Promise<ComplianceEvaluationRow[]>;
  getEvaluationStats(organizationId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
  }>;
}

/**
 * Create the compliance service.
 */
export function createComplianceService(db: Db): ComplianceService {
  return {
    /**
     * Evaluate a resource against a compliance policy.
     */
    async evaluate(request: ComplianceEvaluationRequest): Promise<ComplianceEvaluationResult> {
      const policy = await db.compliancePolicies.get(request.policyId, request.organizationId);
      if (!policy) {
        return {
          status: "INCONCLUSIVE",
          result: "Policy not found or not accessible",
          context: {},
        };
      }

      if (!policy.enabled) {
        return {
          status: "SKIPPED",
          result: "Policy is disabled",
          context: {},
        };
      }

      // Route to appropriate evaluator based on resource type
      switch (request.resourceType) {
        case "call": {
          const call = await db.calls.get(request.resourceId, request.organizationId);
          if (!call) {
            return {
              status: "INCONCLUSIVE",
              result: "Call not found or not accessible",
              context: {},
            };
          }
          return await this.evaluateCall(request.organizationId, policy, call);
        }
        case "campaign": {
          const campaign = await db.campaigns.get(request.resourceId, request.organizationId);
          if (!campaign) {
            return {
              status: "INCONCLUSIVE",
              result: "Campaign not found or not accessible",
              context: {},
            };
          }
          return await this.evaluateCampaign(request.organizationId, policy, campaign);
        }
        default:
          return {
            status: "INCONCLUSIVE",
            result: `Evaluation not implemented for resource type: ${request.resourceType}`,
            context: {},
          };
      }
    },

    /**
     * Evaluate a call against a compliance policy.
     * Implements deterministic rule-based evaluation for supported categories.
     */
    async evaluateCall(
      organizationId: string,
      policy: CompliancePolicyRow,
      call: CallRow
    ): Promise<ComplianceEvaluationResult> {
      const context: Record<string, string | number | boolean | null> = {
        callId: call.id,
        callStatus: call.status,
        callDirection: call.direction,
        policyCategory: policy.category,
      };

      // Evaluate based on policy category
      switch (policy.category) {
        case "CALLING_HOURS": {
          // Check if call occurred within configured hours
          const config = policy.configuration as Record<string, any>;
          const startHour = config.startHour ?? 8;
          const endHour = config.endHour ?? 18;

          const callTime = new Date(call.startedAt);
          const hour = callTime.getHours();

          if (hour >= startHour && hour < endHour) {
            return {
              status: "PASSED",
              result: `Call occurred within configured hours (${startHour}:00 - ${endHour}:00)`,
              context: { ...context, hour, startHour, endHour },
            };
          } else {
            return {
              status: "VIOLATION",
              result: `Call occurred outside configured hours (${startHour}:00 - ${endHour}:00). Actual hour: ${hour}:00`,
              context: { ...context, hour, startHour, endHour },
            };
          }
        }

        case "RESTRICTED_CONTACTS": {
          // Check if call to a restricted number (DNC, blocked, etc.)
          const toNumber = call.toNumber;
          if (!toNumber) {
            return {
              status: "INCONCLUSIVE",
              result: "No destination number to check",
              context,
            };
          }

          const dncRecord = await db.dncRecords.findByIdentifier(
            organizationId,
            toNumber,
            "PHONE_NUMBER"
          );

          if (dncRecord) {
            return {
              status: "VIOLATION",
              result: `Contact attempted to restricted number (DNC record found)`,
              context: { ...context, dncRecordId: dncRecord.id, toNumber },
            };
          }

          return {
            status: "PASSED",
            result: "Contact not restricted",
            context,
          };
        }

        case "CONTACT_FREQUENCY": {
          // Check if contact frequency exceeds configured limits
          const config = policy.configuration as Record<string, any>;
          const maxCallsPerDay = config.maxCallsPerDay ?? 3;
          const maxCallsPerWeek = config.maxCallsPerWeek ?? 10;

          // Count recent calls to same number
          const allCalls = await db.calls.listByOrg(organizationId);
          const toNumber = call.toNumber;

          if (!toNumber) {
            return {
              status: "INCONCLUSIVE",
              result: "No destination number to check",
              context,
            };
          }

          const now = new Date();
          const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

          const callsToSameNumberToday = allCalls.filter((c) => {
            if (c.toNumber !== toNumber || c.id === call.id) return false;
            const callDate = new Date(c.startedAt);
            return callDate >= oneDayAgo && callDate <= now;
          });

          const callsToSameNumberThisWeek = allCalls.filter((c) => {
            if (c.toNumber !== toNumber || c.id === call.id) return false;
            const callDate = new Date(c.startedAt);
            return callDate >= oneWeekAgo && callDate <= now;
          });

          if (callsToSameNumberToday.length >= maxCallsPerDay) {
            return {
              status: "VIOLATION",
              result: `Contact frequency exceeded: ${callsToSameNumberToday.length} calls today (limit: ${maxCallsPerDay})`,
              context: {
                ...context,
                callsToday: callsToSameNumberToday.length,
                maxCallsPerDay,
              },
            };
          }

          if (callsToSameNumberThisWeek.length >= maxCallsPerWeek) {
            return {
              status: "VIOLATION",
              result: `Contact frequency exceeded: ${callsToSameNumberThisWeek.length} calls this week (limit: ${maxCallsPerWeek})`,
              context: {
                ...context,
                callsThisWeek: callsToSameNumberThisWeek.length,
                maxCallsPerWeek,
              },
            };
          }

          return {
            status: "PASSED",
            result: `Contact frequency within limits (today: ${callsToSameNumberToday.length}/${maxCallsPerDay}, week: ${callsToSameNumberThisWeek.length}/${maxCallsPerWeek})`,
            context: {
              ...context,
              callsToday: callsToSameNumberToday.length,
              callsThisWeek: callsToSameNumberThisWeek.length,
              maxCallsPerDay,
              maxCallsPerWeek,
            },
          };
        }

        default:
          return {
            status: "INCONCLUSIVE",
            result: `Evaluation not implemented for category: ${policy.category}`,
            context,
          };
      }
    },

    /**
     * Evaluate a campaign against a compliance policy.
     */
    async evaluateCampaign(
      organizationId: string,
      policy: CompliancePolicyRow,
      campaign: CampaignRow
    ): Promise<ComplianceEvaluationResult> {
      const context: Record<string, string | number | boolean | null> = {
        campaignId: campaign.id,
        campaignStatus: campaign.status,
        policyCategory: policy.category,
      };

      // Evaluate based on policy category
      switch (policy.category) {
        case "CALLING_HOURS": {
          // Check if campaign is scheduled within configured hours
          const config = policy.configuration as Record<string, any>;
          const startHour = config.startHour ?? 8;
          const endHour = config.endHour ?? 18;

          if (campaign.scheduledAt) {
            const scheduledTime = new Date(campaign.scheduledAt);
            const hour = scheduledTime.getHours();

            if (hour >= startHour && hour < endHour) {
              return {
                status: "PASSED",
                result: `Campaign scheduled within configured hours (${startHour}:00 - ${endHour}:00)`,
                context: { ...context, hour, startHour, endHour },
              };
            } else {
              return {
                status: "VIOLATION",
                result: `Campaign scheduled outside configured hours (${startHour}:00 - ${endHour}:00). Scheduled hour: ${hour}:00`,
                context: { ...context, hour, startHour, endHour },
              };
            }
          }

          return {
            status: "PASSED",
            result: "Campaign not scheduled for a specific time",
            context,
          };
        }

        default:
          return {
            status: "INCONCLUSIVE",
            result: `Campaign evaluation not implemented for category: ${policy.category}`,
            context,
          };
      }
    },

    /**
     * Get recent compliance evaluations for an organization.
     */
    async getRecentEvaluations(organizationId: string, limit = 50): Promise<ComplianceEvaluationRow[]> {
      return await db.complianceEvaluations.listByOrg(organizationId, limit);
    },

    /**
     * Get compliance evaluation statistics for an organization.
     */
    async getEvaluationStats(organizationId: string): Promise<{
      total: number;
      byStatus: Record<string, number>;
    }> {
      const total = await db.complianceEvaluations.count(organizationId);
      const byStatus = await db.complianceEvaluations.countByStatus(organizationId);
      return { total, byStatus };
    },
  };
}
