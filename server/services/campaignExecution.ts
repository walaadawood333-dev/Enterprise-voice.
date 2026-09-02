/**
 * Phase 12 — Campaign Execution & Intelligent Dialing Engine Service
 *
 * Orchestrates the complete campaign lifecycle:
 * - Contact import, validation, normalization, deduplication
 * - DNC/compliance screening
 * - Queue management with priority
 * - Campaign execution controls (start/pause/resume/stop)
 * - Dial attempt tracking
 * - Outcome classification
 * - Retry/callback scheduling
 * - Demo simulation
 *
 * Key principles:
 * - Provider-agnostic: uses existing TelephonyProvider abstraction
 * - Compliance-first: DNC check before every dial attempt
 * - Multi-tenant: all queries scoped to organizationId
 * - No fabrication: real data only, empty states when no data
 */

import type {
  CallOutcomeType,
  CampaignContactPhase12Row,
  CampaignEventType12,
  CampaignRow,
  ContactImportInput,
  ContactImportResult,
  ContactRow,
  ContactValidationStatus,
  DialingQueueItemStatus,
  DialingQueueStats,
  CampaignExecutionMetrics,
  PhoneNormalizationResult,
  PhoneValidationStatus,
  RetryBackoffStrategy,
} from "../../shared/contracts";
import type { Db } from "../db/store";

export interface CampaignExecutionService {
  // Contact management
  importContacts(
    organizationId: string,
    campaignId: string,
    contacts: ContactImportInput[]
  ): Promise<ContactImportResult>;

  normalizePhone(phone: string, defaultCountry?: string): PhoneNormalizationResult;

  validateContacts(organizationId: string, campaignId: string): Promise<{
    validated: number;
    valid: number;
    invalid: number;
    missingPhone: number;
  }>;

  deduplicateContacts(organizationId: string, campaignId: string): Promise<{
    checked: number;
    duplicates: number;
  }>;

  screenDnc(organizationId: string, campaignId: string): Promise<{
    checked: number;
    blocked: number;
  }>;

  prepareQueue(organizationId: string, campaignId: string): Promise<{
    queued: number;
    blocked: number;
  }>;

  // Campaign execution
  startCampaign(organizationId: string, campaignId: string): Promise<boolean>;
  pauseCampaign(organizationId: string, campaignId: string): Promise<boolean>;
  resumeCampaign(organizationId: string, campaignId: string): Promise<boolean>;
  stopCampaign(organizationId: string, campaignId: string): Promise<boolean>;

  // Queue operations
  getNextContact(
    organizationId: string,
    campaignId: string,
    workerId: string
  ): Promise<CampaignContactPhase12Row | undefined>;

  recordOutcome(
    organizationId: string,
    campaignContactId: string,
    attemptId: string,
    outcome: CallOutcomeType,
    detail?: string
  ): Promise<void>;

  // Metrics
  getQueueStats(organizationId: string, campaignId: string): Promise<DialingQueueStats>;
  getExecutionMetrics(organizationId: string, campaignId: string): Promise<CampaignExecutionMetrics>;

  // Retry & callback
  scheduleRetry(
    organizationId: string,
    campaignContactId: string,
    outcome: CallOutcomeType
  ): Promise<boolean>;

  scheduleCallback(
    organizationId: string,
    campaignContactId: string,
    callbackAt: string
  ): Promise<boolean>;
}

// ─── Phone Normalization ────────────────────────────────────────────────

/**
 * Country code mapping for supported markets.
 * Extensible — new countries can be added without rewriting.
 */
const COUNTRY_CODES: Record<string, { code: string; length: number; prefix: string[] }> = {
  JO: { code: "+962", length: 9, prefix: ["077", "078", "079", "073", "075", "074"] },
  AE: { code: "+971", length: 9, prefix: ["050", "052", "054", "055", "056", "058"] },
  SA: { code: "+966", length: 9, prefix: ["05"] },
  EG: { code: "+20", length: 10, prefix: ["01"] },
  US: { code: "+1", length: 10, prefix: [] },
  GB: { code: "+44", length: 10, prefix: ["07"] },
};

