/**
 * SignalWire Production Telephony Provider
 * 
 * Implements the TelephonyProvider interface for SignalWire's REST API.
 * Supports inbound/outbound PSTN calls with webhook event handling.
 * 
 * Requirements:
 * - SIGNALWIRE_PROJECT_ID
 * - SIGNALWIRE_API_TOKEN
 * - SIGNALWIRE_WEBHOOK_SECRET
 * - SIGNALWIRE_SPACE_URL (e.g., https://your-space.signalwire.com)
 */

import type {
  TelephonyProvider,
  TelephonyProviderInfo,
  TelephonyEvent,
  TelephonyInitiateInput,
  TelephonyInitiateResult,
  TelephonyHangupResult,
} from "../provider";
import type { ServerEnv } from "../../config/env";
import type { Logger } from "../../lib/observability";
import { createHmac } from "crypto";

const normalizeSignalWireSpaceUrl = (value: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("SIGNALWIRE_SPACE_URL must be a valid HTTPS SignalWire space URL.");
  }
  const allowedHost = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.signalwire\.com$/i.test(parsed.hostname);
  if (
    parsed.protocol !== "https:" ||
    !allowedHost ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("SIGNALWIRE_SPACE_URL must be an HTTPS origin under signalwire.com.");
  }
  return parsed.origin;
};

export interface SignalWireConfig {
  projectId: string;
  apiToken: string;
  spaceUrl: string;
  webhookSecret: string;
  appUrl: string;
}

/**
 * SignalWire telephony provider implementation.
 * Integrates with SignalWire's REST API for PSTN calling.
 */
export class SignalWireProvider implements TelephonyProvider {
  private readonly config: SignalWireConfig;
  private readonly logger: Logger;
  private _available: boolean = false;

  readonly info: TelephonyProviderInfo = {
    id: "signalwire",
    label: "SignalWire (Production PSTN)",
    simulation: false,
    capabilities: {
      inbound: true,
      outbound: true,
      mediaStreaming: false, // Phase 13 does not implement media streaming
      recording: false, // Phase 13 does not implement recording
    },
  };

  constructor(env: ServerEnv, logger: Logger) {
    // Extract SignalWire configuration from ServerEnv (which reads from process.env)
    // Note: In production, these would be set in process.env and read by resolveEnv
    const projectId = process.env.SIGNALWIRE_PROJECT_ID || "";
    const apiToken = process.env.SIGNALWIRE_API_TOKEN || "";
    const spaceUrl = process.env.SIGNALWIRE_SPACE_URL || "";
    const webhookSecret = process.env.SIGNALWIRE_WEBHOOK_SECRET || "";

    if (!projectId || !apiToken || !spaceUrl || !webhookSecret) {
      throw new Error(
        "SignalWire provider requires SIGNALWIRE_PROJECT_ID, SIGNALWIRE_API_TOKEN, SIGNALWIRE_SPACE_URL, and SIGNALWIRE_WEBHOOK_SECRET"
      );
    }

    this.config = {
      projectId,
      apiToken,
      spaceUrl: normalizeSignalWireSpaceUrl(spaceUrl),
      webhookSecret,
      appUrl: env.appUrl,
    };
    this.logger = logger;
  }

  /**
   * Check if the provider is available (credentials configured and validated).
   */
  available(): boolean {
    return this._available;
  }

  /**
   * Initialize the provider by validating credentials with a test API call.
   */
  async initialize(): Promise<boolean> {
    try {
      // Test credentials by fetching account info
      const response = await fetch(
        `${this.config.spaceUrl}/api/relay/rest/accounts/${encodeURIComponent(this.config.projectId)}`,
        {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.projectId}:${this.config.apiToken}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        this._available = true;
        this.logger.info("signalwire_provider_initialized", { available: true });
        return true;
      } else {
        this._available = false;
        this.logger.error("signalwire_initialization_failed", {
          status: response.status,
          statusText: response.statusText,
        });
        return false;
      }
    } catch {
      this._available = false;
      this.logger.error("signalwire_initialization_error", { reason: "provider_request_failed" });
      return false;
    }
  }

