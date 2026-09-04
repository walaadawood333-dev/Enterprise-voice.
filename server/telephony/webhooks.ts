/**
 * Webhook security — signature verification, replay protection, timestamp validation.
 *
 * In APP_MODE=demo, the DemoTelephonyProvider bypasses cryptographic verification
 * (there is no external sender to verify against). In APP_MODE=production, every
 * provider adapter MUST verify signatures cryptographically.
 *
 * This module enforces that policy — a production webhook from a provider that supports
 * signature verification can NEVER pass without a valid signature.
 */

import type { AppMode } from "../../shared/contracts";
import type { Logger } from "../lib/observability";
import type { TelephonyProvider, WebhookVerificationResult } from "./provider";

export interface WebhookContext {
  /** Raw request body as a string — passed to the provider for signature verification. */
  rawBody: string;
  /** HTTP headers from the webhook request. */
  headers: Record<string, string>;
  /** Application mode — demo allows unsigned, production requires verification. */
  appMode: AppMode;
}

/**
 * Verify a webhook against the registered provider.
 * Returns a structured result indicating whether the webhook should be processed.
 *
 * Security rules:
 *   1. Demo mode + simulation provider → always valid (no external sender exists)
 *   2. Production mode + simulation provider → REJECTED (demo provider is not a PSTN provider)
 *   3. Production mode + real provider without valid signature → REJECTED
 *   4. Replay detection is always enforced (providerEventId uniqueness)
 */
export function verifyWebhook(
  provider: TelephonyProvider,
  context: WebhookContext,
  logger: Logger,
  isReplay: boolean
): WebhookVerificationResult {
  // Rule 2: Never accept a simulation provider as a production telephony source.
  if (context.appMode === "production" && provider.info.simulation) {
    logger.error("webhook_rejected_simulation_in_production", {
      provider: provider.info.id,
      note: "Demo provider cannot process production telephony events.",
    });
    return {
      valid: false,
      reason: "Simulation providers are not accepted in production mode.",
      replay: false,
    };
  }

  // Rule 1: Demo mode + the internal simulation provider has no external signature. All real
  // providers are verified below, including replays — knowing an old event id must never become
  // an authentication bypass.
  if (!(context.appMode === "demo" && provider.info.simulation)) {
    const signatureValid = provider.verifyWebhookSignature(context.rawBody, context.headers);
    if (!signatureValid) {
      logger.error("webhook_signature_invalid", {
        provider: provider.info.id,
      });
      return {
        valid: false,
        reason: "Webhook signature verification failed.",
        replay: false,
      };
    }
  }

  // A correctly authenticated duplicate is handled idempotently by the gateway.
  if (isReplay) {
    logger.info("webhook_replay_detected", {
      provider: provider.info.id,
    });
    return { valid: true, replay: true };
  }

  return { valid: true, replay: false };
}

/**
 * Extract the timestamp from a webhook header.
 * Used for replay protection — events older than the tolerance are rejected.
 * Providers that don't include timestamps are flagged for review.
 */
export function extractTimestamp(headers: Record<string, string>, headerName = "x-webhook-timestamp"): number | null {
  const raw = headers[headerName] ?? headers[headerName.toLowerCase()] ?? null;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Validate that a webhook timestamp is within the acceptable replay window.
 * Default tolerance: 5 minutes. Events older than this are rejected in production.
 */
export function isTimestampFresh(
  timestampMs: number | null,
  toleranceMs: number = 5 * 60 * 1000
): boolean {
  if (timestampMs === null) return true;  // No timestamp → cannot validate, pass through
  const now = Date.now();
  const age = now - timestampMs;
  return age >= 0 && age <= toleranceMs;
}
