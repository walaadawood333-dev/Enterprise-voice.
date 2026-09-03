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
  DataTransformerType,
  ConnectorActivityType,
  ConnectorControlDto,
  ConnectorProviderControlDto,
  ControlCenterStatus,
  AuditAction,
} from "../../shared/contracts";
import type { Db } from "../db/store";
import type { ConnectorProviderRegistry } from "../connectors/providers/registry";
import {
  containsCredentialMaterial,
  scrubCredentials,
  type ConnectorCredentialStore,
} from "../connectors/credentials";
import type { ConnectorSyncEngine } from "../connectors/syncEngine";
import type { Logger } from "../lib/observability";
import type { AuditService } from "./audit";

export interface ConnectorService {
  // Connector CRUD
  createConnector(
    organizationId: string,
    input: CreateConnectorInput,
    actor?: ConnectorActor
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
    patch: UpdateConnectorInput,
    actor?: ConnectorActor
  ): Promise<DataConnectorDto | undefined>;
  
  deleteConnector(
    organizationId: string,
    connectorId: string,
    actor?: ConnectorActor
  ): Promise<boolean>;

  // Connection testing
  testConnection(
    organizationId: string,
    connectorId: string,
    actor?: ConnectorActor
  ): Promise<ConnectorTestResult>;

