/**
 * Telephony provider abstraction — provider-neutral contract.
 *
 * A TelephonyProvider is the only thing that knows how to speak to a specific PSTN/SIP vendor.
 * The gateway depends on this interface, never on Twilio, SignalWire or any other SDK.
 *
 * Provider lifecycle:
 *   TelephonyProvider
 *         ↓
 *   TelephonyGateway   (tenant isolation, idempotency, state machine, call→session mapping)
 *         ↓
 *   Voice Orchestrator  (existing — VoiceSession, messages, AI, analytics)
 *
 * Only one method mutates state: `handleProviderEvent`. Everything else is read or setup.
 */

import type { AgentLanguage, CallDirection, CallStatus } from "../../shared/contracts";

/**
 * Provider-neutral event emitted by every telephony vendor adapter.
 * The gateway consumes only this shape, never a raw vendor payload.
 */
export interface TelephonyEvent {
  /** Vendor-assigned unique event id. Drives idempotency — duplicate ids are rejected. */
  providerEventId: string;
  /** What happened at the provider. Mapped to CALL_STATUSES by the gateway. */
  eventType:
    | "call_created"
    | "call_ringing"
    | "call_answered"
    | "media_connected"
    | "call_completed"
    | "call_failed"
    | "call_cancelled";
  /** Provider-assigned call identifier. Used to find or create the Call row. */
  providerCallId: string;
  /** E.164 if available, otherwise null. */
  fromNumber: string | null;
  toNumber: string | null;
  /** Vendor-specific data stripped of secrets before reaching the gateway. */
  metadata: Record<string, string | number | boolean | null>;
  /** When the event actually occurred at the provider (ISO timestamp). */
  occurredAt: string;
}

export interface TelephonyProviderInfo {
  /** Stable vendor identifier (e.g. "demo", "twilio", "signalwire"). */
  id: string;
  /** Human label surfaced in the Studio. */
  label: string;
  /** True only for the in-process simulator — must NEVER handle a real PSTN call. */
  simulation: boolean;
  /** Vendor capabilities declared honestly. */
  capabilities: {
    inbound: boolean;
    outbound: boolean;
    mediaStreaming: boolean;
    recording: boolean;
  };
}

export interface TelephonyInitiateInput {
  organizationId: string;
  agentId: string;
  language: AgentLanguage;
  fromNumber: string | null;
  toNumber: string;
  /** Provider-neutral metadata — never carries credentials or internal IDs. */
  metadata?: Record<string, string | number | boolean | null>;
}

export interface TelephonyInitiateResult {
  /** The gateway-assigned Call id, not the provider's. */
  callId: string;
  /** Provider-assigned call id, used for subsequent events. */
  providerCallId: string;
  /** Status after initiation — normally "created" or "ringing". */
  status: CallStatus;
}

export interface TelephonyHangupResult {
  callId: string;
  status: CallStatus;
}

/**
 * The contract every vendor adapter implements.
 * Adding a new provider means writing one class that satisfies this interface — no route,
 * service or orchestrator change is needed.
 */
export interface TelephonyProvider {
  readonly info: TelephonyProviderInfo;
  /** True when this provider has valid credentials and can handle traffic. */
  available(): boolean;
  /**
   * Initiate an outbound call. The gateway calls this, not the API routes.
   * The provider returns the vendor-assigned call id for future event correlation.
   */
  initiate(input: TelephonyInitiateInput): Promise<TelephonyInitiateResult>;
  /**
   * Terminate a call. The provider translates this into the vendor's hangup mechanism.
   */
  hangup(providerCallId: string): Promise<TelephonyHangupResult>;
  /**
   * Validate a webhook signature. Returns true only when the payload is genuinely from this
   * provider. Demo providers always return true — they have no real signature to check.
   * Production providers MUST verify cryptographically.
   */
  verifyWebhookSignature(payload: string, headers: Record<string, string>): boolean;
}

/**
 * Webhook security context — injected by the gateway, not by the provider.
 * Each provider adapter tells the gateway how to verify; the gateway decides whether to trust.
 */
export interface WebhookVerificationResult {
  valid: boolean;
  reason?: string;
  /** Replay detected: this providerEventId was already processed. */
  replay: boolean;
}
