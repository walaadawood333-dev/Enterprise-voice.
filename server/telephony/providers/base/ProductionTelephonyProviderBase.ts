/**
 * Production Telephony Provider Base Class
 * 
 * Abstract base class for all production telephony provider adapters.
 * Provides common functionality for:
 * - Configuration validation
 * - Credential detection
 * - Health checks
 * - Event normalization
 * - Error handling
 * - Webhook verification
 * 
 * All vendor-specific providers (Twilio, SignalWire, etc.) must extend this class.
 */

import type { CallStatus } from "../../../../shared/contracts";
import type {
  TelephonyProvider,
  TelephonyProviderInfo,
  TelephonyEvent,
  TelephonyInitiateInput,
  TelephonyInitiateResult,
  TelephonyHangupResult,
} from "../../provider";
import type { ProviderHealthStatus, TelephonyCapabilities } from "../../../../shared/contracts";
import { normalizeProviderEvent, type RawProviderEvent } from "../eventNormalizer";
import { normalizeProviderError, type ProviderError } from "../errorNormalizer";

/**
 * Configuration required for a production provider.
 * Subclasses define their specific credential requirements.
 */
export interface ProductionProviderConfig {
  /** Provider identifier (e.g., "twilio", "signalwire") */
  providerId: string;
  /** Human-readable label */
  label: string;
  /** Whether this is a sandbox/test environment */
  isSandbox: boolean;
  /** API credentials (presence check only — never values) */
  credentials: {
    apiKeyPresent: boolean;
    apiSecretPresent: boolean;
    authTokenPresent: boolean;
  };
  /** Webhook configuration */
  webhook: {
    configured: boolean;
    secretPresent: boolean;
  };
  /** Media streaming configuration */
  media: {
    configured: boolean;
  };
  /** Declared capabilities */
  capabilities: TelephonyCapabilities;
}

/**
 * Health check result from a production provider.
 */
export interface ProviderHealthCheckResult {
  healthy: boolean;
  status: ProviderHealthStatus;
  latencyMs: number;
  detail: string;
  checkedAt: string;
}

/**
 * Abstract base class for production telephony providers.
 * 
 * Subclasses MUST implement:
 * - initiateCall() — outbound call initiation
 * - hangupCall() — call termination
 * - verifyWebhook() — webhook signature verification
 * - performHealthCheck() — provider-specific health probe
 * - getRequiredCredentials() — list of required credential env vars
 */
export abstract class ProductionTelephonyProviderBase implements TelephonyProvider {
  protected readonly config: ProductionProviderConfig;
  private _available: boolean = false;

  constructor(config: ProductionProviderConfig) {
    this.config = config;
  }

  /**
   * Provider identity and capabilities.
   */
  get info(): TelephonyProviderInfo {
    return {
      id: this.config.providerId,
      label: this.config.label,
      simulation: false, // Production providers are never simulation
      capabilities: this.config.capabilities,
    };
  }

  /**
   * Check if the provider is available (credentials configured, not disabled).
   */
  available(): boolean {
    return this._available;
  }

  /**
   * Initialize the provider (validate credentials, perform initial health check).
   * Called by the registry after registration.
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate required credentials are present
      const credCheck = this.validateCredentials();
      if (!credCheck.valid) {
        this._available = false;
        return { success: false, error: credCheck.error };
      }

      // Perform initial health check
      const health = await this.performHealthCheck();
      this._available = health.healthy;

      if (!health.healthy) {
        return { success: false, error: health.detail };
      }

      return { success: true };
    } catch (error) {
      this._available = false;
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  /**
   * Validate that required credentials are present.
   * Subclasses override to check provider-specific credentials.
   */
  protected validateCredentials(): { valid: boolean; error?: string } {
    if (!this.config.credentials.apiKeyPresent) {
      return { valid: false, error: "API key not configured" };
    }
    return { valid: true };
  }

  /**
   * Perform a provider-specific health check.
   * Subclasses MUST implement this to ping the provider's API.
   */
  protected abstract performHealthCheck(): Promise<ProviderHealthCheckResult>;

  /**
   * Initiate an outbound call.
   * Subclasses MUST implement this with vendor-specific API calls.
   */
  abstract initiate(input: TelephonyInitiateInput): Promise<TelephonyInitiateResult>;

  /**
   * Terminate a call.
   * Subclasses MUST implement this with vendor-specific API calls.
   */
  abstract hangup(providerCallId: string): Promise<TelephonyHangupResult>;

  /**
   * Verify webhook signature.
   * Subclasses MUST implement this with vendor-specific signature verification.
   */
  abstract verifyWebhookSignature(payload: string, headers: Record<string, string>): boolean;

  /**
   * Normalize a raw provider event into CenterAI's TelephonyEvent format.
   * This is the standard entry point for all webhook events.
   */
  protected normalizeEvent(rawEvent: RawProviderEvent): TelephonyEvent | null {
    try {
      return normalizeProviderEvent(rawEvent, this.config.providerId);
    } catch (error) {
      // Log but don't throw — invalid events should not crash the webhook handler
      console.warn(`[${this.config.providerId}] Failed to normalize event:`, error);
      return null;
    }
  }

  /**
   * Normalize a provider error into CenterAI's standardized error format.
   */
  protected normalizeError(error: unknown): ProviderError {
    return normalizeProviderError(error, this.config.providerId);
  }

  /**
   * Get the list of required environment variable names for this provider.
   * Subclasses override to declare their specific requirements.
   */
  getRequiredCredentials(): string[] {
    return ["TELEPHONY_API_KEY"];
  }

  /**
   * Get the provider's configuration (safe for logging — no secrets).
   */
  getConfiguration(): ProductionProviderConfig {
    return this.config;
  }

  /**
   * Check if this provider is running in sandbox mode.
   */
  isSandbox(): boolean {
    return this.config.isSandbox;
  }
}
