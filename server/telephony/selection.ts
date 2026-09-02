/**
 * Provider Selection Policy.
 *
 * Determines which provider handles a given call.
 * Selection is deterministic and explicit — never silent fallback to demo in production.
 *
 * Priority:
 *   1. Explicit provider requested by the caller
 *   2. Organization's default provider (if configured)
 *   3. System's default provider
 *   4. No provider available (error)
 *
 * Safety rules:
 *   - Production mode NEVER silently routes to a simulation provider
 *   - Disabled or unavailable providers are skipped
 *   - Missing capability results in a clear error, not a silent substitute
 */

import type { AppMode, TelephonyCapabilities } from "../../shared/contracts";
import type { Logger } from "../lib/observability";
import type { TelephonyProvider } from "./provider";
import type { ProviderRegistry } from "./registry";
import { getCapabilities } from "./registry";

export interface ProviderSelectionInput {
  /** Explicitly requested provider id (e.g. from API request). */
  requestedProviderId?: string;
  /** Organization's configured default provider id. */
  organizationDefaultProviderId?: string;
  /** Required capability — if set, the selected provider must support it. */
  requiredCapability?: keyof TelephonyCapabilities;
  /** Call direction — may influence selection in the future. */
  direction?: "inbound" | "outbound";
  /** Application mode. */
  appMode: AppMode;
}

export interface ProviderSelectionOutcome {
  provider: TelephonyProvider | null;
  providerId: string | null;
  reason: string;
  selectionMethod: "explicit" | "organization_default" | "system_default" | "none";
  selected: boolean;
}

/**
 * Select a provider based on policy.
 * Returns an outcome with the reason — never silently falls back.
 */
export function selectProvider(
  input: ProviderSelectionInput,
  registry: ProviderRegistry,
  logger: Logger
): ProviderSelectionOutcome {
  const { appMode, requestedProviderId, organizationDefaultProviderId, requiredCapability, direction } = input;

  // 1. Explicit provider requested.
  if (requestedProviderId) {
    const entry = registry.get(requestedProviderId);
    if (!entry) {
      logger.info("provider_selection_explicit_not_found", {
        requestedProviderId,
      });
      return {
        provider: null,
        providerId: null,
        reason: `Provider "${requestedProviderId}" is not registered.`,
        selectionMethod: "explicit",
        selected: false,
      };
    }
    if (!entry.enabled) {
      logger.info("provider_selection_explicit_disabled", {
        requestedProviderId,
      });
      return {
        provider: null,
        providerId: null,
        reason: `Provider "${requestedProviderId}" is disabled.`,
        selectionMethod: "explicit",
        selected: false,
      };
    }
    if (entry.state !== "active") {
      logger.info("provider_selection_explicit_inactive", {
        requestedProviderId,
        state: entry.state,
      });
      return {
        provider: null,
        providerId: null,
        reason: `Provider "${requestedProviderId}" is not active (state: ${entry.state}).`,
        selectionMethod: "explicit",
        selected: false,
      };
    }
    // Capability check.
    if (requiredCapability) {
      const caps = getCapabilities(entry.provider);
      if (!caps[requiredCapability]) {
        logger.info("provider_selection_capability_missing", {
          requestedProviderId,
          requiredCapability,
        });
        return {
          provider: null,
          providerId: null,
          reason: `Provider "${requestedProviderId}" does not support capability "${requiredCapability}".`,
          selectionMethod: "explicit",
          selected: false,
        };
      }
    }
    // Production mode: reject simulation providers for live calls.
    if (appMode === "production" && entry.provider.info.simulation) {
      logger.error("provider_selection_demo_rejected_in_production", {
        requestedProviderId,
      });
      return {
        provider: null,
        providerId: null,
        reason: "Demo provider cannot handle production calls. Configure a real PSTN/SIP provider.",
        selectionMethod: "explicit",
        selected: false,
      };
    }

    logger.info("provider_selection_explicit", {
      requestedProviderId,
      direction,
    });
    return {
      provider: entry.provider,
      providerId: entry.provider.info.id,
      reason: "Explicitly requested provider.",
      selectionMethod: "explicit",
      selected: true,
    };
  }

  // 2. Organization default provider.
  if (organizationDefaultProviderId) {
    const entry = registry.get(organizationDefaultProviderId);
    if (entry && entry.enabled && entry.state === "active") {
      if (appMode === "production" && entry.provider.info.simulation) {
        logger.warn("provider_selection_org_default_is_demo", {
          organizationDefaultProviderId,
        });
        // Don't silently use demo — fall through to system default.
      } else {
        logger.info("provider_selection_organization_default", {
          organizationDefaultProviderId,
          direction,
        });
        return {
          provider: entry.provider,
          providerId: entry.provider.info.id,
          reason: "Organization default provider.",
          selectionMethod: "organization_default",
          selected: true,
        };
      }
    }
  }

  // 3. System default provider.
  const defaultProvider = registry.getDefaultActive();
  if (defaultProvider) {
    // Production mode: never silently use simulation provider.
    if (appMode === "production" && defaultProvider.info.simulation) {
      logger.error("provider_selection_system_default_is_demo", {
        defaultProviderId: defaultProvider.info.id,
      });
      return {
        provider: null,
        providerId: null,
        reason: "No production telephony provider is configured. Demo provider cannot handle production calls.",
        selectionMethod: "system_default",
        selected: false,
      };
    }

    // Capability check on default.
    if (requiredCapability) {
      const caps = getCapabilities(defaultProvider);
      if (!caps[requiredCapability]) {
        logger.info("provider_selection_default_capability_missing", {
          defaultProviderId: defaultProvider.info.id,
          requiredCapability,
        });
        return {
          provider: null,
          providerId: null,
          reason: `Default provider "${defaultProvider.info.id}" does not support capability "${requiredCapability}".`,
          selectionMethod: "system_default",
          selected: false,
        };
      }
    }

    logger.info("provider_selection_system_default", {
      defaultProviderId: defaultProvider.info.id,
      direction,
    });
    return {
      provider: defaultProvider,
      providerId: defaultProvider.info.id,
      reason: "System default provider.",
      selectionMethod: "system_default",
      selected: true,
    };
  }

  // 4. No provider available.
  logger.error("provider_selection_none_available", {
    appMode,
    direction,
  });
  return {
    provider: null,
    providerId: null,
    reason: "No telephony provider is available.",
    selectionMethod: "none",
    selected: false,
  };
}