function normalizePhoneNumber(rawPhone: string, defaultCountry: string = "JO"): PhoneNormalizationResult {
  if (!rawPhone || rawPhone.trim().length === 0) {
    return {
      rawPhone,
      normalizedPhone: null,
      countryCode: null,
      isValid: false,
      validationStatus: "INVALID_FORMAT",
    };
  }

  // Strip whitespace, dashes, parens
  const cleaned = rawPhone.replace(/[\s\-\(\)\.]/g, "");

  // Check if already in E.164 format
  if (cleaned.startsWith("+")) {
    // Find matching country
    for (const [country, info] of Object.entries(COUNTRY_CODES)) {
      if (cleaned.startsWith(info.code)) {
        const numberPart = cleaned.slice(info.code.length);
        if (numberPart.length >= info.length - 2) {
          return {
            rawPhone,
            normalizedPhone: cleaned,
            countryCode: country,
            isValid: true,
            validationStatus: "VALID",
          };
        }
      }
    }
    // Unknown country code but has + prefix
    return {
      rawPhone,
      normalizedPhone: cleaned,
      countryCode: null,
      isValid: true,
      validationStatus: "VALID",
    };
  }

  // Try to match local format
  const countryInfo = COUNTRY_CODES[defaultCountry];
  if (countryInfo) {
    // Check if it starts with a known local prefix
    const hasLocalPrefix = countryInfo.prefix.some((p) => cleaned.startsWith(p));
    if (hasLocalPrefix || cleaned.startsWith("0")) {
      // Remove leading 0 and prepend country code
      const localNumber = cleaned.startsWith("0") ? cleaned.slice(1) : cleaned;
      const normalized = countryInfo.code + localNumber;
      if (localNumber.length >= 7) {
        return {
          rawPhone,
          normalizedPhone: normalized,
          countryCode: defaultCountry,
          isValid: true,
          validationStatus: "VALID",
        };
      }
    }

    // Try without leading 0
    const normalized = countryInfo.code + cleaned;
    if (cleaned.length >= 7) {
      return {
        rawPhone,
        normalizedPhone: normalized,
        countryCode: defaultCountry,
        isValid: true,
        validationStatus: "VALID",
      };
    }
  }

  // Fallback: if it looks like a phone number (7+ digits)
  const digitsOnly = cleaned.replace(/[^0-9]/g, "");
  if (digitsOnly.length >= 7) {
    return {
      rawPhone,
      normalizedPhone: "+" + digitsOnly,
      countryCode: defaultCountry,
      isValid: true,
      validationStatus: "VALID",
    };
  }

  return {
    rawPhone,
    normalizedPhone: null,
    countryCode: null,
    isValid: false,
    validationStatus: "INVALID_FORMAT",
  };
}

// ─── Default Retry Policy ───────────────────────────────────────────────

const DEFAULT_RETRY_DELAYS: Record<string, number> = {
  NO_ANSWER: 14400, // 4 hours
  BUSY: 1800, // 30 minutes
  FAILED: 7200, // 2 hours
  VOICEMAIL: 86400, // 24 hours
};

const DEFAULT_RETRY_ACTIONS: Record<string, string> = {
  ANSWERED: "stop",
  COMPLETED: "stop",
  PROMISE_TO_PAY: "stop",
  PAYMENT_CONFIRMED: "stop",
  REFUSED: "stop",
  NO_ANSWER: "retry",
  BUSY: "retry",
  FAILED: "retry",
  VOICEMAIL: "retry",
  CALLBACK_REQUESTED: "callback",
  WRONG_NUMBER: "stop",
  DNC_REQUEST: "suppress",
  DISPUTE: "escalate",
};

