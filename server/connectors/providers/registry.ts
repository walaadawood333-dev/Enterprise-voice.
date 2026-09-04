/**
 * Phase 14 - Connector Provider Registry
 * 
 * Manages connector provider registration and selection.
 * Provider-independent - no hardcoded provider logic.
 */

import type { ConnectorType } from "../../../shared/contracts";
import type { ConnectorProvider, ConnectorCredentials } from "./base";
import { SalesforceProvider } from "./salesforce";
import type { Logger } from "../../lib/observability";

/**
 * Provider registration entry
 */
interface ProviderRegistration {
  provider: ConnectorProvider;
  available: boolean;
}

/**
 * Connector Provider Registry
 */
export class ConnectorProviderRegistry {
  private readonly providers: Map<string, ProviderRegistration> = new Map();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register a connector provider
   */
  register(provider: ConnectorProvider): void {
    const id = provider.info.id;

    if (this.providers.has(id)) {
      this.logger.warn("connector_provider_already_registered", { providerId: id });
      return;
    }

    this.providers.set(id, {
      provider,
      available: true,
    });

    this.logger.info("connector_provider_registered", {
      providerId: id,
      name: provider.info.name,
      type: provider.info.type,
    });
  }

  /**
   * Get a provider by ID
   */
  getProvider(providerId: string): ConnectorProvider | undefined {
    return this.providers.get(providerId)?.provider;
  }

  /**
   * List all registered providers
   */
  listProviders(): ConnectorProvider[] {
    return Array.from(this.providers.values())
      .filter((reg) => reg.available)
      .map((reg) => reg.provider);
  }

  /** Safe registry snapshot, including unavailable adapters, for platform control surfaces. */
  listRegistrations(): Array<{ provider: ConnectorProvider; available: boolean }> {
    return Array.from(this.providers.values()).map(({ provider, available }) => ({ provider, available }));
  }

  /**
   * List providers by type
   */
  listProvidersByType(type: ConnectorType): ConnectorProvider[] {
    return this.listProviders().filter((p) => p.info.type === type);
  }

  /**
   * Validate credentials for a specific provider
   */
  validateCredentials(providerId: string, credentials: ConnectorCredentials): boolean {
    const provider = this.getProvider(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    return provider.validateCredentials(credentials);
  }

  /**
   * Check if a provider is registered
   */
  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId) && this.providers.get(providerId)!.available;
  }

  /**
   * Set provider availability (for health checks)
   */
  setProviderAvailability(providerId: string, available: boolean): void {
    const registration = this.providers.get(providerId);
    if (registration) {
      registration.available = available;
    }
  }
}

/**
 * Create and configure the connector provider registry
 */
export function createConnectorProviderRegistry(logger: Logger): ConnectorProviderRegistry {
  const registry = new ConnectorProviderRegistry(logger);

  // Register built-in providers
  registry.register(new SalesforceProvider(logger));

  // Future providers can be registered here:
  // registry.register(new HubSpotProvider(logger));
  // registry.register(new MicrosoftDynamicsProvider(logger));
  // registry.register(new SAPProvider(logger));
  // registry.register(new CustomApiProvider(logger));

  return registry;
}