  /**
   * Initiate an outbound call via SignalWire REST API.
   */
  async initiate(input: TelephonyInitiateInput): Promise<TelephonyInitiateResult> {
    if (!this._available) {
      throw new Error("SignalWire provider is not available");
    }

    const callPayload = {
      from: input.fromNumber || "+15551234567", // Default number if not provided
      to: input.toNumber,
      // SignalWire uses LaML (compatible with TwiML) for call control
      // For Phase 13, we'll use a simple voice URL that returns basic instructions
      // In production, this would point to a webhook endpoint that returns LaML
      voice_url: new URL("/api/telephony/signalwire/laml", this.config.appUrl).toString(),
      voice_method: "POST",
      // Webhook for call events
      status_callback: new URL("/api/telephony/signalwire/webhook", this.config.appUrl).toString(),
      status_callback_method: "POST",
      // Pass organization and call metadata
      status_callback_event: ["started", "ringing", "answered", "completed"],
      // Custom parameters to track the call
      custom_parameters: JSON.stringify({
        organizationId: input.organizationId,
        agentId: input.agentId,
        language: input.language,
      }),
    };

    try {
      const response = await fetch(`${this.config.spaceUrl}/api/relay/rest/calls`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.projectId}:${this.config.apiToken}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(callPayload),
      });

      if (!response.ok) {
        this.logger.error("signalwire_call_request_rejected", { status: response.status });
        throw new Error("SignalWire call request failed.");
      }

      const result = await response.json() as { id?: unknown };
      if (typeof result.id !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(result.id)) {
        throw new Error("SignalWire returned an invalid call identifier.");
      }

      this.logger.info("signalwire_call_initiated", {
        organizationId: input.organizationId,
        providerCallId: result.id,
      });