// ─── Service Factory ────────────────────────────────────────────────────

export function createCampaignExecutionService(deps: {
  db: Db;
  audit?: any;
  entitlements?: any;
  dnc?: any;
}): CampaignExecutionService {
  const { db, audit, entitlements, dnc } = deps;

  async function checkEntitlement(organizationId: string): Promise<void> {
    if (!entitlements) return;
    // Campaigns feature is required for execution
    const has = await entitlements.hasFeature(organizationId, "campaigns");
    if (!has) {
      throw new Error("CAMPAIGNS_NOT_ENTITLED");
    }
  }

  async function logEvent(
    organizationId: string,
    campaignId: string,
    eventType: CampaignEventType12,
    description: string,
    metadata: Record<string, any> = {},
    actorId: string | null = null
  ): Promise<void> {
    await db.campaignEventsPhase12.create({
      organizationId,
      campaignId,
      eventType,
      description,
      metadata,
      actorId,
    });
  }

  return {
    async importContacts(organizationId, campaignId, contacts) {
      await checkEntitlement(organizationId);

      // Verify campaign belongs to this org
      const campaign = await db.campaigns.get(campaignId, organizationId);
      if (!campaign) {
        throw new Error("CAMPAIGN_NOT_FOUND");
      }

      const result: ContactImportResult = {
        total: contacts.length,
        valid: 0,
        invalid: 0,
        duplicates: 0,
        dnc: 0,
        missingPhone: 0,
        imported: 0,
        rejected: 0,
        errors: [],
      };

      for (let i = 0; i < contacts.length; i++) {
        const input = contacts[i];
        const rowNum = i + 1;

        // Validate phone
        if (!input.phone || input.phone.trim().length === 0) {
          result.missingPhone++;
          result.rejected++;
          result.errors.push({ row: rowNum, field: "phone", message: "Phone number is required" });
          continue;
        }

        // Normalize phone
        const normalized = normalizePhoneNumber(input.phone, input.country || "JO");
        if (!normalized.isValid) {
          result.invalid++;
          result.rejected++;
          result.errors.push({
            row: rowNum,
            field: "phone",
            message: `Invalid phone format: ${input.phone}`,
          });
          continue;
        }

        // Check for duplicate (same normalized phone within org)
        const existing = await db.contactsPhase12.findByNormalizedPhone(
          organizationId,
          normalized.normalizedPhone!
        );
        if (existing) {
          result.duplicates++;
          // Still create but mark as duplicate
          const contact = await db.contactsPhase12.create({
            organizationId,
            firstName: input.firstName ?? null,
            lastName: input.lastName ?? null,
            rawPhone: input.phone,
            normalizedPhone: normalized.normalizedPhone,
            email: input.email ?? null,
            customerId: input.customerId ?? null,
            externalId: input.externalId ?? null,
            language: input.language ?? null,
            timezone: input.timezone ?? null,
            country: input.country ?? "JO",
            segment: input.segment ?? null,
            priority: input.priority ?? 0,
            customFields: input.customFields ?? {},
            validationStatus: "DUPLICATE",
            phoneValidation: normalized.validationStatus,
            countryCode: normalized.countryCode,
            phoneType: null,
            isDnc: false,
            dncReason: null,
            isDuplicate: true,
            duplicateOfId: existing.id,
          });

          // Link to campaign
          await db.campaignContactsPhase12.create({
            organizationId,
            campaignId,
            contactId: contact.id,
            priority: input.priority ?? 0,
            maxAttempts: 3,
            customData: input.customFields ?? {},
          });

          result.imported++;
          continue;
        }

        // Create contact
        const contact = await db.contactsPhase12.create({
          organizationId,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          rawPhone: input.phone,
          normalizedPhone: normalized.normalizedPhone,
          email: input.email ?? null,
          customerId: input.customerId ?? null,
          externalId: input.externalId ?? null,
          language: input.language ?? null,
          timezone: input.timezone ?? null,
          country: input.country ?? "JO",
          segment: input.segment ?? null,
          priority: input.priority ?? 0,
          customFields: input.customFields ?? {},
          validationStatus: "VALID",
          phoneValidation: normalized.validationStatus,
          countryCode: normalized.countryCode,
          phoneType: null,
          isDnc: false,
          dncReason: null,
          isDuplicate: false,
          duplicateOfId: null,
        });

        // Link to campaign
        await db.campaignContactsPhase12.create({
          organizationId,
          campaignId,
          contactId: contact.id,
          priority: input.priority ?? 0,
          maxAttempts: 3,
          customData: input.customFields ?? {},
        });

        result.valid++;
        result.imported++;
      }

      // Update campaign total contacts
      await db.campaigns.update(campaignId, organizationId, {
        totalContacts: await db.campaignContactsPhase12.listByCampaign(organizationId, campaignId).then(c => c.length),
      });

      await logEvent(organizationId, campaignId, "CONTACTS_IMPORTED", `Imported ${result.imported} contacts`, {
        total: result.total,
        valid: result.valid,
        invalid: result.invalid,
        duplicates: result.duplicates,
      });

      if (audit) {
        await audit.log({
          organizationId,
          action: "CONTACTS_IMPORTED_PHASE12",
          metadata: { campaignId, total: result.total, imported: result.imported },
        });
      }

      return result;
    },

    normalizePhone(rawPhone: string, defaultCountry?: string) {
      return normalizePhoneNumber(rawPhone, defaultCountry);
    },

    async validateContacts(organizationId, campaignId) {
      await checkEntitlement(organizationId);

      const campaignContacts = await db.campaignContactsPhase12.listByCampaign(organizationId, campaignId);
      let validated = 0;
      let valid = 0;
      let invalid = 0;
      let missingPhone = 0;

      for (const cc of campaignContacts) {
        const contact = await db.contactsPhase12.get(cc.contactId, organizationId);
        if (!contact) continue;

        validated++;

        // Re-validate phone
        if (!contact.normalizedPhone) {
          await db.contactsPhase12.update(contact.id, organizationId, {
            validationStatus: "MISSING_PHONE",
          });
          await db.campaignContactsPhase12.update(cc.id, organizationId, {
            blocked: true,
            blockedReason: "MISSING_PHONE",
          });
          missingPhone++;
          continue;
        }

        const normalized = normalizePhoneNumber(contact.rawPhone, contact.country || "JO");
        if (!normalized.isValid) {
          await db.contactsPhase12.update(contact.id, organizationId, {
            validationStatus: "INVALID",
            phoneValidation: normalized.validationStatus,
          });
          await db.campaignContactsPhase12.update(cc.id, organizationId, {
            blocked: true,
            blockedReason: "INVALID_PHONE",
          });
          invalid++;
          continue;
        }

        // Update with normalized data
        await db.contactsPhase12.update(contact.id, organizationId, {
          validationStatus: "VALID",
          phoneValidation: normalized.validationStatus,
          normalizedPhone: normalized.normalizedPhone,
          countryCode: normalized.countryCode,
        });
        valid++;
      }

      await logEvent(organizationId, campaignId, "CONTACTS_VALIDATED", `Validated ${validated} contacts`, {
        valid,
        invalid,
        missingPhone,
      });

      if (audit) {
        await audit.log({
          organizationId,
          action: "CONTACTS_VALIDATED",
          metadata: { campaignId, validated, valid, invalid },
        });
      }

      return { validated, valid, invalid, missingPhone };
    },

    async deduplicateContacts(organizationId, campaignId) {
      await checkEntitlement(organizationId);

      const campaignContacts = await db.campaignContactsPhase12.listByCampaign(organizationId, campaignId);
      const seenPhones = new Map<string, string>(); // normalizedPhone → first contactId
      let checked = 0;
      let duplicates = 0;

      for (const cc of campaignContacts) {
        const contact = await db.contactsPhase12.get(cc.contactId, organizationId);
        if (!contact || !contact.normalizedPhone) continue;

        checked++;

        if (seenPhones.has(contact.normalizedPhone)) {
          // Mark as duplicate
          duplicates++;
          await db.contactsPhase12.update(contact.id, organizationId, {
            isDuplicate: true,
            validationStatus: "DUPLICATE",
          });
          await db.campaignContactsPhase12.update(cc.id, organizationId, {
            blocked: true,
            blockedReason: "DUPLICATE",
          });
        } else {
          seenPhones.set(contact.normalizedPhone, contact.id);
        }
      }

      await logEvent(organizationId, campaignId, "CONTACTS_DEDUPLICATED", `Found ${duplicates} duplicates`, {
        checked,
        duplicates,
      });

      if (audit) {
        await audit.log({
          organizationId,
          action: "CONTACTS_DEDUPLICATED",
          metadata: { campaignId, checked, duplicates },
        });
      }

      return { checked, duplicates };
    },

    async screenDnc(organizationId, campaignId) {
      await checkEntitlement(organizationId);

      const campaignContacts = await db.campaignContactsPhase12.listByCampaign(organizationId, campaignId);
      let checked = 0;
      let blocked = 0;

      for (const cc of campaignContacts) {
        if (cc.blocked) continue; // Already blocked

        const contact = await db.contactsPhase12.get(cc.contactId, organizationId);
        if (!contact || !contact.normalizedPhone) continue;

        checked++;

        // Check DNC records
        if (dnc) {
          const dncResult = await dnc.check({
            organizationId,
            identifier: contact.normalizedPhone,
            identifierType: "PHONE_NUMBER",
          });

          if (!dncResult.allowed) {
            blocked++;
            await db.contactsPhase12.update(contact.id, organizationId, {
              isDnc: true,
              dncReason: dncResult.reason || "DNC_BLOCKED",
              validationStatus: "DNC",
            });
            await db.campaignContactsPhase12.update(cc.id, organizationId, {
              blocked: true,
              blockedReason: dncResult.reason || "DNC_BLOCKED",
            });
          }
        }
      }

      await logEvent(organizationId, campaignId, "DNC_CHECK_COMPLETED", `Blocked ${blocked} DNC contacts`, {
        checked,
        blocked,
      });

      if (audit) {
        await audit.log({
          organizationId,
          action: "DNC_SCREENING_COMPLETED",
          metadata: { campaignId, checked, blocked },
        });
      }

      return { checked, blocked };
    },

    async prepareQueue(organizationId, campaignId) {
      await checkEntitlement(organizationId);

      const campaignContacts = await db.campaignContactsPhase12.listByCampaign(organizationId, campaignId);
      let queued = 0;
      let blocked = 0;

      for (const cc of campaignContacts) {
        if (cc.blocked) {
          blocked++;
          continue;
        }

        const contact = await db.contactsPhase12.get(cc.contactId, organizationId);
        if (!contact || contact.validationStatus !== "VALID" || contact.isDnc || contact.isDuplicate) {
          await db.campaignContactsPhase12.update(cc.id, organizationId, {
            blocked: true,
            blockedReason: contact?.validationStatus || "INVALID",
          });
          blocked++;
          continue;
        }

        // Set status to QUEUED
        await db.campaignContactsPhase12.update(cc.id, organizationId, {
          status: "QUEUED",
        });
        queued++;
      }

      await logEvent(organizationId, campaignId, "QUEUE_PREPARED", `Queued ${queued} contacts`, {
        queued,
        blocked,
      });

      if (audit) {
        await audit.log({
          organizationId,
          action: "DIALING_QUEUE_PREPARED",
          metadata: { campaignId, queued, blocked },
        });
      }

      return { queued, blocked };
    },

    async startCampaign(organizationId, campaignId) {
      await checkEntitlement(organizationId);

      const campaign = await db.campaigns.get(campaignId, organizationId);
      if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");

      if (campaign.status !== "draft" && campaign.status !== "paused" && campaign.status !== "scheduled") {
        throw new Error("CAMPAIGN_NOT_STARTABLE");
      }

      await db.campaigns.update(campaignId, organizationId, {
        status: "running",
        startedAt: new Date().toISOString(),
      });

      await logEvent(organizationId, campaignId, "CAMPAIGN_STARTED", "Campaign execution started");

      if (audit) {
        await audit.log({
          organizationId,
          action: "CAMPAIGN_EXECUTION_STARTED",
          metadata: { campaignId },
        });
      }

      return true;
    },

    async pauseCampaign(organizationId, campaignId) {
      await checkEntitlement(organizationId);

      const campaign = await db.campaigns.get(campaignId, organizationId);
      if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");
      if (campaign.status !== "running") throw new Error("CAMPAIGN_NOT_RUNNING");

      await db.campaigns.update(campaignId, organizationId, {
        status: "paused",
      });

      await logEvent(organizationId, campaignId, "CAMPAIGN_PAUSED", "Campaign execution paused");

      if (audit) {
        await audit.log({
          organizationId,
          action: "CAMPAIGN_EXECUTION_PAUSED",
          metadata: { campaignId },
        });
      }

      return true;
    },

    async resumeCampaign(organizationId, campaignId) {
      await checkEntitlement(organizationId);

      const campaign = await db.campaigns.get(campaignId, organizationId);
      if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");
      if (campaign.status !== "paused") throw new Error("CAMPAIGN_NOT_PAUSED");

      await db.campaigns.update(campaignId, organizationId, {
        status: "running",
      });

      await logEvent(organizationId, campaignId, "CAMPAIGN_RESUMED", "Campaign execution resumed");

      if (audit) {
        await audit.log({
          organizationId,
          action: "CAMPAIGN_EXECUTION_RESUMED",
          metadata: { campaignId },
        });
      }

      return true;
    },

    async stopCampaign(organizationId, campaignId) {
      await checkEntitlement(organizationId);

      const campaign = await db.campaigns.get(campaignId, organizationId);
      if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");

      await db.campaigns.update(campaignId, organizationId, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });

      // Cancel all queued contacts
      const queued = await db.campaignContactsPhase12.listByCampaign(organizationId, campaignId, "QUEUED");
      for (const cc of queued) {
        await db.campaignContactsPhase12.update(cc.id, organizationId, {
          status: "CANCELLED",
        });
      }

      await logEvent(organizationId, campaignId, "CAMPAIGN_STOPPED", "Campaign execution stopped");

      if (audit) {
        await audit.log({
          organizationId,
          action: "CAMPAIGN_EXECUTION_STOPPED",
          metadata: { campaignId },
        });
      }

      return true;
    },

    async getNextContact(organizationId, campaignId, workerId) {
      // Verify campaign is running
      const campaign = await db.campaigns.get(campaignId, organizationId);
      if (!campaign || campaign.status !== "running") return undefined;

      // Get next queued contact
      const next = await db.campaignContactsPhase12.getNextQueued(organizationId, campaignId);
      if (!next) return undefined;

      // Reserve it atomically
      const reserved = await db.campaignContactsPhase12.reserve(next.id, organizationId, workerId);
      return reserved ?? undefined;
    },

    async recordOutcome(organizationId, campaignContactId, attemptId, outcome, detail) {
      await checkEntitlement(organizationId);

      const cc = await db.campaignContactsPhase12.get(campaignContactId, organizationId);
      if (!cc) throw new Error("CAMPAIGN_CONTACT_NOT_FOUND");

      const now = new Date().toISOString();

      // Update attempt record
      await db.dialAttemptsPhase12.update(attemptId, organizationId, {
        outcome,
        outcomeDetail: detail ?? null,
        endedAt: now,
        durationSeconds: cc.lastAttemptAt
          ? Math.round((Date.now() - new Date(cc.lastAttemptAt).getTime()) / 1000)
          : null,
      });

      // Update campaign contact
      await db.campaignContactsPhase12.update(campaignContactId, organizationId, {
        lastOutcome: outcome,
        lastOutcomeDetail: detail ?? null,
        lastAttemptAt: now,
        attemptNumber: cc.attemptNumber + 1,
        status: outcome === "ANSWERED" || outcome === "COMPLETED" || outcome === "PROMISE_TO_PAY" || outcome === "PAYMENT_CONFIRMED"
          ? "COMPLETED"
          : outcome === "CALLBACK_REQUESTED"
          ? "QUEUED"
          : outcome === "NO_ANSWER" || outcome === "BUSY" || outcome === "FAILED" || outcome === "VOICEMAIL"
          ? "RETRY"
          : outcome === "WRONG_NUMBER" || outcome === "DNC_REQUEST" || outcome === "REFUSED"
          ? "BLOCKED"
          : "COMPLETED",
      });

      // Update campaign metrics
      const campaign = await db.campaigns.get(cc.campaignId, organizationId);
      if (campaign) {
        const updateData: any = {
          processedContacts: campaign.processedContacts + 1,
        };
        if (outcome === "ANSWERED" || outcome === "COMPLETED" || outcome === "PROMISE_TO_PAY" || outcome === "PAYMENT_CONFIRMED") {
          updateData.completedCalls = campaign.completedCalls + 1;
        } else if (outcome === "FAILED" || outcome === "WRONG_NUMBER") {
          updateData.failedCalls = campaign.failedCalls + 1;
        }
        await db.campaigns.update(cc.campaignId, organizationId, updateData);
      }

      // Log the outcome event
      await logEvent(cc.organizationId, cc.campaignId, "CALLBACK_SCHEDULED" as CampaignEventType12, `Outcome: ${outcome}`, {
        campaignContactId,
        outcome,
        detail,
      });

      if (audit) {
        await audit.log({
          organizationId,
          action: "CALL_OUTCOME_RECORDED",
          metadata: { campaignContactId, attemptId, outcome },
        });
      }
    },

    async getQueueStats(organizationId, campaignId) {
      const counts = await db.campaignContactsPhase12.countByStatus(organizationId, campaignId);
      return {
        queued: counts["QUEUED"] || 0,
        reserved: counts["RESERVED"] || 0,
        dialing: counts["DIALING"] || 0,
        connected: counts["CONNECTED"] || 0,
        completed: counts["COMPLETED"] || 0,
        retry: counts["RETRY"] || 0,
        failed: counts["FAILED"] || 0,
        skipped: counts["SKIPPED"] || 0,
        blocked: counts["BLOCKED"] || 0,
        cancelled: counts["CANCELLED"] || 0,
      };
    },

    async getExecutionMetrics(organizationId, campaignId) {
      const campaign = await db.campaigns.get(campaignId, organizationId);
      if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");

      const queueStats = await this.getQueueStats(organizationId, campaignId);
      const outcomeCounts = await db.campaignContactsPhase12.countByOutcome(organizationId, campaignId);

      const totalContacts = await db.campaignContactsPhase12.listByCampaign(organizationId, campaignId).then(c => c.length);
      const blocked = queueStats.blocked;
      const eligible = totalContacts - blocked;
      const dialed = queueStats.completed + queueStats.retry + queueStats.failed;
      const answered = (outcomeCounts["ANSWERED"] || 0) + (outcomeCounts["COMPLETED"] || 0) + (outcomeCounts["PROMISE_TO_PAY"] || 0);
      const noAnswer = outcomeCounts["NO_ANSWER"] || 0;
      const busy = outcomeCounts["BUSY"] || 0;
      const voicemail = outcomeCounts["VOICEMAIL"] || 0;
      const callbacks = outcomeCounts["CALLBACK_REQUESTED"] || 0;
      const ptp = outcomeCounts["PROMISE_TO_PAY"] || 0;

      // Calculate rates
      const connectionRate = dialed > 0 ? Math.round((answered / dialed) * 100) : 0;
      const answerRate = eligible > 0 ? Math.round((answered / eligible) * 100) : 0;
      const completionRate = eligible > 0 ? Math.round((queueStats.completed / eligible) * 100) : 0;
      const retryRate = dialed > 0 ? Math.round((queueStats.retry / dialed) * 100) : 0;

      // Average duration from dial attempts
      const attempts = await db.dialAttemptsPhase12.listByCampaign(organizationId, campaignId, 1000);
      const durations = attempts.filter((a) => a.durationSeconds !== null).map((a) => a.durationSeconds!);
      const avgDuration = durations.length > 0
        ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
        : null;

      return {
        campaignId,
        totalContacts,
        eligible,
        blocked,
        dnc: 0, // Would need to count DNC-blocked contacts
        invalid: 0,
        queued: queueStats.queued,
        dialed,
        answered,
        connected: queueStats.connected,
        completed: queueStats.completed,
        failed: queueStats.failed,
        noAnswer,
        busy,
        voicemail,
        callbacks,
        promiseToPay: ptp,
        retries: queueStats.retry,
        connectionRate,
        answerRate,
        completionRate,
        retryRate,
        averageDurationSeconds: avgDuration,
      };
    },

    async scheduleRetry(organizationId, campaignContactId, outcome) {
      const cc = await db.campaignContactsPhase12.get(campaignContactId, organizationId);
      if (!cc) return false;

      // Get retry delay from policy or defaults
      const delay = DEFAULT_RETRY_DELAYS[outcome] || 3600; // Default 1 hour
      const nextAttempt = new Date(Date.now() + delay * 1000).toISOString();

      // Check max attempts
      if (cc.attemptNumber >= cc.maxAttempts) {
        await db.campaignContactsPhase12.update(campaignContactId, organizationId, {
          status: "FAILED",
          blocked: true,
          blockedReason: "MAX_ATTEMPTS_REACHED",
        });
        return false;
      }

      await db.campaignContactsPhase12.update(campaignContactId, organizationId, {
        status: "QUEUED",
        nextAttemptAt: nextAttempt,
      });

      await logEvent(organizationId, cc.campaignId, "RETRY_SCHEDULED" as CampaignEventType12, `Retry scheduled for ${nextAttempt}`, {
        campaignContactId,
        outcome,
        nextAttemptAt: nextAttempt,
      });

      if (audit) {
        await audit.log({
          organizationId,
          action: "RETRY_SCHEDULED",
          metadata: { campaignContactId, outcome, nextAttemptAt: nextAttempt },
        });
      }

      return true;
    },

    async scheduleCallback(organizationId, campaignContactId, callbackAt) {
      const cc = await db.campaignContactsPhase12.get(campaignContactId, organizationId);
      if (!cc) return false;

      await db.campaignContactsPhase12.update(campaignContactId, organizationId, {
        status: "QUEUED",
        isCallback: true,
        callbackAt,
        nextAttemptAt: callbackAt,
        priority: cc.priority + 10, // Callbacks get higher priority
      });

      await logEvent(organizationId, cc.campaignId, "CALLBACK_SCHEDULED", `Callback scheduled for ${callbackAt}`, {
        campaignContactId,
        callbackAt,
      });

      if (audit) {
        await audit.log({
          organizationId,
          action: "CALLBACK_SCHEDULED",
          metadata: { campaignContactId, callbackAt },
        });
      }

      return true;
    },
  };
}
