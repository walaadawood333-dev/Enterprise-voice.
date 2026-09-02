/**
 * Phase 10E + Phase 14 — Data Connector Service
 * 
 * Provides provider-independent data connector framework for enterprise integrations.
 * Phase 14 adds real provider integration (Salesforce CRM).
 * 
 * Key principles:
 * - Provider-agnostic: No hardcoded CRM or provider logic
 * - Credential security: Credentials never returned in API responses
 * - Organization isolation: All queries scoped to organizationId
 * - Audit integration: All operations logged with scrubbed metadata
 * - Entitlement enforcement: Feature flag checks on all operations
 */

import type {
  ConnectorType,
  ConnectorStatus,
  ConnectorHealthStatus,
  DataConnectorRow,
  DataConnectorDto,
  DataConnectorFieldMappingRow,
  DataConnectorFieldMappingDto,
  DataConnectorSyncJobRow,
  DataConnectorSyncJobDto,
  DataConnectorActivityRow,
  DataConnectorActivityDto,
  ConnectorTestResult,
  ConnectorSchema,
  SyncMode,
  SyncDirection,
  SyncJobStatus,
  DataTransformerType,
  ConnectorActivityType,
} from "../../shared/contracts";
import type { Db } from "../db/store";
import type { ConnectorProviderRegistry } from "../connectors/providers/registry";
import type { ConnectorCredentialStore } from "../connectors/credentials";
import type { ConnectorSyncEngine } from "../connectors/syncEngine";
import type { Logger } from "../lib/observability";

export interface ConnectorService {
  // Connector CRUD
  createConnector(
    organizationId: string,
    input: CreateConnectorInput
  ): Promise<DataConnectorDto>;
  
  getConnector(
    organizationId: string,
    connectorId: string
  ): Promise<DataConnectorDto | undefined>;
  
  listConnectors(
    organizationId: string,
    filters?: { type?: ConnectorType; status?: ConnectorStatus }
  ): Promise<DataConnectorDto[]>;
  
  updateConnector(
    organizationId: string,
    connectorId: string,
    patch: UpdateConnectorInput
  ): Promise<DataConnectorDto | undefined>;
  
  deleteConnector(
    organizationId: string,
    connectorId: string
  ): Promise<boolean>;

  // Connection testing
  testConnection(
    organizationId: string,
    connectorId: string
  ): Promise<ConnectorTestResult>;

  // Credential management (Phase 14)
  storeCredentials(
    organizationId: string,
    connectorId: string,
    credentials: Record<string, any>
  ): Promise<void>;

  hasCredentials(
    organizationId: string,
    connectorId: string
  ): Promise<boolean>;

  // Schema discovery
  discoverSchema(
    organizationId: string,
    connectorId: string
  ): Promise<ConnectorSchema | undefined>;

  // Field mapping
  createMapping(
    organizationId: string,
    connectorId: string,
    input: CreateMappingInput
  ): Promise<DataConnectorFieldMappingDto>;
  
  getMapping(
    organizationId: string,
    connectorId: string,
    mappingId: string
  ): Promise<DataConnectorFieldMappingDto | undefined>;
  
  listMappings(
    organizationId: string,
    connectorId: string
  ): Promise<DataConnectorFieldMappingDto[]>;
  
  updateMapping(
    organizationId: string,
    connectorId: string,
    mappingId: string,
    patch: UpdateMappingInput
  ): Promise<DataConnectorFieldMappingDto | undefined>;
  
  deleteMapping(
    organizationId: string,
    connectorId: string,
    mappingId: string
  ): Promise<boolean>;

  // Sync operations
  triggerSync(
    organizationId: string,
    connectorId: string,
    direction: SyncDirection
  ): Promise<DataConnectorSyncJobDto>;
  
  getSyncJob(
    organizationId: string,
    jobId: string
  ): Promise<DataConnectorSyncJobDto | undefined>;
  
