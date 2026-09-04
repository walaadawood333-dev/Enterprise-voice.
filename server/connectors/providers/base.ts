/**
 * Phase 14 - Enterprise Connector Provider Interface
 * 
 * Provider-independent abstraction for data connectors.
 * Similar to TelephonyProvider pattern.
 */

import type {
  ConnectorType,
  ConnectorTestResult,
  ConnectorSchema,
  DataConnectorFieldMappingDto,
} from "../../../shared/contracts";

/**
 * Provider capabilities
 */
export interface ConnectorProviderCapabilities {
  connectionTesting: boolean;
  schemaDiscovery: boolean;
  inboundSync: boolean;
  outboundSync: boolean;
  webhookSupport: boolean;
  batchOperations: boolean;
}

/**
 * Provider info (safe for API responses)
 */
export interface ConnectorProviderInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  type: ConnectorType;
  capabilities: ConnectorProviderCapabilities;
  supportedObjects?: string[];
  /** Safe field definitions used to render credential forms. Values never enter this metadata. */
  credentialFields: Array<{
    key: string;
    label: string;
    input: "text" | "secret" | "url";
    required: boolean;
    description?: string;
  }>;
}

/**
 * Credential configuration (server-side only, never exposed)
 */
export interface ConnectorCredentials {
  [key: string]: string;
}

/**
 * Connection test request
 */
export interface TestConnectionRequest {
  organizationId: string;
  credentials: ConnectorCredentials;
  configuration: Record<string, any>;
}

/**
 * Schema discovery request
 */
export interface DiscoverSchemaRequest {
  organizationId: string;
  credentials: ConnectorCredentials;
  configuration: Record<string, any>;
  objectTypes?: string[]; // Optional: specific objects to discover
}

/**
 * Sync request
 */
export interface SyncRequest {
  organizationId: string;
  connectorId: string;
  credentials: ConnectorCredentials;
  configuration: Record<string, any>;
  mappings: DataConnectorFieldMappingDto[];
  direction: "INBOUND" | "OUTBOUND";
  objectType: string;
  since?: string; // ISO timestamp for incremental sync
  limit?: number;
}

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsFailed: number;
  errors: Array<{
    recordId?: string;
    message: string;
    details?: Record<string, any>;
  }>;
  metadata: Record<string, any>;
}

/**
 * Connector Provider Interface
 * 
 * All connector providers must implement this interface.
 * Provider-specific logic stays in the adapter, never in core services.
 */
export interface ConnectorProvider {
  /**
   * Provider information (safe for API responses)
   */
  readonly info: ConnectorProviderInfo;

  /**
   * Validate credentials (server-side only)
   * Returns true if credentials are structurally valid
   */
  validateCredentials(credentials: ConnectorCredentials): boolean;

  /**
   * Test connection to external system
   * Returns safe diagnostics only (no credentials or raw errors)
   */
  testConnection(request: TestConnectionRequest): Promise<ConnectorTestResult>;

  /**
   * Discover schema (objects, fields, capabilities)
   * Optional - not all providers support this
   */
  discoverSchema?(request: DiscoverSchemaRequest): Promise<ConnectorSchema>;

  /**
   * Sync data from external system
   */
  syncInbound?(request: SyncRequest): Promise<SyncResult>;

  /**
   * Sync data to external system
   */
  syncOutbound?(request: SyncRequest): Promise<SyncResult>;
}
