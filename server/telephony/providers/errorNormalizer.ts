/**
 * Provider Error Normalizer
 * 
 * Converts vendor-specific errors into CenterAI's standardized error format.
 * This ensures consistent error handling and reporting across all providers.
 * 
 * Error Categories:
 * - TELEPHONY_AUTH_FAILED — Authentication/authorization failure
 * - TELEPHONY_CONFIGURATION_INVALID — Missing or invalid configuration
 * - TELEPHONY_PROVIDER_UNAVAILABLE — Provider API unreachable
 * - TELEPHONY_RATE_LIMITED — Rate limit exceeded
 * - TELEPHONY_CALL_REJECTED — Call rejected by provider or recipient
 * - TELEPHONY_DESTINATION_INVALID — Invalid phone number or destination
 * - TELEPHONY_CAPABILITY_NOT_SUPPORTED — Requested capability not available
 * - TELEPHONY_WEBHOOK_INVALID — Webhook signature verification failed
 * - TELEPHONY_MEDIA_CONNECTION_FAILED — Media stream connection failed
 * - TELEPHONY_TIMEOUT — Operation timed out
 * - TELEPHONY_UNKNOWN — Unknown error
 */

/**
 * Standardized provider error codes.
 * These are provider-agnostic and used throughout CenterAI.
 */
export type ProviderErrorCode =
  | "TELEPHONY_AUTH_FAILED"
  | "TELEPHONY_CONFIGURATION_INVALID"
  | "TELEPHONY_PROVIDER_UNAVAILABLE"
  | "TELEPHONY_RATE_LIMITED"
  | "TELEPHONY_CALL_REJECTED"
  | "TELEPHONY_DESTINATION_INVALID"
  | "TELEPHONY_CAPABILITY_NOT_SUPPORTED"
  | "TELEPHONY_WEBHOOK_INVALID"
  | "TELEPHONY_MEDIA_CONNECTION_FAILED"
  | "TELEPHONY_TIMEOUT"
  | "TELEPHONY_UNKNOWN";

/**
 * Normalized provider error.
 * Safe for logging and returning to the frontend (no secrets).
 */
export interface ProviderError {
  /** Standardized error code */
  code: ProviderErrorCode;
  /** Human-readable error message */
  message: string;
  /** Provider identifier */
  providerId: string;
  /** Original error (for debugging — never exposed to frontend) */
  originalError?: unknown;
  /** Additional context (safe for logging) */
  context?: Record<string, string | number | boolean>;
  /** Timestamp */
  timestamp: string;
}

/**
 * Normalize an unknown error into a standardized ProviderError.
 * 
 * @param error - The error to normalize (could be Error, string, or unknown object)
 * @param providerId - The provider identifier
 * @returns Normalized ProviderError
 */
export function normalizeProviderError(
  error: unknown,
  providerId: string
): ProviderError {
  const timestamp = new Date().toISOString();

  // Handle null/undefined
  if (error === null || error === undefined) {
    return {
      code: "TELEPHONY_UNKNOWN",
      message: "Unknown error occurred",
      providerId,
      timestamp,
    };
  }

  // Handle Error objects
  if (error instanceof Error) {
    const code = mapErrorToCode(error);
    return {
      code,
      message: error.message || "Provider error occurred",
      providerId,
      originalError: error,
      timestamp,
    };
  }

  // Handle string errors
  if (typeof error === "string") {
    const code = mapStringErrorToCode(error);
    return {
      code,
      message: error,
      providerId,
      timestamp,
    };
  }

  // Handle object errors (e.g., API responses)
  if (typeof error === "object") {
    const errObj = error as Record<string, unknown>;
    const message = extractErrorMessage(errObj);
    const code = mapObjectErrorToCode(errObj);
    return {
      code,
      message,
      providerId,
      originalError: error,
      context: extractSafeContext(errObj),
      timestamp,
    };
  }

  // Fallback
  return {
    code: "TELEPHONY_UNKNOWN",
    message: "Unknown error type",
    providerId,
    originalError: error,
    timestamp,
  };
}

/**
 * Map an Error object to a ProviderErrorCode.
 */