  // Credential management (Phase 14)
  storeCredentials(
    organizationId: string,
    connectorId: string,
    credentials: Record<string, any>,
    actor?: ConnectorActor
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

  /** Safe, normalized control-center views. */
  getControlConnector(organizationId: string, connectorId: string): Promise<ConnectorControlDto | undefined>;
  listControlConnectors(organizationId: string): Promise<ConnectorControlDto[]>;
  listControlProviders(organizationId?: string): Promise<ConnectorProviderControlDto[]>;
  credentialStorageKind(): "SESSION_ONLY" | "SECURE_EXTERNAL" | "UNAVAILABLE";
}

export interface ConnectorActor {
  actorId?: string | null;
  actorEmail?: string | null;
  ipAddress?: string | null;
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

/** Normalize persisted connector state to the only statuses exposed by the control center. */
export function connectorControlStatus(
  row: Pick<DataConnectorRow, "enabled" | "status" | "healthStatus">,
  hasCredentials: boolean
): ControlCenterStatus {
  if (row.status === "DISABLED") return "UNAVAILABLE";
  if (!hasCredentials) return "NOT_CONFIGURED";
  if (!row.enabled) return "UNAVAILABLE";
  if (row.healthStatus === "UNAVAILABLE") return "UNAVAILABLE";
  if (row.healthStatus === "DEGRADED") return "DEGRADED";
  if (row.status === "ERROR") return "DEGRADED";
  if (row.status === "CONNECTED" && row.healthStatus === "HEALTHY") return "CONNECTED";
  return "UNKNOWN";
}

/**
 * Create connector service with dependency injection.
 */
export function createConnectorService(deps: {
  db: Db;
  audit?: AuditService;
  entitlements?: { hasFeature(organizationId: string, feature: string): Promise<boolean> };
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

  function rejectCredentialConfiguration(configuration: Record<string, unknown> | undefined): void {
    if (configuration && containsCredentialMaterial(configuration)) {
      throw new Error("CREDENTIALS_NOT_ALLOWED_IN_CONFIGURATION");
    }
  }

  async function recordAudit(
    organizationId: string,
    action: AuditAction,
    metadata: Record<string, unknown>,
    actor?: ConnectorActor
  ): Promise<void> {
    if (!audit) return;
    const safe = scrubCredentials(metadata) as Record<string, string | number | boolean | null>;
    await audit.record({
      organizationId,
      action,
      actorId: actor?.actorId,
      actorEmail: actor?.actorEmail,
      ipAddress: actor?.ipAddress,
      metadata: safe,
    });
  }

  async function rowToControl(row: DataConnectorRow): Promise<ConnectorControlDto> {
    const provider = providerRegistry?.hasProvider(row.provider)
      ? providerRegistry.getProvider(row.provider)
      : undefined;
    const [mappingCount, hasCredentials] = await Promise.all([
      db.connectorMappings.count(row.organizationId, row.id),
      credentialStore?.exists(row.organizationId, row.id) ?? Promise.resolve(false),
    ]);
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      providerName: provider?.info.name ?? row.provider,
      type: row.type,
      status: connectorControlStatus(row, hasCredentials),
      enabled: row.enabled,
      hasCredentials,
      connectionTestingSupported: provider?.info.capabilities.connectionTesting === true,
      syncMode: row.syncMode,
      mappingCount,
      lastSyncAt: row.lastSyncAt,
      lastTestedAt: row.lastTestedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  return {
    async createConnector(organizationId, input, actor) {
      await checkEntitlement(organizationId);
      rejectCredentialConfiguration(input.configuration);
      if (providerRegistry) {
        const registered = providerRegistry.hasProvider(input.provider)
          ? providerRegistry.getProvider(input.provider)
          : undefined;
        if (!registered) throw new Error("CONNECTOR_PROVIDER_NOT_REGISTERED");
        if (registered.info.type !== input.type) throw new Error("CONNECTOR_PROVIDER_TYPE_MISMATCH");
      }

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

      await recordAudit(
        organizationId,
        "CONNECTOR_CREATED",
        { connectorId: row.id, name: row.name, provider: row.provider, type: row.type, lifecycle: "created" },
        actor
      );

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

    async updateConnector(organizationId, connectorId, patch, actor) {
      await checkEntitlement(organizationId);
      rejectCredentialConfiguration(patch.configuration);
      const before = await db.connectors.get(connectorId, organizationId);
      if (!before) return undefined;

      // Build update object, only including defined fields to avoid overwriting with undefined
      const updateData: any = {};
      if (patch.name !== undefined) updateData.name = patch.name;
      if (patch.status !== undefined) updateData.status = patch.status;
      if (patch.syncMode !== undefined) updateData.syncMode = patch.syncMode;
      if (patch.scheduleCron !== undefined) updateData.scheduleCron = patch.scheduleCron;
      if (patch.configuration !== undefined) updateData.configuration = patch.configuration;
      if (patch.enabled !== undefined) {
        updateData.enabled = patch.enabled;
        if (!patch.enabled) updateData.status = "DISABLED";
        if (patch.enabled && before.status === "DISABLED") updateData.status = "CONFIGURING";
      }

      const row = await db.connectors.update(connectorId, organizationId, updateData);
      if (!row) return undefined;

      const disabled = patch.enabled === false && before.status !== "DISABLED";
      if (disabled) {
        await logActivity(organizationId, connectorId, "CONNECTOR_DISABLED", "Connector disabled", "success", {}, actor?.actorId ?? null);
        await recordAudit(
          organizationId,
          "CONNECTOR_DISABLED",
          { connectorId: row.id, provider: row.provider, lifecycle: "disabled" },
          actor
        );
      } else {
        await recordAudit(
          organizationId,
          "CONNECTOR_UPDATED",
          { connectorId: row.id, changes: Object.keys(patch).join(","), lifecycle: "updated" },
          actor
        );
      }

      return toDto(row);
    },

    async deleteConnector(organizationId, connectorId, actor) {
      await checkEntitlement(organizationId);

      const deleted = await db.connectors.delete(connectorId, organizationId);
      if (deleted) await recordAudit(organizationId, "CONNECTOR_DELETED", { connectorId }, actor);
      return deleted;
    },

    async testConnection(organizationId, connectorId, actor) {
      await checkEntitlement(organizationId);
      const startedAt = Date.now();
      const connector = await db.connectors.get(connectorId, organizationId);
      if (!connector) throw new Error("CONNECTOR_NOT_FOUND");

      const finish = async (
        result: ConnectorTestResult,
        update?: { status?: ConnectorStatus; healthStatus?: ConnectorHealthStatus }
      ): Promise<ConnectorTestResult> => {
        const safeResult: ConnectorTestResult = {
          success: result.success === true,
          message: result.success ? "Connection test succeeded" : "Connection test failed",
          latencyMs:
            typeof result.latencyMs === "number" && Number.isFinite(result.latencyMs)
              ? Math.max(0, Math.round(result.latencyMs))
              : Date.now() - startedAt,
          diagnostics: {
            provider: connector.provider,
            ...(!result.success && typeof result.diagnostics?.error === "string" && /^[A-Z0-9_]{2,64}$/.test(result.diagnostics.error)
              ? { error: result.diagnostics.error }
              : {}),
          },
        };
        await db.connectors.update(connectorId, organizationId, {
          ...update,
          lastTestedAt: new Date().toISOString(),
          lastHealthCheckAt: update?.healthStatus ? new Date().toISOString() : connector.lastHealthCheckAt,
        });
        await logActivity(
          organizationId,
          connectorId,
          "CONNECTION_TESTED",
          safeResult.success ? "Connection test succeeded" : "Connection test failed",
          safeResult.success ? "success" : "failure",
          { latencyMs: safeResult.latencyMs },
          actor?.actorId ?? null
        );
        await recordAudit(
          organizationId,
          "CONNECTOR_TESTED",
          {
            connectorId,
            provider: connector.provider,
            success: safeResult.success,
            latencyMs: safeResult.latencyMs,
            lifecycle: "tested",
          },
          actor
        );
        return safeResult;
      };

      const provider = providerRegistry?.hasProvider(connector.provider)
        ? providerRegistry.getProvider(connector.provider)
        : undefined;
      if (!provider || provider.info.capabilities.connectionTesting !== true || !credentialStore) {
        return finish({
          success: false,
          message: "Connection testing unavailable",
          latencyMs: Date.now() - startedAt,
          diagnostics: { provider: connector.provider, error: "CONNECTION_TEST_UNAVAILABLE" },
        });
      }

      const credentials = await credentialStore.retrieve(organizationId, connectorId);
      if (!credentials) {
        return finish({
          success: false,
          message: "Credentials not configured",
          latencyMs: Date.now() - startedAt,
          diagnostics: { provider: connector.provider, error: "CREDENTIALS_NOT_FOUND" },
        });
      }

      try {
        // This is the registered adapter's genuine network-backed test. There is no inferred or
        // connector-state fallback.
        const providerResult = await provider.testConnection({
          organizationId,
          credentials,
          configuration: connector.configuration,
        });
        return finish(
          {
            success: providerResult.success,
            message: providerResult.success ? "Connection test succeeded" : "Connection test failed",
            latencyMs: providerResult.latencyMs,
            diagnostics: {
              provider: connector.provider,
              ...(!providerResult.success ? { error: "CONNECTION_ERROR" } : {}),
            },
          },
          {
            status: providerResult.success ? "CONNECTED" : "ERROR",
            healthStatus: providerResult.success ? "HEALTHY" : "UNAVAILABLE",
          }
        );
      } catch {
        logger?.warn("connector_connection_test_failed", { connectorId, provider: connector.provider });
        return finish(
          {
            success: false,
            message: "Connection test failed",
            latencyMs: Date.now() - startedAt,
            diagnostics: { provider: connector.provider, error: "CONNECTION_ERROR" },
          },
          { status: "ERROR", healthStatus: "UNAVAILABLE" }
        );
      }
    },

    async storeCredentials(organizationId, connectorId, credentials, actor) {
      await checkEntitlement(organizationId);
      const connector = await db.connectors.get(connectorId, organizationId);
      if (!connector) throw new Error("CONNECTOR_NOT_FOUND");
      if (!credentialStore || credentialStore.kind === "UNAVAILABLE") {
        throw new Error("SECURE_CREDENTIAL_STORE_NOT_CONFIGURED");
      }

      const provider = providerRegistry?.hasProvider(connector.provider)
        ? providerRegistry.getProvider(connector.provider)
        : undefined;
      if (!provider) throw new Error("CONNECTOR_PROVIDER_NOT_REGISTERED");
      const allowedFields = new Set(provider.info.credentialFields.map((field) => field.key));
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(credentials)) {
        if (!allowedFields.has(key) || typeof value !== "string" || value.length > 4096) {
          throw new Error("INVALID_CREDENTIALS");
        }
        normalized[key] = value;
      }
      if (!provider.validateCredentials(normalized)) throw new Error("INVALID_CREDENTIALS");

      await credentialStore.store(organizationId, connectorId, normalized);
      await db.connectors.update(connectorId, organizationId, {
        status: connector.status === "CONNECTED" ? "CONNECTED" : "CONFIGURING",
      });
      await recordAudit(
        organizationId,
        "CONNECTOR_UPDATED",
        { connectorId, provider: connector.provider, lifecycle: "credentials_updated" },
        actor
      );
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

        await recordAudit(
          organizationId,
          "CONNECTOR_UPDATED",
          { connectorId, objectCount: schema.entities.length, lifecycle: "schema_discovered" }
        );

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
        await audit.record({
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
        await audit.record({
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
          await audit.record({
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
        await audit.record({
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
      if (!connector) throw new Error("CONNECTOR_NOT_FOUND");
      return connector.healthStatus;
    },

    async getControlConnector(organizationId, connectorId) {
      const row = await db.connectors.get(connectorId, organizationId);
      return row ? rowToControl(row) : undefined;
    },

    async listControlConnectors(organizationId) {
      await checkEntitlement(organizationId);
      const rows = await db.connectors.listByOrg(organizationId);
      return Promise.all(rows.map(rowToControl));
    },

    async listControlProviders(organizationId) {
      if (!providerRegistry) return [];
      const connectors = organizationId ? await db.connectors.listByOrg(organizationId) : [];
      const statuses = organizationId
        ? await Promise.all(
            connectors.map(async (row) =>
              connectorControlStatus(row, (await credentialStore?.exists(organizationId, row.id)) ?? false)
            )
          )
        : [];
      const rank: Record<ControlCenterStatus, number> = {
        CONNECTED: 5,
        DEGRADED: 4,
        UNAVAILABLE: 3,
        UNKNOWN: 2,
        NOT_CONFIGURED: 1,
      };

      return providerRegistry.listRegistrations().map(({ provider, available }) => {
        const providerStatuses = connectors
          .map((connector, index) => ({ connector, status: statuses[index] }))
          .filter(({ connector }) => connector.provider === provider.info.id)
          .map(({ status }) => status);
        const status: ControlCenterStatus = !available
          ? "UNAVAILABLE"
          : !organizationId
            ? "UNKNOWN"
            : providerStatuses.length === 0
              ? "NOT_CONFIGURED"
              : providerStatuses.sort((a, b) => rank[b] - rank[a])[0];
        return {
          id: provider.info.id,
          name: provider.info.name,
          description: provider.info.description,
          version: provider.info.version,
          type: provider.info.type,
          status,
          capabilities: { ...provider.info.capabilities },
          supportedObjects: [...(provider.info.supportedObjects ?? [])],
          credentialFields: provider.info.credentialFields.map((field) => ({ ...field })),
        };
      });
    },

    credentialStorageKind() {
      return credentialStore?.kind ?? "UNAVAILABLE";
    },
  };
}
