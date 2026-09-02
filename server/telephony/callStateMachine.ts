/**
 * Call lifecycle state machine — authoritative and provider-neutral.
 *
 * This is the ONLY place that decides whether a Call status transition is valid.
 * Neither the API controller, the gateway, nor the frontend may bypass it.
 *
 * States:  CREATED → RINGING → ANSWERED → ACTIVE → COMPLETED
 *                                ↓                      ↑
 *                              FAILED ←─────────────────┘
 *          CREATED → FAILED
 *          RINGING → FAILED | CANCELLED
 *          ANSWERED → FAILED
 *          ACTIVE → COMPLETED | FAILED
 *
 * Terminal: COMPLETED, FAILED, CANCELLED — these never transition again.
 */

import type { CallStatus } from "../../shared/contracts";
import { CALL_TERMINAL } from "../../shared/contracts";

export const CALL_STATES: readonly CallStatus[] = [
  "created",
  "ringing",
  "answered",
  "active",
  "completed",
  "failed",
  "cancelled",
] as const;

/**
 * The complete transition table.
 * Each key maps to the set of states it is allowed to transition TO.
 * Terminal states only allow self-transition (idempotent re-application).
 */
export const CALL_TRANSITIONS: Record<CallStatus, readonly CallStatus[]> = {
  created: ["ringing", "answered", "active", "failed", "cancelled"],
  ringing: ["answered", "active", "failed", "cancelled"],
  answered: ["active", "completed", "failed"],
  active: ["completed", "failed"],
  /** Terminal — no outgoing transitions except self (idempotent). */
  completed: ["completed"],
  failed: ["failed"],
  cancelled: ["cancelled"],
};

/** True when the state has reached a terminal condition. */
export function isCallTerminal(status: CallStatus): boolean {
  return CALL_TERMINAL.includes(status);
}

/**
 * Test whether a transition is legal. Self-transitions on terminal states are allowed
 * to support idempotent re-delivery of terminal events.
 */
export function canCallTransition(from: CallStatus, to: CallStatus): boolean {
  if (from === to) return true;
  return CALL_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Throws when the transition is illegal. This is the single enforcement point.
 */
export function assertCallTransition(from: CallStatus, to: CallStatus): void {
  if (!canCallTransition(from, to)) {
    throw new Error(
      `Invalid call lifecycle transition: ${from} → ${to}. ` +
      `Allowed: [${CALL_TRANSITIONS[from]?.join(", ")}]`
    );
  }
}

/**
 * Map a provider event type to the Call status it implies.
 * Provider-neutral: every adapter emits the same eventType vocabulary.
 */
export function eventToCallStatus(
  eventType: "call_created" | "call_ringing" | "call_answered" | "media_connected" | "call_completed" | "call_failed" | "call_cancelled"
): CallStatus {
  switch (eventType) {
    case "call_created":
      return "created";
    case "call_ringing":
      return "ringing";
    case "call_answered":
      return "answered";
    case "media_connected":
      return "active";
    case "call_completed":
      return "completed";
    case "call_failed":
      return "failed";
    case "call_cancelled":
      return "cancelled";
  }
}
