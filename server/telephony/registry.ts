/**
 * Production Provider Registry — manages provider lifecycle states.
 *
 * States:
 *   REGISTERED   — adapter class is known, not yet validated
 *   CONFIGURED   — credentials exist and validate
 *   ACTIVE       — ready to handle traffic
 *   DEGRADED     — partially functional (e.g. health check failing)
 *   UNAVAILABLE  — cannot handle traffic (network down, credentials expired)
 *   DISABLED     — administratively turned off
 *
 * The registry is the single source of truth for "can this provider take a call?"
 * The gateway consults it before routing. The Studio reads it for display.
 *
 * No provider-specific logic lives here — it operates on the TelephonyProvider interface.
 */

import type {
  ProviderHealthStatus,
  ProviderRegistryState,
  TelephonyCapabilities,
} from "../../shared/contracts";

import type { TelephonyProvider } from "./provider";

export interface RegistryEntry {
  provider: TelephonyProvider;
  state: ProviderRegistryState;
  health: ProviderHealthStatus;
  enabled: boolean;
  isDefault: boolean;
  credentialsConfigured: boolean;
  webhookConfigured: boolean;
  lastHealthCheck: string | null;
  healthCheckError: string | null;
  registeredAt: string;
  activatedAt: string | null;
}

/** Safe summary exposed to the Studio — never contains secrets. */
export interface RegistryEntryDto {
  providerId: string;
  providerName: string;
  label: string;
  simulation: boolean;
  transport: "pstn" | "sip" | "webrtc" | "gsm" | "simulation";
  state: ProviderRegistryState;
  health: ProviderHealthStatus;
  capabilities: TelephonyCapabilities;
  credentialsConfigured: boolean;
  webhookConfigured: boolean;
  enabled: boolean;
  isDefault: boolean;
  lastHealthCheck: string | null;
}

export interface ProviderRegistrationInput {
  provider: TelephonyProvider;
  credentialsConfigured?: boolean;
  webhookConfigured?: boolean;
  enabled?: boolean;
  isDefault?: boolean;
  /** Transport type — derived from provider info or declared explicitly. */
  transport?: "pstn" | "sip" | "webrtc" | "gsm" | "simulation";
}