  listSyncJobs(
    organizationId: string,
    connectorId: string,
    limit?: number
  ): Promise<DataConnectorSyncJobDto[]>;

  // Activity & health
  listActivities(
    organizationId: string,
    connectorId: string,
    limit?: number
  ): Promise<DataConnectorActivityDto[]>;
  
  getHealth(
    organizationId: string,
    connectorId: string
  ): Promise<ConnectorHealthStatus>;
}

export interface CreateConnectorInput {
  name: string;
  provider: string;
  type: ConnectorType;
  syncMode?: SyncMode;
  scheduleCron?: string;
  configuration?: Record<string, any>;
}

export interface UpdateConnectorInput {
  name?: string;
  status?: ConnectorStatus;
  syncMode?: SyncMode;
  scheduleCron?: string;
  configuration?: Record<string, any>;
  enabled?: boolean;
}

export interface CreateMappingInput {
  sourceField: string;
  targetField: string;
  dataType?: string;
  required?: boolean;
  transformerType?: DataTransformerType;
  transformerConfig?: Record<string, any>;
  displayOrder?: number;
}

export interface UpdateMappingInput {
  sourceField?: string;
  targetField?: string;
  dataType?: string;
  required?: boolean;
  transformerType?: DataTransformerType | null;
  transformerConfig?: Record<string, any>;
  displayOrder?: number;
}

/**
 * Create connector service with dependency injection.
 */
