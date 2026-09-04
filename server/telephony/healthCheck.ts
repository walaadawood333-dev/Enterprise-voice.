/**
 * Provider Health Check Architecture.
 *
 * Health states: UNKNOWN | HEALTHY | DEGRADED | UNAVAILABLE | DISABLED
 *
 * Rules:
 *   - Never blocks application startup indefinitely (timeout-protected)
 *   - Never exposes secrets in results
 *   - Records safe status information only
 *   - Results are advisory — a failing health check does not crash the platform
 */

import type { ProviderHealthStatus } from "../../shared/contracts";
import type { Logger } from "../lib/observability";
import type { TelephonyProvider } from "./provider";
import type { ProviderRegistry } from "./registry";

export interface HealthCheckResult {
  providerId: string;
  status: ProviderHealthStatus;
  latencyMs: number;
  checkedAt: string;
  /** Human-readable detail — never contains secrets. */
  detail: string;
}

export interface HealthCheckOptions {
  /** Maximum time to wait for a health check response. Default: 5000ms. */
  timeoutMs?: number;
}

/**
 * Run a health check against a single provider.
 * The check is timeout-protected so a hung provider never blocks startup.
 */
export async function checkProviderHealth(
  provider: TelephonyProvider,
  logger: Logger,
  options: HealthCheckOptions = {}
): Promise<HealthCheckResult> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const started = Date.now();
  const providerId = provider.info.id;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // Race the availability check against a timeout and always release the timer afterward.
    const result = await Promise.race([
      runHealthProbe(provider),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("HEALTH_CHECK_TIMEOUT")), timeoutMs);
      }),
    ]);
    if (timeout) clearTimeout(timeout);

    const latencyMs = Date.now() - started;
    const status: ProviderHealthStatus = result.healthy ? "healthy" : "degraded";
    const detail = result.healthy
      ? "Provider is responding."
      : result.reason ?? "Provider reported an issue.";

    logger.info("provider_health_check", {
      providerId,
      status,
      latencyMs,
      detail,
    });

    return { providerId, status, latencyMs, checkedAt: new Date().toISOString(), detail };
  } catch (error) {
    if (timeout) clearTimeout(timeout);
    const latencyMs = Date.now() - started;
    const isTimeout = (error as Error)?.message === "HEALTH_CHECK_TIMEOUT";
    const status: ProviderHealthStatus = isTimeout ? "unavailable" : "degraded";
    // Adapter exceptions are untrusted and may contain request URLs or credential-derived text.
    const detail = isTimeout
      ? `Health check timed out after ${timeoutMs}ms.`
      : "Provider availability probe failed.";

    logger.warn("provider_health_check_failed", {
      providerId,
      status,
      latencyMs,
      reason: isTimeout ? "timeout" : "probe_error",
    });

    return { providerId, status, latencyMs, checkedAt: new Date().toISOString(), detail };
  }
}

/**
 * Run health checks against all registered providers.
 * Returns results for each — a failure in one does not prevent checking the others.
 */
export async function checkAllProvidersHealth(
  registry: ProviderRegistry,
  logger: Logger,
  options: HealthCheckOptions = {}
): Promise<HealthCheckResult[]> {
  const entries = registry.list();
  const results: HealthCheckResult[] = [];

  for (const entry of entries) {
    if (!entry.enabled) {
      results.push({
        providerId: entry.providerId,
        status: "disabled",
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        detail: "Provider is disabled.",
      });
      registry.recordHealthCheck(entry.providerId, "disabled");
      continue;
    }

    // Simulation providers are always healthy — no network call needed.
    if (entry.simulation) {
      results.push({
        providerId: entry.providerId,
        status: "healthy",
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        detail: "Simulation provider — no external dependency.",
      });
      registry.recordHealthCheck(entry.providerId, "healthy");
      continue;
    }

    const provider = registry.getProvider(entry.providerId);
    if (!provider) continue;

    const result = await checkProviderHealth(provider, logger, options);
    registry.recordHealthCheck(entry.providerId, result.status, result.detail);
    results.push(result);
  }

  return results;
}

/**
 * Internal probe — calls the provider's available() method.
 * Production providers will override this with a real API ping.
 * In this phase, the probe is the available() check — future adapters
 * can implement actual HTTP pings to their vendor's status endpoint.
 */
async function runHealthProbe(provider: TelephonyProvider): Promise<{
  healthy: boolean;
  reason?: string;
}> {
  const isAvailable = provider.available();
  return {
    healthy: isAvailable,
    reason: isAvailable ? undefined : "Provider reported unavailable.",
  };
}