export function createProviderRegistry() {
  const entries = new Map<string, RegistryEntry>();

  /** Determine initial registry state based on configuration. */
  const determineInitialState = (input: ProviderRegistrationInput): ProviderRegistryState => {
    if (input.enabled === false) return "disabled";
    if (input.provider.info.simulation) return "active";
    if (!input.credentialsConfigured) return "registered";
    return "configured";
  };

  /** Derive transport type from provider info. */
  const deriveTransport = (
    provider: TelephonyProvider,
    explicit?: "pstn" | "sip" | "webrtc" | "gsm" | "simulation"
  ): "pstn" | "sip" | "webrtc" | "gsm" | "simulation" => {
    if (explicit) return explicit;
    if (provider.info.simulation) return "simulation";
    // Default to pstn — the most common production case.
    // Future providers can declare their transport in their info.
    return "pstn";
  };

  return {
    /**
     * Register a provider adapter.
     * Returns the initial state. The provider is not yet ACTIVE — it must pass
     * configuration validation and (optionally) a health check first.
     */
    register(input: ProviderRegistrationInput): RegistryEntryDto {
      const provider = input.provider;
      const id = provider.info.id;

      if (entries.has(id)) {
        // Re-registration updates configuration but preserves state if already active.
        const existing = entries.get(id)!;
        existing.credentialsConfigured = input.credentialsConfigured ?? existing.credentialsConfigured;
        existing.webhookConfigured = input.webhookConfigured ?? existing.webhookConfigured;
        if (input.enabled !== undefined) existing.enabled = input.enabled;
        if (input.isDefault !== undefined) {
          existing.isDefault = input.isDefault;
          // Only one default at a time.
          if (input.isDefault) {
            for (const [key, entry] of entries) {
              if (key !== id) entry.isDefault = false;
            }
          }
        }
        return toDto(existing);
      }

      const entry: RegistryEntry = {
        provider,
        state: determineInitialState(input),
        health: "unknown",
        enabled: input.enabled !== false,
        isDefault: input.isDefault === true,
        credentialsConfigured: input.credentialsConfigured === true,
        webhookConfigured: input.webhookConfigured === true,
        lastHealthCheck: null,
        healthCheckError: null,
        registeredAt: new Date().toISOString(),
        activatedAt: null,
      };

      // Enforce single default.
      if (entry.isDefault) {
        for (const [, e] of entries) e.isDefault = false;
      }

      entries.set(id, entry);
      return toDto(entry);
    },

    /** Unregister a provider. Cannot remove an ACTIVE provider handling traffic. */
    unregister(providerId: string): boolean {
      const entry = entries.get(providerId);
      if (!entry) return false;
      if (entry.state === "active") return false; // Safety: don't remove live provider
      entries.delete(providerId);
      return true;
    },

    /** Mark a provider as configured and ready for activation. */
    configure(providerId: string, credentialsConfigured: boolean, webhookConfigured: boolean): boolean {
      const entry = entries.get(providerId);
      if (!entry) return false;
      entry.credentialsConfigured = credentialsConfigured;
      entry.webhookConfigured = webhookConfigured;
      // If credentials are now configured and the provider is in a non-active pre-state,
      // transition to configured.
      if (credentialsConfigured && (entry.state === "registered" || entry.state === "disabled")) {
        entry.state = entry.enabled ? "configured" : "disabled";
      }
      return true;
    },

    /** Activate a provider — only if configured and enabled. */
    activate(providerId: string): boolean {
      const entry = entries.get(providerId);
      if (!entry) return false;
      if (!entry.enabled) return false;
      if (entry.state === "disabled") return false;
      // Simulation providers are always activatable.
      // Production providers need credentials.
      if (!entry.provider.info.simulation && !entry.credentialsConfigured) return false;
      entry.state = "active";
      entry.health = "healthy";
      entry.activatedAt = new Date().toISOString();
      return true;
    },

    /** Deactivate a provider (e.g. credentials revoked, provider failing). */
    deactivate(providerId: string, reason: "disabled" | "unavailable" | "degraded" = "unavailable"): boolean {
      const entry = entries.get(providerId);
      if (!entry) return false;
      entry.state = reason === "disabled" ? "disabled" : reason === "degraded" ? "degraded" : "unavailable";
      entry.health = reason === "disabled" ? "disabled" : reason === "degraded" ? "degraded" : "unavailable";
      return true;
    },

    /** Administrative enable/disable. */
    setEnabled(providerId: string, enabled: boolean): boolean {
      const entry = entries.get(providerId);
      if (!entry) return false;
      entry.enabled = enabled;
      if (!enabled) {
        entry.state = "disabled";
        entry.health = "disabled";
      } else if (entry.state === "disabled") {
        entry.state = entry.credentialsConfigured || entry.provider.info.simulation ? "configured" : "registered";
        entry.health = "unknown";
      }
      return true;
    },

    /** Set as the default provider. Only one default at a time. */
    setDefault(providerId: string): boolean {
      const entry = entries.get(providerId);
      if (!entry) return false;
      for (const [key, e] of entries) {
        e.isDefault = key === providerId;
      }
      entry.isDefault = true;
      return true;
    },

    /** Record a health check result. */
    recordHealthCheck(providerId: string, health: ProviderHealthStatus, error?: string): boolean {
      const entry = entries.get(providerId);
      if (!entry) return false;
      entry.health = health;
      entry.lastHealthCheck = new Date().toISOString();
      entry.healthCheckError = error ?? null;
      // Auto-adjust state based on health.
      if (health === "unavailable" && entry.state === "active") {
        entry.state = "degraded";
      }
      if (health === "healthy" && entry.state === "degraded") {
        entry.state = "active";
      }
      return true;
    },

    /** Get the current default active provider. */
    getDefaultActive(): TelephonyProvider | null {
      for (const [, entry] of entries) {
        if (entry.isDefault && entry.state === "active" && entry.enabled) {
          return entry.provider;
        }
      }
      // Fall back to any active provider.
      for (const [, entry] of entries) {
        if (entry.state === "active" && entry.enabled) {
          return entry.provider;
        }
      }
      return null;
    },

    /** Find a provider by id. */
    get(providerId: string): RegistryEntry | undefined {
      return entries.get(providerId);
    },

    /** Get a provider's adapter by id (convenience). */
    getProvider(providerId: string): TelephonyProvider | undefined {
      return entries.get(providerId)?.provider;
    },

    /** List all registered providers. */
    list(): RegistryEntryDto[] {
      return [...entries.values()].map(toDto);
    },

    /** List only active providers. */
    listActive(): TelephonyProvider[] {
      return [...entries.values()]
        .filter((e) => e.state === "active" && e.enabled)
        .map((e) => e.provider);
    },

    /** List providers that support a specific capability. */
    listByCapability(capability: keyof TelephonyCapabilities): TelephonyProvider[] {
      return [...entries.values()]
        .filter((e) => {
          if (e.state !== "active" || !e.enabled) return false;
          const caps = getCapabilities(e.provider);
          return caps[capability] === true;
        })
        .map((e) => e.provider);
    },

    /** Check if any production (non-simulation) provider is available. */
    hasProductionProvider(): boolean {
      for (const [, entry] of entries) {
        if (entry.state === "active" && entry.enabled && !entry.provider.info.simulation) {
          return true;
        }
      }
      return false;
    },

    /** Reset the registry (test helper). */
    reset(): void {
      entries.clear();
    },

    /** Count of registered providers. */
    get size(): number {
      return entries.size;
    },
  };
}

/** Extract full capabilities from a provider, merging legacy and new fields. */
export function getCapabilities(provider: TelephonyProvider): TelephonyCapabilities {
  const info = provider.info;
  return {
    inbound: info.capabilities.inbound,
    outbound: info.capabilities.outbound,
    pstn: !info.simulation, // Simulation providers are not PSTN
    sip: false, // Not yet declared by any provider — default false
    webrtc: false, // Not yet declared
    mediaStreaming: info.capabilities.mediaStreaming,
    webhooks: true, // All providers support webhooks (demo trivially)
    recording: info.capabilities.recording,
    simulation: info.simulation,
  };
}

/** Convert a registry entry to a safe DTO. */
function toDto(entry: RegistryEntry): RegistryEntryDto {
  const caps = getCapabilities(entry.provider);
  const transport = entry.provider.info.simulation
    ? "simulation"
    : "pstn"; // Default; future providers can override
  return {
    providerId: entry.provider.info.id,
    providerName: entry.provider.info.id,
    label: entry.provider.info.label,
    simulation: entry.provider.info.simulation,
    transport,
    state: entry.state,
    health: entry.health,
    capabilities: caps,
    credentialsConfigured: entry.credentialsConfigured,
    webhookConfigured: entry.webhookConfigured,
    enabled: entry.enabled,
    isDefault: entry.isDefault,
    lastHealthCheck: entry.lastHealthCheck,
  };
}

export type ProviderRegistry = ReturnType<typeof createProviderRegistry>;