      return {
        callId: "", // Will be set by the gateway
        providerCallId: result.id,
        status: "created",
      };
    } catch {
      this.logger.error("signalwire_call_initiation_failed", {
        organizationId: input.organizationId,
        reason: "provider_request_failed",
      });
      throw new Error("Telephony provider request failed.");
    }
  }

  /**
   * Hang up an active call via SignalWire REST API.
   */
  async hangup(providerCallId: string): Promise<TelephonyHangupResult> {
    if (!this._available) {
      throw new Error("SignalWire provider is not available");
    }
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(providerCallId)) {
      throw new Error("Invalid provider call identifier.");
    }

    try {
      const response = await fetch(
        `${this.config.spaceUrl}/api/relay/rest/calls/${encodeURIComponent(providerCallId)}`,
        {
        method: "DELETE",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.projectId}:${this.config.apiToken}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok && response.status !== 404) {
        this.logger.error("signalwire_hangup_request_rejected", { status: response.status });
        throw new Error("SignalWire hangup request failed.");
      }

      this.logger.info("signalwire_call_ended", {
        providerCallId,
      });

      return {
        callId: "", // Will be set by the gateway
        status: "completed",
      };
    } catch {
      this.logger.error("signalwire_hangup_failed", {
        providerCallId,
        reason: "provider_request_failed",
      });
      throw new Error("Telephony provider request failed.");
    }
  }

  /**
   * Verify webhook signature using SignalWire's HMAC-SHA256 signature.
   * 
   * SignalWire signs webhooks with the webhook secret. The signature is in the
   * X-SignalWire-Signature header.
   */
  verifyWebhookSignature(payload: string, headers: Record<string, string>): boolean {
    const signature = headers["x-signalwire-signature"];
    if (!signature) {
      this.logger.warn("signalwire_webhook_missing_signature");
      return false;
    }

    try {
      // Compute HMAC-SHA256 of the payload
      const hmac = createHmac("sha256", this.config.webhookSecret);
      hmac.update(payload);
      const computedSignature = hmac.digest("hex");

      // Compare signatures (constant-time comparison to prevent timing attacks)
      const isValid = this.timingSafeEqual(computedSignature, signature);

      if (!isValid) this.logger.warn("signalwire_webhook_invalid_signature");

      return isValid;
    } catch {
      this.logger.error("signalwire_webhook_verification_error", { reason: "verification_failed" });
      return false;
    }
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Normalize a SignalWire webhook event into a TelephonyEvent.
   * 
   * SignalWire webhook payload structure:
   * {
   *   "event_type": "call.started" | "call.ringing" | "call.answered" | "call.completed",
   *   "payload": {
   *     "id": "call_id",
   *     "direction": "inbound" | "outbound",
   *     "from": "+15551234567",
   *     "to": "+15559876543",
   *     "status": "started" | "ringing" | "answered" | "completed",
   *     "duration": 30,
   *     ...
   *   }
   * }
   */
  normalizeWebhookEvent(webhookPayload: any): TelephonyEvent | null {
    try {
      const eventType = webhookPayload.event_type;
      const payload = webhookPayload.payload;

      if (
        typeof eventType !== "string" ||
        !payload ||
        typeof payload !== "object" ||
        typeof payload.id !== "string" ||
        !/^[A-Za-z0-9_.:-]{1,128}$/.test(payload.id)
      ) {
        this.logger.warn("signalwire_webhook_invalid_structure");
        return null;
      }

      // Map SignalWire event types to TelephonyEvent types
      let telephonyEventType: TelephonyEvent["eventType"];
      switch (eventType) {
        case "call.started":
          telephonyEventType = "call_created";
          break;
        case "call.ringing":
          telephonyEventType = "call_ringing";
          break;
        case "call.answered":
          telephonyEventType = "call_answered";
          break;
        case "call.completed":
          telephonyEventType = "call_completed";
          break;
        default:
          this.logger.warn("signalwire_webhook_unknown_event_type");
          return null;
      }

      // Extract custom parameters (organizationId, agentId, etc.)
      const metadata: Record<string, string | number | boolean | null> = {};
      if (typeof payload.custom_parameters === "string" && payload.custom_parameters.length <= 4_000) {
        try {
          const custom = JSON.parse(payload.custom_parameters) as Record<string, unknown>;
          if (typeof custom.organizationId === "string" && /^[A-Za-z0-9_.:-]{4,64}$/.test(custom.organizationId)) {
            metadata.organizationId = custom.organizationId;
          }
          if (typeof custom.agentId === "string" && /^[A-Za-z0-9_.:-]{4,64}$/.test(custom.agentId)) {
            metadata.agentId = custom.agentId;
          }
          if (custom.language === "en" || custom.language === "ar" || custom.language === "jo") {
            metadata.language = custom.language;
          }
        } catch {
          this.logger.warn("signalwire_webhook_invalid_custom_parameters");
        }
      }

      if (typeof payload.duration === "number" && Number.isFinite(payload.duration)) {
        metadata.duration = Math.min(86_400, Math.max(0, Math.trunc(payload.duration)));
      }
      if (payload.direction === "inbound" || payload.direction === "outbound") {
        metadata.direction = payload.direction;
      }

      const telephonyEvent: TelephonyEvent = {
        providerEventId: payload.id,
        eventType: telephonyEventType,
        providerCallId: payload.id,
        fromNumber: typeof payload.from === "string" && /^\+?[0-9]{6,20}$/.test(payload.from) ? payload.from : null,
        toNumber: typeof payload.to === "string" && /^\+?[0-9]{6,20}$/.test(payload.to) ? payload.to : null,
        metadata,
        occurredAt: new Date().toISOString(),
      };

      this.logger.debug("signalwire_webhook_normalized", { eventType: telephonyEvent.eventType });
      return telephonyEvent;
    } catch {
      this.logger.error("signalwire_webhook_normalization_error", { reason: "invalid_provider_payload" });
      return null;
    }
  }
}
