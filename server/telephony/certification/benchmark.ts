/**
 * Phase 9A — Provider Benchmark Model
 * 
 * Records and tracks provider performance metrics for comparison.
 * NEVER fabricates benchmark data — only records actual measurements.
 * 
 * Distinguishes between:
 * - TEST_DATA — Automated certification test results
 * - SANDBOX_DATA — Sandbox environment measurements
 * - PRODUCTION_DATA — Live production measurements
 */

import type {
  ProviderBenchmarkRecord,
  ProviderBenchmarkSummary,
  BenchmarkDataSource,
} from "./types";

/**
 * In-memory benchmark store.
 * In production, this would be backed by the database.
 */
class BenchmarkStore {
  private records: ProviderBenchmarkRecord[] = [];

  /**
   * Record a benchmark measurement.
   */
  record(measurement: ProviderBenchmarkRecord): void {
    // Validate data source
    if (!["TEST_DATA", "SANDBOX_DATA", "PRODUCTION_DATA"].includes(measurement.dataSource)) {
      throw new Error(`Invalid benchmark data source: ${measurement.dataSource}`);
    }
    this.records.push(measurement);
  }

  /**
   * Get all records for a provider.
   */
  getRecords(providerId: string): ProviderBenchmarkRecord[] {
    return this.records.filter((r) => r.providerId === providerId);
  }

  /**
   * Get records filtered by data source.
   */
  getRecordsBySource(providerId: string, source: BenchmarkDataSource): ProviderBenchmarkRecord[] {
    return this.records.filter((r) => r.providerId === providerId && r.dataSource === source);
  }

  /**
   * Get latest record for a provider.
   */
  getLatestRecord(providerId: string): ProviderBenchmarkRecord | null {
    const records = this.getRecords(providerId);
    if (records.length === 0) return null;
    return records.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
  }

  /**
   * Clear all records for a provider.
   */
  clearRecords(providerId: string): void {
    this.records = this.records.filter((r) => r.providerId !== providerId);
  }

  /**
   * Get all records.
   */
  getAllRecords(): ProviderBenchmarkRecord[] {
    return [...this.records];
  }
}

// Singleton store
const benchmarkStore = new BenchmarkStore();

/**
 * Record a benchmark measurement.
 */
export function recordBenchmark(measurement: ProviderBenchmarkRecord): void {
  benchmarkStore.record(measurement);
}

/**
 * Get benchmark records for a provider.
 */
export function getBenchmarkRecords(providerId: string): ProviderBenchmarkRecord[] {
  return benchmarkStore.getRecords(providerId);
}

/**
 * Get benchmark records filtered by data source.
 */
export function getBenchmarkRecordsBySource(
  providerId: string,
  source: BenchmarkDataSource
): ProviderBenchmarkRecord[] {
  return benchmarkStore.getRecordsBySource(providerId, source);
}

/**
 * Generate a benchmark summary for a provider.
 */
export function generateBenchmarkSummary(providerId: string): ProviderBenchmarkSummary {
  const records = benchmarkStore.getRecords(providerId);

  const byDataSource: Record<BenchmarkDataSource, number> = {
    TEST_DATA: 0,
    SANDBOX_DATA: 0,
    PRODUCTION_DATA: 0,
  };

  let totalLatency = 0;
  let latencyCount = 0;
  let totalSuccess = 0;
  let successCount = 0;

  for (const record of records) {
    byDataSource[record.dataSource]++;

    if (record.latencyMs !== undefined) {
      totalLatency += record.latencyMs;
      latencyCount++;
    }
    if (record.callSuccessRate !== undefined) {
      totalSuccess += record.callSuccessRate;
      successCount++;
    }
  }

  const latestRecord = benchmarkStore.getLatestRecord(providerId);

  return {
    providerId,
    totalRecords: records.length,
    byDataSource,
    latestHealthStatus: latestRecord?.healthStatus,
    averageLatencyMs: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : undefined,
    averageSuccessRate: successCount > 0 ? Math.round(totalSuccess / successCount) : undefined,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Create a test data benchmark record.
 * Used during certification testing.
 */
export function createTestBenchmarkRecord(
  providerId: string,
  latencyMs: number,
  success: boolean
): ProviderBenchmarkRecord {
  return {
    providerId,
    dataSource: "TEST_DATA",
    latencyMs,
    callSuccessRate: success ? 100 : 0,
    failureRate: success ? 0 : 100,
    healthStatus: success ? "healthy" : "unavailable",
    recordedAt: new Date().toISOString(),
  };
}

/**
 * Create a sandbox benchmark record.
 * Used during sandbox testing.
 */
export function createSandboxBenchmarkRecord(
  providerId: string,
  latencyMs: number,
  callSuccessRate: number,
  webhookReliability: number
): ProviderBenchmarkRecord {
  return {
    providerId,
    dataSource: "SANDBOX_DATA",
    latencyMs,
    callSuccessRate,
    webhookReliability,
    healthStatus: "healthy",
    recordedAt: new Date().toISOString(),
  };
}

/**
 * Check if a provider has any production benchmark data.
 */
export function hasProductionBenchmarkData(providerId: string): boolean {
  const records = benchmarkStore.getRecordsBySource(providerId, "PRODUCTION_DATA");
  return records.length > 0;
}

/**
 * Get benchmark comparison between providers.
 */
export function compareProviders(
  providerIds: string[]
): Array<{ providerId: string; summary: ProviderBenchmarkSummary }> {
  return providerIds.map((id) => ({
    providerId: id,
    summary: generateBenchmarkSummary(id),
  }));
}
