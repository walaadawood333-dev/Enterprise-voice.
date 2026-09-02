/**
 * DemoTelephonyProvider — in-process call simulator.
 *
 * This provider is the ONLY telephony adapter allowed in APP_MODE=demo.
 * It is clearly marked simulation: true, never handles real PSTN traffic,
 * and produces real Call + CallEvent rows with proper organization ownership.
 *
 * The demo provider bypasses webhook signature verification because there is
 * no external sender. In APP_MODE=production, this provider is REJECTED —
 * a real vendor adapter must be configured instead.
 */

import type { AgentLanguage } from "../../shared/contracts";
import type {
  TelephonyEvent,
  TelephonyHangupResult,
  TelephonyInitiateInput,
  TelephonyInitiateResult,
  TelephonyProvider,
  TelephonyProviderInfo,
} from "./provider";

let sequence = 0;
const nextId = (prefix: string): string => {
  sequence += 1;
  return `${prefix}_demo_${Date.now().toString(36)}_${sequence.toString(36)}`;
};

/**
 * Simulated call lifecycle. Each call generates events in the correct temporal order.
 * The caller controls when each step fires — this is a test harness, not a live call.
 */
export class DemoTelephonyProvider implements TelephonyProvider {
  readonly info: TelephonyProviderInfo = {
    id: "demo",
    label: "Demo Telephony (Simulation)",
    simulation: true,
    capabilities: {
      inbound: true,
      outbound: true,
      mediaStreaming: false,
      recording: false,
    },
  };

  /**
   * Always available — the demo provider has no external dependencies.
   * Note: the gateway still enforces APP_MODE restrictions on whether it can be used.
   */
  available(): boolean {
    return true;
  }

  /**
   * Simulate initiating an outbound call. Returns immediately with a provider call id.
   * No actual dialling occurs — this is purely a record-creation event.
   */
  async initiate(input: TelephonyInitiateInput): Promise<TelephonyInitiateResult> {
    const providerCallId = nextId("call");
    return {
      callId: "",  // Filled by the gateway
      providerCallId,
      status: "created",
    };
  }

  /**
   * Simulate hanging up. No real line to disconnect.
   */
  async hangup(providerCallId: string): Promise<TelephonyHangupResult> {
    return {
      callId: "",  // Filled by the gateway
      status: "completed",
    };
  }

  /**
   * Demo webhooks have no signature — always valid in demo mode.
   * Production mode refuses this provider before reaching this method.
   */
  verifyWebhookSignature(_payload: string, _headers: Record<string, string>): boolean {
    return true;
  }

  /**
   * Generate a full event sequence for a simulated inbound call.
   * Returns events in chronological order so the gateway can replay them.
   * Used by the demo console and integration tests.
   */
  generateInboundCallEvents(options?: {
    organizationId?: string;
    agentId?: string;
    language?: AgentLanguage;
    fromNumber?: string;
    toNumber?: string;
    failAt?: "ringing" | "answered" | "active";
  }): TelephonyEvent[] {
    const providerCallId = nextId("call");
    const baseTime = Date.now();
    const from = options?.fromNumber ?? "+15551234567";
    const to = options?.toNumber ?? "+15559876543";

    const events: TelephonyEvent[] = [
      {
        providerEventId: nextId("evt"),
        eventType: "call_created",
        providerCallId,
        fromNumber: from,
        toNumber: to,
        metadata: { simulated: true, direction: "inbound" },
        occurredAt: new Date(baseTime).toISOString(),
      },
      {
        providerEventId: nextId("evt"),
        eventType: "call_ringing",
        providerCallId,
        fromNumber: from,
        toNumber: to,
        metadata: { simulated: true },
        occurredAt: new Date(baseTime + 500).toISOString(),
      },
    ];

    if (options?.failAt === "ringing") {
      events.push({
        providerEventId: nextId("evt"),
        eventType: "call_failed",
        providerCallId,
        fromNumber: from,
        toNumber: to,
        metadata: { simulated: true, reason: "simulated_ring_failure" },
        occurredAt: new Date(baseTime + 3000).toISOString(),
      });
      return events;
    }

    events.push({
      providerEventId: nextId("evt"),
      eventType: "call_answered",
      providerCallId,
      fromNumber: from,
      toNumber: to,
      metadata: { simulated: true },
      occurredAt: new Date(baseTime + 2000).toISOString(),
    });

    if (options?.failAt === "answered") {
      events.push({
        providerEventId: nextId("evt"),
        eventType: "call_failed",
        providerCallId,
        fromNumber: from,
        toNumber: to,
        metadata: { simulated: true, reason: "simulated_answer_failure" },
        occurredAt: new Date(baseTime + 5000).toISOString(),
      });
      return events;
    }

    events.push({
      providerEventId: nextId("evt"),
      eventType: "media_connected",
      providerCallId,
      fromNumber: from,
      toNumber: to,
      metadata: { simulated: true },
      occurredAt: new Date(baseTime + 2100).toISOString(),
    });

    if (options?.failAt === "active") {
      events.push({
        providerEventId: nextId("evt"),
        eventType: "call_failed",
        providerCallId,
        fromNumber: from,
        toNumber: to,
        metadata: { simulated: true, reason: "simulated_active_failure" },
        occurredAt: new Date(baseTime + 10000).toISOString(),
      });
      return events;
    }

    events.push({
      providerEventId: nextId("evt"),
      eventType: "call_completed",
      providerCallId,
      fromNumber: from,
      toNumber: to,
      metadata: { simulated: true, durationSeconds: 30 },
      occurredAt: new Date(baseTime + 32000).toISOString(),
    });

    return events;
  }

  /**
   * Generate a full event sequence for a simulated outbound call.
   */
  generateOutboundCallEvents(options?: {
    fromNumber?: string;
    toNumber?: string;
  }): TelephonyEvent[] {
    const providerCallId = nextId("call");
    const baseTime = Date.now();
    const from = options?.fromNumber ?? "+15559876543";
    const to = options?.toNumber ?? "+15551234567";

    return [
      {
        providerEventId: nextId("evt"),
        eventType: "call_created",
        providerCallId,
        fromNumber: from,
        toNumber: to,
        metadata: { simulated: true, direction: "outbound" },
        occurredAt: new Date(baseTime).toISOString(),
      },
      {
        providerEventId: nextId("evt"),
        eventType: "call_ringing",
        providerCallId,
        fromNumber: from,
        toNumber: to,
        metadata: { simulated: true },
        occurredAt: new Date(baseTime + 1000).toISOString(),
      },
      {
        providerEventId: nextId("evt"),
        eventType: "call_answered",
        providerCallId,
        fromNumber: from,
        toNumber: to,
        metadata: { simulated: true },
        occurredAt: new Date(baseTime + 4000).toISOString(),
      },
      {
        providerEventId: nextId("evt"),
        eventType: "media_connected",
        providerCallId,
        fromNumber: from,
        toNumber: to,
        metadata: { simulated: true },
        occurredAt: new Date(baseTime + 4100).toISOString(),
      },
      {
        providerEventId: nextId("evt"),
        eventType: "call_completed",
        providerCallId,
        fromNumber: from,
        toNumber: to,
        metadata: { simulated: true, durationSeconds: 45 },
        occurredAt: new Date(baseTime + 49000).toISOString(),
      },
    ];
  }
}
