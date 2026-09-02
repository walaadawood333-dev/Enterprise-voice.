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

export interface SignalWireConfig {
  projectId: string;
  apiToken: string;
  spaceUrl: string;
  webhookSecret: string;
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
      spaceUrl: spaceUrl.replace(/\/$/, ""), // Remove trailing slash
      webhookSecret,
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
      const response = await fetch(`${this.config.spaceUrl}/api/relay/rest/accounts/${this.config.projectId}`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.projectId}:${this.config.apiToken}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        this._available = true;
        this.logger.info("signalwire_provider_initialized", {
          projectId: this.config.projectId,
          spaceUrl: this.config.spaceUrl,
        });
        return true;
      } else {
        this._available = false;
        this.logger.error("signalwire_initialization_failed", {
          status: response.status,
          statusText: response.statusText,
        });
        return false;
      }
    } catch (error) {
      this._available = false;
      this.logger.error("signalwire_initialization_error", {
        error: error instanceof Error ? error.message : String(error),
      });
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
      voice_url: `${process.env.APP_URL || "http://localhost:8787"}/api/telephony/signalwire/laml`,
      voice_method: "POST",
      // Webhook for call events
      status_callback: `${process.env.APP_URL || "http://localhost:8787"}/api/telephony/signalwire/webhook`,
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
        const errorText = await response.text();
        throw new Error(`SignalWire API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();

      this.logger.info("signalwire_call_initiated", {
        organizationId: input.organizationId,
        providerCallId: result.id,
        from: callPayload.from,
        to: callPayload.to,
      });

      return {
        callId: "", // Will be set by the gateway
        providerCallId: result.id,
        status: "created",
      };
    } catch (error) {
      this.logger.error("signalwire_call_initiation_failed", {
        organizationId: input.organizationId,
        to: input.toNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Hang up an active call via SignalWire REST API.
   */
  async hangup(providerCallId: string): Promise<TelephonyHangupResult> {
    if (!this._available) {
      throw new Error("SignalWire provider is not available");
    }

    try {
      const response = await fetch(`${this.config.spaceUrl}/api/relay/rest/calls/${providerCallId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.projectId}:${this.config.apiToken}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok && response.status !== 404) {
        // 404 means the call is already ended
        const errorText = await response.text();
        throw new Error(`SignalWire hangup error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      this.logger.info("signalwire_call_ended", {
        providerCallId,
      });

      return {
        callId: "", // Will be set by the gateway
        status: "completed",
      };
    } catch (error) {
      this.logger.error("signalwire_hangup_failed", {
        providerCallId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
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

      if (!isValid) {
        this.logger.warn("signalwire_webhook_invalid_signature", {
          computedSignature: computedSignature.substring(0, 8) + "...",
          providedSignature: signature.substring(0, 8) + "...",
        });
      }

      return isValid;
    } catch (error) {
      this.logger.error("signalwire_webhook_verification_error", {
        error: error instanceof Error ? error.message : String(error),
      });
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

      if (!eventType || !payload) {
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
          this.logger.warn("signalwire_webhook_unknown_event_type", { eventType });
          return null;
      }

      // Extract custom parameters (organizationId, agentId, etc.)
      let metadata: Record<string, string | number | boolean | null> = {};
      if (payload.custom_parameters) {
        try {
          metadata = JSON.parse(payload.custom_parameters);
        } catch (error) {
          this.logger.warn("signalwire_webhook_invalid_custom_parameters", {
            custom_parameters: payload.custom_parameters,
          });
        }
      }

      // Add call-specific metadata
      if (payload.duration !== undefined) {
        metadata.duration = payload.duration;
      }
      if (payload.direction) {
        metadata.direction = payload.direction;
      }

      const telephonyEvent: TelephonyEvent = {
        providerEventId: payload.id,
        eventType: telephonyEventType,
        providerCallId: payload.id,
        fromNumber: payload.from || null,
        toNumber: payload.to || null,
        metadata,
        occurredAt: new Date().toISOString(),
      };

      this.logger.debug("signalwire_webhook_normalized", {
        providerEventId: telephonyEvent.providerEventId,
        eventType: telephonyEvent.eventType,
        from: telephonyEvent.fromNumber,
        to: telephonyEvent.toNumber,
      });

      return telephonyEvent;
    } catch (error) {
      this.logger.error("signalwire_webhook_normalization_error", {
        error: error instanceof Error ? error.message : String(error),
        payload: webhookPayload,
      });
      return null;
    }
  }
}
