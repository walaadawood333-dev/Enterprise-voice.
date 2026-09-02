/**
 * Phase 14 - Connector Sync Engine
 * 
 * Orchestrates data synchronization between external systems and CenterAI.
 * Manages sync job lifecycle and prevents duplicate concurrent syncs.
 */

import type { SyncJobStatus, SyncDirection } from "../shared/contracts";
import type { Db } from "../db/store";
import type { ConnectorProviderRegistry } from "./providers/registry";
import type { ConnectorCredentialStore } from "./credentials";
import type { Logger } from "../lib/observability";

/**
 * Sync job execution context
 */
interface SyncJobContext {
  jobId: string;
  organizationId: string;
  connectorId: string;
  providerId: string;
  direction: SyncDirection;
  objectType: string;
  mappings: any[];
  configuration: Record<string, any>;
  since?: string;
  limit?: number;
}

/**
 * Connector Sync Engine
 */
export class ConnectorSyncEngine {
  constructor(
    private readonly db: Db,
    private readonly providerRegistry: ConnectorProviderRegistry,
    private readonly credentialStore: ConnectorCredentialStore,
    private readonly logger: Logger
  ) {}

  /**
   * Execute a sync job
   */
  async executeSyncJob(context: SyncJobContext): Promise<void> {
    const { jobId, organizationId, connectorId, providerId, direction, objectType } = context;

    this.logger.info("sync_job_started", {
      jobId,
      organizationId,
      connectorId,
      direction,
      objectType,
    });

    try {
      // Update job status to RUNNING
      await this.db.connectorSyncJobs.update(jobId, organizationId, {
        status: "RUNNING",
        startedAt: new Date().toISOString(),
      });

      // Retrieve provider
      const provider = this.providerRegistry.getProvider(providerId);
      if (!provider) {
        throw new Error(`Provider not found: ${providerId}`);
      }

      // Retrieve credentials
      const credentials = await this.credentialStore.retrieve(organizationId, connectorId);
      if (!credentials) {
        throw new Error("Credentials not found for connector");
      }

      // Execute sync based on direction
      let result;
      if (direction === "INBOUND" && provider.syncInbound) {
        result = await provider.syncInbound({
          organizationId,
          connectorId,
          credentials,
          configuration: context.configuration,
          mappings: context.mappings,
          direction: "INBOUND",
          objectType,
          since: context.since,
          limit: context.limit,
        });
      } else if (direction === "OUTBOUND" && provider.syncOutbound) {
        result = await provider.syncOutbound({
          organizationId,
          connectorId,
          credentials,
          configuration: context.configuration,
          mappings: context.mappings,
          direction: "OUTBOUND",
          objectType,
          since: context.since,
          limit: context.limit,
        });
      } else {
        throw new Error(`Provider does not support ${direction} sync`);
      }

      // Update job with results
      await this.db.connectorSyncJobs.update(jobId, organizationId, {
        status: result.success ? "COMPLETED" : "FAILED",
        completedAt: new Date().toISOString(),
        recordsProcessed: result.recordsProcessed,
        recordsFailed: result.recordsFailed,
        errorMessage: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
      });

      // Update connector last sync time
      await this.db.connectors.update(connectorId, organizationId, {
        lastSyncAt: new Date().toISOString(),
      });

      this.logger.info("sync_job_completed", {
        jobId,
        success: result.success,
        recordsProcessed: result.recordsProcessed,
        recordsFailed: result.recordsFailed,
      });
    } catch (error) {
      this.logger.error("sync_job_failed", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Update job status to FAILED
      await this.db.connectorSyncJobs.update(jobId, organizationId, {
        status: "FAILED",
        completedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });

      throw error;
    }
  }

  /**
   * Check if a sync job can run (prevent duplicates)
   */
  async canRunSyncJob(
    organizationId: string,
    connectorId: string,
    direction: SyncDirection
  ): Promise<boolean> {
    // Check if there's already a running job for this connector/direction
    const runningJobs = await this.db.connectorSyncJobs.listByConnector(
      organizationId,
      connectorId,
      100 // Check last 100 jobs
    );

    const hasRunningJob = runningJobs.some(
      (job) => job.direction === direction && job.status === "RUNNING"
    );

    return !hasRunningJob;
  }

  /**
   * Queue a sync job
   */
  async queueSyncJob(
    organizationId: string,
    connectorId: string,
    direction: SyncDirection,
    objectType: string,
    mappings: any[],
    configuration: Record<string, any>,
    since?: string,
    limit?: number
  ): Promise<string> {
    // Get connector to determine provider
    const connector = await this.db.connectors.get(connectorId, organizationId);
    if (!connector) {
      throw new Error("Connector not found");
    }

    // Create sync job record
    const job = await this.db.connectorSyncJobs.create({
      organizationId,
      connectorId,
      direction,
      metadata: {
        objectType,
        since,
        limit,
      },
    });

    this.logger.info("sync_job_queued", {
      jobId: job.id,
      organizationId,
      connectorId,
      direction,
      objectType,
    });

    // In a production system, this would add to a job queue (Redis, RabbitMQ, etc.)
    // For now, we'll execute immediately in a background task
    // In a real implementation, this would be: queue.add(job)

    // Execute asynchronously
    setImmediate(async () => {
      try {
        await this.executeSyncJob({
          jobId: job.id,
          organizationId,
          connectorId,
          providerId: connector.provider,
          direction,
          objectType,
          mappings,
          configuration,
          since,
          limit,
        });
      } catch (error) {
        this.logger.error("sync_job_execution_error", {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return job.id;
  }
}

/**
 * Create sync engine
 */
export function createConnectorSyncEngine(
  db: Db,
  providerRegistry: ConnectorProviderRegistry,
  credentialStore: ConnectorCredentialStore,
  logger: Logger
): ConnectorSyncEngine {
  return new ConnectorSyncEngine(db, providerRegistry, credentialStore, logger);
}