export function createConnectorService(deps: {
  db: Db;
  audit?: any; // AuditService
  entitlements?: any; // EntitlementService
  providerRegistry?: ConnectorProviderRegistry; // Phase 14
  credentialStore?: ConnectorCredentialStore; // Phase 14
  syncEngine?: ConnectorSyncEngine; // Phase 14
  logger?: Logger; // Phase 14
}): ConnectorService {
  const { db, audit, entitlements, providerRegistry, credentialStore, syncEngine, logger } = deps;

  // Helper: Check if organization has data_connectors feature
  async function checkEntitlement(organizationId: string): Promise<void> {
    if (!entitlements) return;
    
    const hasFeature = await entitlements.hasFeature(organizationId, "data_connectors");
    if (!hasFeature) {
      throw new Error("DATA_CONNECTORS_NOT_ENTITLED");
    }
  }

  // Helper: Map row to DTO (never expose credentials)
  async function toDto(row: DataConnectorRow): Promise<DataConnectorDto> {
    const mappingCount = await db.connectorMappings.count(row.organizationId, row.id);
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      provider: row.provider,
      type: row.type,
      status: row.status,
      healthStatus: row.healthStatus,
      syncMode: row.syncMode,
      lastSyncAt: row.lastSyncAt,
      lastTestedAt: row.lastTestedAt,
      enabled: row.enabled,
      mappingCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // Helper: Map mapping row to DTO
  function mappingToDto(row: DataConnectorFieldMappingRow): DataConnectorFieldMappingDto {
    return {
      id: row.id,
      connectorId: row.connectorId,
      sourceField: row.sourceField,
      targetField: row.targetField,
      dataType: row.dataType,
      required: row.required,
      transformerType: row.transformerType,
      displayOrder: row.displayOrder,
    };
  }

  // Helper: Map sync job row to DTO
  function syncJobToDto(row: DataConnectorSyncJobRow): DataConnectorSyncJobDto {
    return {
      id: row.id,
      connectorId: row.connectorId,
      direction: row.direction,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      recordsProcessed: row.recordsProcessed,
      recordsFailed: row.recordsFailed,
      errorMessage: row.errorMessage,
    };
  }

  // Helper: Map activity row to DTO
  function activityToDto(row: DataConnectorActivityRow): DataConnectorActivityDto {
    return {
      id: row.id,
      connectorId: row.connectorId,
      activityType: row.activityType,
      description: row.description,
      status: row.status,
      createdAt: row.createdAt,
    };
  }

  // Helper: Log connector activity
  async function logActivity(
    organizationId: string,
    connectorId: string,
    activityType: ConnectorActivityType,
    description: string,
    status: "success" | "failure" = "success",
    metadata: Record<string, any> = {},
    actorId: string | null = null
  ): Promise<void> {
    await db.connectorActivities.create({
      organizationId,
      connectorId,
      activityType,
      description,
      status,
      metadata,
      actorId,
    });
  }

  // Helper: Scrub credentials from metadata
  function scrubMetadata(metadata: Record<string, any>): Record<string, any> {
    const scrubbed = { ...metadata };
    const sensitiveKeys = [
      "apiKey", "api_key", "token", "password", "secret",
      "credential", "credentials", "auth", "authorization",
      "connectionString", "connection_string", "databaseUrl",
    ];
    
    for (const key of sensitiveKeys) {
      if (key in scrubbed) {
        delete scrubbed[key];
      }
    }
    
    return scrubbed;
  }

  return {
    async createConnector(organizationId, input) {
      await checkEntitlement(organizationId);

      const row = await db.connectors.create({
        organizationId,
        name: input.name,
        provider: input.provider,
        type: input.type,
        syncMode: input.syncMode ?? "MANUAL",
        scheduleCron: input.scheduleCron ?? null,
        credentialReference: null, // Credentials stored separately
        configuration: input.configuration ?? {},
      });

      if (audit) {
        await audit.log({
          organizationId,
          action: "CONNECTOR_CREATED",
          metadata: scrubMetadata({
            connectorId: row.id,
            name: row.name,
            provider: row.provider,
            type: row.type,
          }),
        });
      }

      return toDto(row);
    },

    async getConnector(organizationId, connectorId) {
      const row = await db.connectors.get(connectorId, organizationId);
      return row ? toDto(row) : undefined;
    },

    async listConnectors(organizationId, filters) {
      const rows = await db.connectors.listByOrg(
        organizationId,
        filters?.type,
        filters?.status
      );
      return Promise.all(rows.map(toDto));
    },

    async updateConnector(organizationId, connectorId, patch) {
      await checkEntitlement(organizationId);

      // Build update object, only including defined fields to avoid overwriting with undefined
      const updateData: any = {};
      if (patch.name !== undefined) updateData.name = patch.name;
      if (patch.status !== undefined) updateData.status = patch.status;
      if (patch.syncMode !== undefined) updateData.syncMode = patch.syncMode;
      if (patch.scheduleCron !== undefined) updateData.scheduleCron = patch.scheduleCron;
      if (patch.configuration !== undefined) updateData.configuration = patch.configuration;
      if (patch.enabled !== undefined) updateData.enabled = patch.enabled;

      const row = await db.connectors.update(connectorId, organizationId, updateData);

      if (!row) return undefined;

      if (audit) {
        await audit.log({
          organizationId,
          action: "CONNECTOR_UPDATED",
          metadata: scrubMetadata({
            connectorId: row.id,
            changes: Object.keys(patch),
          }),
        });
      }

      return toDto(row);
    },

    async deleteConnector(organizationId, connectorId) {
      await checkEntitlement(organizationId);

      const deleted = await db.connectors.delete(connectorId, organizationId);
      
      if (deleted && audit) {
        await audit.log({
          organizationId,
          action: "CONNECTOR_DELETED",
          metadata: { connectorId },
        });
      }

      return deleted;
    },

    async testConnection(organizationId, connectorId) {
      await checkEntitlement(organizationId);

      const connector = await db.connectors.get(connectorId, organizationId);
      if (!connector) {
        throw new Error("CONNECTOR_NOT_FOUND");
      }

      // Phase 14: Use real provider for connection testing
      if (providerRegistry && credentialStore) {
        const provider = providerRegistry.getProvider(connector.provider);
        if (!provider) {
          return {
            success: false,
            message: "Provider not available",
            latencyMs: 0,
            diagnostics: {
              provider: connector.provider,
              error: "PROVIDER_NOT_REGISTERED",
            },
          };
        }

        // Retrieve credentials
        const credentials = await credentialStore.retrieve(organizationId, connectorId);
        if (!credentials) {
          return {
            success: false,
            message: "Credentials not configured",
            latencyMs: 0,
            diagnostics: {
              provider: connector.provider,
              error: "CREDENTIALS_NOT_FOUND",
            },
          };
        }

        // Test connection using real provider
        const result = await provider.testConnection({
          organizationId,
          credentials,
          configuration: connector.configuration,
        });

        // Update connector status based on test result
        const newStatus: ConnectorStatus = result.success ? "CONNECTED" : "ERROR";
        const newHealthStatus: ConnectorHealthStatus = result.success ? "HEALTHY" : "UNAVAILABLE";

        await db.connectors.update(connectorId, organizationId, {
          status: newStatus,
          healthStatus: newHealthStatus,
          lastTestedAt: new Date().toISOString(),
          lastHealthCheckAt: new Date().toISOString(),
        });

        // Log activity
        await logActivity(
          organizationId,
          connectorId,
          "CONNECTION_TESTED",
          result.message,
          result.success ? "success" : "failure",
          { latencyMs: result.latencyMs }
        );

        if (audit) {
          await audit.log({
            organizationId,
            action: "CONNECTOR_TESTED",
            metadata: {
              connectorId,
              success: result.success,
              message: result.message,
              latencyMs: result.latencyMs,
            },
          });
        }

        return result;
      }

      // Fallback: Simulate connection test (Phase 10E behavior)
      const startTime = Date.now();
      const result: ConnectorTestResult = {
        success: connector.status !== "ERROR",
        message: connector.status === "CONNECTED" 
          ? "Connection successful"
          : connector.status === "ERROR"
          ? "Connection failed"
          : "Connection test not available - provider not implemented",
        latencyMs: Date.now() - startTime,
        diagnostics: {
          status: connector.status,
          healthStatus: connector.healthStatus,
          provider: connector.provider,
        },
      };

      // Update last tested timestamp
      await db.connectors.update(connectorId, organizationId, {
        lastTestedAt: new Date().toISOString(),
      });

      // Log activity
      await logActivity(
        organizationId,
        connectorId,
        "CONNECTION_TESTED",
        result.message,
        result.success ? "success" : "failure",
        { latencyMs: result.latencyMs }
      );

      if (audit) {
        await audit.log({
          organizationId,
          action: "CONNECTOR_TESTED",
          metadata: scrubMetadata({
            connectorId,
            success: result.success,
            message: result.message,
          }),
        });
      }

      return result;
    },

    async storeCredentials(organizationId, connectorId, credentials) {
      await checkEntitlement(organizationId);

      const connector = await db.connectors.get(connectorId, organizationId);
      if (!connector) {
        throw new Error("CONNECTOR_NOT_FOUND");
      }

      // Phase 14: Store credentials in secure credential store
      if (credentialStore) {
        // Validate credentials using provider
        if (providerRegistry) {
          const provider = providerRegistry.getProvider(connector.provider);
          if (provider && !provider.validateCredentials(credentials)) {
            throw new Error("INVALID_CREDENTIALS");
          }
        }

        await credentialStore.store(organizationId, connectorId, credentials);

        if (audit) {
          await audit.log({
            organizationId,
            action: "CONNECTOR_CREDENTIALS_STORED",
            metadata: {
              connectorId,
              // Never log actual credentials
              credentialKeys: Object.keys(credentials),
            },
          });
        }

        return;
      }

      throw new Error("Credential store not available");
    },

    async hasCredentials(organizationId, connectorId) {
      if (!credentialStore) {
        return false;
      }

      return credentialStore.exists(organizationId, connectorId);
    },

    async discoverSchema(organizationId, connectorId) {
      await checkEntitlement(organizationId);

      const connector = await db.connectors.get(connectorId, organizationId);
      if (!connector) {
        throw new Error("CONNECTOR_NOT_FOUND");
      }

      // Phase 14: Use real provider for schema discovery
      if (providerRegistry && credentialStore) {
        const provider = providerRegistry.getProvider(connector.provider);
        if (!provider || !provider.discoverSchema) {
          // Provider doesn't support schema discovery
          return undefined;
        }

        // Retrieve credentials
        const credentials = await credentialStore.retrieve(organizationId, connectorId);
        if (!credentials) {
          throw new Error("Credentials not configured");
        }

        // Discover schema using real provider
        const schema = await provider.discoverSchema({
          organizationId,
          credentials,
          configuration: connector.configuration,
        });

        if (audit) {
          await audit.log({
            organizationId,
            action: "CONNECTOR_SCHEMA_DISCOVERED",
            metadata: {
              connectorId,
              objectCount: schema.objects.length,
            },
          });
        }

        return schema;
      }

      // Fallback: Schema discovery not available (Phase 10E behavior)
      return undefined;
    },

    async createMapping(organizationId, connectorId, input) {
      await checkEntitlement(organizationId);

      const connector = await db.connectors.get(connectorId, organizationId);
      if (!connector) {
        throw new Error("CONNECTOR_NOT_FOUND");
      }

      const row = await db.connectorMappings.create({
        organizationId,
        connectorId,
        sourceField: input.sourceField,
        targetField: input.targetField,
        dataType: input.dataType ?? "string",
        required: input.required ?? false,
        transformerType: input.transformerType ?? null,
        transformerConfig: input.transformerConfig ?? {},
        displayOrder: input.displayOrder ?? 0,
      });

      await logActivity(
        organizationId,
        connectorId,
        "MAPPING_CHANGED",
        `Field mapping created: ${input.sourceField} → ${input.targetField}`,
        "success"
      );

      if (audit) {
        await audit.log({
          organizationId,
          action: "CONNECTOR_MAPPING_CREATED",
          metadata: {
            connectorId,
            mappingId: row.id,
            sourceField: input.sourceField,
            targetField: input.targetField,
          },
        });
      }

      return mappingToDto(row);
    },

    async getMapping(organizationId, connectorId, mappingId) {
      const row = await db.connectorMappings.get(mappingId, organizationId);
      if (!row || row.connectorId !== connectorId) return undefined;
      return mappingToDto(row);
    },

    async listMappings(organizationId, connectorId) {
      const rows = await db.connectorMappings.listByConnector(organizationId, connectorId);
      return rows.map(mappingToDto);
    },

    async updateMapping(organizationId, connectorId, mappingId, patch) {
      await checkEntitlement(organizationId);

      // Build update object, only including defined fields
      const updateData: any = {};
      if (patch.sourceField !== undefined) updateData.sourceField = patch.sourceField;
      if (patch.targetField !== undefined) updateData.targetField = patch.targetField;
      if (patch.dataType !== undefined) updateData.dataType = patch.dataType;
      if (patch.required !== undefined) updateData.required = patch.required;
      if (patch.transformerType !== undefined) updateData.transformerType = patch.transformerType;
      if (patch.transformerConfig !== undefined) updateData.transformerConfig = patch.transformerConfig;
      if (patch.displayOrder !== undefined) updateData.displayOrder = patch.displayOrder;

      const row = await db.connectorMappings.update(mappingId, organizationId, updateData);

      if (!row || row.connectorId !== connectorId) return undefined;

      await logActivity(
        organizationId,
        connectorId,
        "MAPPING_CHANGED",
        `Field mapping updated: ${row.sourceField} → ${row.targetField}`,
        "success"
      );

      if (audit) {
        await audit.log({
          organizationId,
          action: "CONNECTOR_MAPPING_UPDATED",
          metadata: {
            connectorId,
            mappingId: row.id,
          },
        });
      }

      return mappingToDto(row);
    },

    async deleteMapping(organizationId, connectorId, mappingId) {
      await checkEntitlement(organizationId);

      const mapping = await db.connectorMappings.get(mappingId, organizationId);
      if (!mapping || mapping.connectorId !== connectorId) return false;

      const deleted = await db.connectorMappings.delete(mappingId, organizationId);

      if (deleted) {
        await logActivity(
          organizationId,
          connectorId,
          "MAPPING_CHANGED",
          `Field mapping deleted: ${mapping.sourceField} → ${mapping.targetField}`,
          "success"
        );

        if (audit) {
          await audit.log({
            organizationId,
            action: "CONNECTOR_MAPPING_DELETED",
            metadata: {
              connectorId,
              mappingId,
            },
          });
        }
      }

      return deleted;
    },

    async triggerSync(organizationId, connectorId, direction) {
      await checkEntitlement(organizationId);

      const connector = await db.connectors.get(connectorId, organizationId);
      if (!connector) {
        throw new Error("CONNECTOR_NOT_FOUND");
      }

      if (!connector.enabled) {
        throw new Error("CONNECTOR_NOT_ENABLED");
      }

      // Phase 14: Use real sync engine
      if (syncEngine && providerRegistry && credentialStore) {
        // Check if sync can run (prevent duplicates)
        const canRun = await syncEngine.canRunSyncJob(organizationId, connectorId, direction);
        if (!canRun) {
          throw new Error("SYNC_ALREADY_RUNNING");
        }

        // Get mappings
        const mappings = await db.connectorMappings.listByConnector(organizationId, connectorId);
        if (mappings.length === 0) {
          throw new Error("NO_MAPPINGS_CONFIGURED");
        }

        // Determine object type from configuration or default
        const objectType = connector.configuration.objectType || "Contact";

        // Queue sync job
        const jobId = await syncEngine.queueSyncJob(
          organizationId,
          connectorId,
          direction,
          objectType,
          mappings,
          connector.configuration,
          connector.configuration.since,
          connector.configuration.limit
        );

        // Get the created job
        const job = await db.connectorSyncJobs.get(jobId, organizationId);
        if (!job) {
          throw new Error("Failed to create sync job");
        }

        return syncJobToDto(job);
      }

      // Fallback: Create sync job without execution (Phase 10E behavior)
      const job = await db.connectorSyncJobs.create({
        organizationId,
        connectorId,
        direction,
        metadata: {},
      });

      // Log activity
      await logActivity(
        organizationId,
        connectorId,
        "SYNC_STARTED",
        `Sync job started (${direction})`,
        "success",
        { jobId: job.id, direction }
      );

      if (audit) {
        await audit.log({
          organizationId,
          action: "CONNECTOR_SYNC_STARTED",
          metadata: {
            connectorId,
            jobId: job.id,
            direction,
          },
        });
      }

      return syncJobToDto(job);
    },

    async getSyncJob(organizationId, jobId) {
      const row = await db.connectorSyncJobs.get(jobId, organizationId);
      return row ? syncJobToDto(row) : undefined;
    },

    async listSyncJobs(organizationId, connectorId, limit) {
      const rows = await db.connectorSyncJobs.listByConnector(
        organizationId,
        connectorId,
        limit
      );
      return rows.map(syncJobToDto);
    },

    async listActivities(organizationId, connectorId, limit) {
      const rows = await db.connectorActivities.listByConnector(
        organizationId,
        connectorId,
        limit
      );
      return rows.map(activityToDto);
    },

    async getHealth(organizationId, connectorId) {
      const connector = await db.connectors.get(connectorId, organizationId);
      if (!connector) {
        throw new Error("CONNECTOR_NOT_FOUND");
      }

      // Health is determined by the connector's healthStatus field
      // In a real implementation, this could call provider.testConnection()
      return connector.healthStatus;
    },
  };
}
