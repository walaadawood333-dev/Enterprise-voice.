/**
 * Provider Event Normalizer
 * 
 * Converts vendor-specific webhook events into CenterAI's standardized TelephonyEvent format.
 * This ensures the Telephony Gateway receives a consistent event structure regardless of provider.
 * 
 * Event Mapping:
 * PROVIDER_CALL_CREATED → call_created
 * PROVIDER_RINGING → call_ringing
 * PROVIDER_ANSWERED → call_answered
 * PROVIDER_MEDIA_CONNECTED → media_connected
 * PROVIDER_COMPLETED → call_completed
 * PROVIDER_FAILED → call_failed
 * PROVIDER_CANCELLED → call_cancelled
 */

import type { TelephonyEvent } from "../provider";

/**
 * Raw provider event before normalization.
 * This is the shape that arrives from the vendor's webhook.
 */
export interface RawProviderEvent {
  /** Vendor-assigned event ID (for idempotency) */
  eventId: string;
  /** Vendor-specific event type string */
  eventType: string;
  /** Vendor-assigned call ID */
  callId: string;
  /** Caller number (E.164 format) */
  from?: string;
  /** Callee number (E.164 format) */
  to?: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Additional vendor-specific data */
  metadata?: Record<string, unknown>;
}

/**
 * Normalize a raw provider event into CenterAI's TelephonyEvent format.
 * 
 * @param rawEvent - The raw event from the provider's webhook
 * @param providerId - The provider identifier (for logging)
 * @returns Normalized TelephonyEvent, or null if the event type is unrecognized
 * @throws Error if the event cannot be normalized (missing required fields)
 */
export function normalizeProviderEvent(
  rawEvent: RawProviderEvent,
  _providerId: string
): TelephonyEvent | null {
  // Validate required fields
  if (!rawEvent.eventId) throw new Error("Provider event is missing an event identifier.");
  if (!rawEvent.callId) throw new Error("Provider event is missing a call identifier.");
  if (!rawEvent.eventType) throw new Error("Provider event is missing an event type.");
  if (!rawEvent.timestamp) throw new Error("Provider event is missing a timestamp.");

  // Map provider-specific event types to CenterAI event types.
  const eventType = mapEventType(rawEvent.eventType, _providerId);
  if (!eventType) {
    console.warn("telephony_event_type_unrecognized");
    return null;
  }

  // Scrub sensitive data from metadata
  const scrubbedMetadata = scrubMetadata(rawEvent.metadata ?? {});

  return {
    providerEventId: rawEvent.eventId,
    providerCallId: rawEvent.callId,
    eventType,
    fromNumber: rawEvent.from ?? null,
    toNumber: rawEvent.to ?? null,
    occurredAt: rawEvent.timestamp,
    metadata: scrubbedMetadata,
  };
}

/**
 * Map vendor-specific event type strings to CenterAI event types.
 * 
 * This is the canonical mapping table. All providers must map their events to these types.
 */
function mapEventType(
  providerEventType: string,
  _providerId: string
): TelephonyEvent["eventType"] | null {
  // Normalize to lowercase for comparison
  const normalized = providerEventType.toLowerCase();

  // Standard event type mappings (provider-agnostic)
  const mappings: Record<string, TelephonyEvent["eventType"]> = {
    // Call initiation
    "call_created": "call_created",
    "initiated": "call_created",
    "created": "call_created",

    // Ringing
    "call_ringing": "call_ringing",
    "ringing": "call_ringing",

    // Answered
    "call_answered": "call_answered",
    "answered": "call_answered",
    "in-progress": "call_answered",

    // Media connected
    "media_connected": "media_connected",
    "connected": "media_connected",

    // Completed
    "call_completed": "call_completed",
    "completed": "call_completed",
    "hangup": "call_completed",

    // Failed
    "call_failed": "call_failed",
    "failed": "call_failed",
    "error": "call_failed",

    // Cancelled
    "call_cancelled": "call_cancelled",
    "cancelled": "call_cancelled",
    "canceled": "call_cancelled",
    "no-answer": "call_cancelled",
    "busy": "call_cancelled",
    "rejected": "call_cancelled",
  };

  const mapped = mappings[normalized];
  if (!mapped) {
    return null;
  }

  return mapped;
}

/**
 * Scrub sensitive data from event metadata.
 * Removes any fields that might contain secrets or PII.
 */
function scrubMetadata(
  metadata: Record<string, unknown>
): Record<string, string | number | boolean | null> {
  const scrubbed: Record<string, string | number | boolean | null> = {};

  // Fields to exclude (may contain secrets or PII)
  const excludedPatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /auth/i,
    /credential/i,
    /ssn/i,
    /credit.?card/i,
    /pin/i,
  ];

  for (const [key, value] of Object.entries(metadata)) {
    // Check if the key matches any excluded pattern
    const isExcluded = excludedPatterns.some((pattern) => pattern.test(key));
    if (isExcluded) {
      continue; // Skip this field
    }

    // Only allow safe value types
    if (value === null || value === undefined) {
      scrubbed[key] = null;
    } else if (typeof value === "string") {
      scrubbed[key] = value;
    } else if (typeof value === "number") {
      scrubbed[key] = value;
    } else if (typeof value === "boolean") {
      scrubbed[key] = value;
    } else {
      // Skip complex objects/arrays
      console.warn(`Skipping complex metadata field: ${key}`);
    }
  }

  return scrubbed;
}

/**
 * Batch normalize multiple events.
 * Returns only the events that were successfully normalized.
 */
export function normalizeProviderEvents(
  rawEvents: RawProviderEvent[],
  _providerId: string
): TelephonyEvent[] {
  const normalized: TelephonyEvent[] = [];

  for (const rawEvent of rawEvents) {
    try {
      const event = normalizeProviderEvent(rawEvent, _providerId);
      if (event) {
        normalized.push(event);
      }
    } catch {
      // Continue processing without logging provider payloads or identifiers.
      console.error("telephony_event_normalization_failed");
    }
  }

  return normalized;
}
