import type {
  ControlCenterStatus,
  PlatformProviderControlCenterDto,
  ProviderHealthControlResultDto,
  TelephonyProviderControlDto,
} from "../../shared/contracts";
import type { Logger } from "../lib/observability";
import { checkProviderHealth } from "../telephony/healthCheck";
import type { ProviderRegistry, RegistryEntryDto } from "../telephony/registry";
import type { ConnectorService } from "./connectors";

export function telephonyControlStatus(entry: RegistryEntryDto): ControlCenterStatus {
  if (!entry.enabled || entry.state === "disabled" || entry.health === "disabled") return "UNAVAILABLE";
  if (!entry.simulation && !entry.credentialsConfigured) return "NOT_CONFIGURED";
  if (entry.state === "unavailable" || entry.health === "unavailable") return "UNAVAILABLE";
  if (entry.state === "degraded" || entry.health === "degraded") return "DEGRADED";
  if (entry.state === "active" && (entry.health === "healthy" || (entry.simulation && entry.health === "unknown"))) {
    return "CONNECTED";
  }
  return "UNKNOWN";
}

export function toTelephonyProviderControl(entry: RegistryEntryDto): TelephonyProviderControlDto {
  return {
    id: entry.providerId,
    name: entry.label,
    kind: "telephony",
    status: telephonyControlStatus(entry),
    enabled: entry.enabled,
    isDefault: entry.isDefault,
    simulation: entry.simulation,
    transport: entry.transport,
    credentialsConfigured: entry.credentialsConfigured,
    webhookConfigured: entry.webhookConfigured,
    capabilities: { ...entry.capabilities },
    lastHealthCheck: entry.lastHealthCheck,
  };
}

export async function platformProviderControlCenter(
  registry: ProviderRegistry,
  connectors: ConnectorService
): Promise<PlatformProviderControlCenterDto> {
  return {
    telephonyProviders: registry.list().map(toTelephonyProviderControl),
    connectorProviders: await connectors.listControlProviders(),
    generatedAt: new Date().toISOString(),
  };
}

/** Runs the registered adapter's availability probe and records the result in the live registry. */
export async function testTelephonyProvider(
  registry: ProviderRegistry,
  providerId: string,
  logger: Logger
): Promise<ProviderHealthControlResultDto | undefined> {
  const entry = registry.get(providerId);
  if (!entry) return undefined;
  if (!entry.enabled) {
    registry.recordHealthCheck(providerId, "disabled");
    return { providerId, status: "UNAVAILABLE", latencyMs: 0, checkedAt: new Date().toISOString() };
  }

  const result = await checkProviderHealth(entry.provider, logger);
  registry.recordHealthCheck(providerId, result.status, result.detail);
  const refreshed = registry.list().find((provider) => provider.providerId === providerId);
  return {
    providerId,
    status: refreshed ? telephonyControlStatus(refreshed) : "UNKNOWN",
    latencyMs: result.latencyMs,
    checkedAt: result.checkedAt,
  };
}