function mapErrorToCode(error: Error): ProviderErrorCode {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Timeout errors
  if (message.includes("timeout") || name.includes("timeout")) {
    return "TELEPHONY_TIMEOUT";
  }

  // Authentication errors
  if (
    message.includes("auth") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("401") ||
    message.includes("403")
  ) {
    return "TELEPHONY_AUTH_FAILED";
  }

  // Rate limit errors
  if (message.includes("rate limit") || message.includes("429") || message.includes("too many")) {
    return "TELEPHONY_RATE_LIMITED";
  }

  // Network/unavailable errors
  if (
    message.includes("network") ||
    message.includes("unavailable") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("econnrefused") ||
    message.includes("enotfound")
  ) {
    return "TELEPHONY_PROVIDER_UNAVAILABLE";
  }

  // Invalid destination
  if (
    message.includes("invalid") &&
    (message.includes("number") || message.includes("destination") || message.includes("phone"))
  ) {
    return "TELEPHONY_DESTINATION_INVALID";
  }

  // Capability not supported
  if (message.includes("not supported") || message.includes("capability")) {
    return "TELEPHONY_CAPABILITY_NOT_SUPPORTED";
  }

  // Call rejected
  if (
    message.includes("rejected") ||
    message.includes("busy") ||
    message.includes("no answer") ||
    message.includes("cancelled")
  ) {
    return "TELEPHONY_CALL_REJECTED";
  }

  // Media connection
  if (message.includes("media") || message.includes("stream") || message.includes("websocket")) {
    return "TELEPHONY_MEDIA_CONNECTION_FAILED";
  }

  // Configuration
  if (message.includes("config") || message.includes("credential")) {
    return "TELEPHONY_CONFIGURATION_INVALID";
  }

  return "TELEPHONY_UNKNOWN";
}

/**
 * Map a string error to a ProviderErrorCode.
 */
function mapStringErrorToCode(error: string): ProviderErrorCode {
  const lower = error.toLowerCase();
  return mapErrorToCode(new Error(lower));
}

/**
 * Map an object error (e.g., API response) to a ProviderErrorCode.
 */
function mapObjectErrorToCode(error: Record<string, unknown>): ProviderErrorCode {
  // Check for status code
  const status = error.status || error.statusCode || error.code;
  if (status) {
    const statusNum = typeof status === "number" ? status : parseInt(String(status), 10);
    if (statusNum === 401 || statusNum === 403) return "TELEPHONY_AUTH_FAILED";
    if (statusNum === 429) return "TELEPHONY_RATE_LIMITED";
    if (statusNum >= 500) return "TELEPHONY_PROVIDER_UNAVAILABLE";
  }

  // Check for error message
  const message = extractErrorMessage(error);
  return mapStringErrorToCode(message);
}

/**
 * Extract a human-readable error message from an error object.
 */
function extractErrorMessage(error: Record<string, unknown>): string {
  // Try common error message fields
  const messageFields = ["message", "error", "error_message", "errorMessage", "detail", "reason"];
  for (const field of messageFields) {
    const value = error[field];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  // Fallback
  return "Provider error occurred";
}

/**
 * Extract safe context from an error object (no secrets).
 */
function extractSafeContext(
  error: Record<string, unknown>
): Record<string, string | number | boolean> {
  const context: Record<string, string | number | boolean> = {};

  // Safe fields to include
  const safeFields = [
    "status",
    "statusCode",
    "code",
    "errorCode",
    "requestId",
    "traceId",
    "timestamp",
  ];

  for (const field of safeFields) {
    const value = error[field];
    if (value !== undefined && value !== null) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        context[field] = value;
      }
    }
  }

  return context;
}

/**
 * Create a ProviderError from a specific code and message.
 * Useful for throwing standardized errors.
 */
export function createProviderError(
  code: ProviderErrorCode,
  message: string,
  providerId: string,
  context?: Record<string, string | number | boolean>
): ProviderError {
  return {
    code,
    message,
    providerId,
    context,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if an error is retryable (temporary failure).
 */
export function isRetryableError(error: ProviderError): boolean {
  const retryableCodes: ProviderErrorCode[] = [
    "TELEPHONY_PROVIDER_UNAVAILABLE",
    "TELEPHONY_RATE_LIMITED",
    "TELEPHONY_TIMEOUT",
    "TELEPHONY_MEDIA_CONNECTION_FAILED",
  ];
  return retryableCodes.includes(error.code);
}

/**
 * Get a user-friendly error message for a ProviderError.
 * Safe to display to end users.
 */
export function getUserFriendlyMessage(error: ProviderError): string {
  const messages: Record<ProviderErrorCode, string> = {
    TELEPHONY_AUTH_FAILED: "Authentication failed. Please check your credentials.",
    TELEPHONY_CONFIGURATION_INVALID: "Provider configuration is invalid.",
    TELEPHONY_PROVIDER_UNAVAILABLE: "The telephony provider is currently unavailable.",
    TELEPHONY_RATE_LIMITED: "Rate limit exceeded. Please try again later.",
    TELEPHONY_CALL_REJECTED: "The call was rejected.",
    TELEPHONY_DESTINATION_INVALID: "The destination number is invalid.",
    TELEPHONY_CAPABILITY_NOT_SUPPORTED: "This capability is not supported by the provider.",
    TELEPHONY_WEBHOOK_INVALID: "Webhook verification failed.",
    TELEPHONY_MEDIA_CONNECTION_FAILED: "Failed to establish media connection.",
    TELEPHONY_TIMEOUT: "The operation timed out. Please try again.",
    TELEPHONY_UNKNOWN: "An unknown error occurred.",
  };

  return messages[error.code] || messages.TELEPHONY_UNKNOWN;
}
