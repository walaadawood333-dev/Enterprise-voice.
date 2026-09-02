/**
 * Telephony Providers — Provider Adapter Infrastructure
 * 
 * This directory contains the infrastructure for building telephony provider adapters.
 * All production providers (Twilio, SignalWire, etc.) will extend these base classes.
 */

// Base class for production providers
export {
  ProductionTelephonyProviderBase,
  type ProductionProviderConfig,
  type ProviderHealthCheckResult,
} from "./base/ProductionTelephonyProviderBase";

// SignalWire provider
export { SignalWireProvider, type SignalWireConfig } from "./signalwire";

// Event normalization
export {
  normalizeProviderEvent,
  normalizeProviderEvents,
  type RawProviderEvent,
} from "./eventNormalizer";

// Error normalization
export {
  normalizeProviderError,
  createProviderError,
  isRetryableError,
  getUserFriendlyMessage,
  type ProviderError,
  type ProviderErrorCode,
} from "./errorNormalizer";

// Readiness validation
export {
  validateProviderReadiness,
  validateMultipleProvidersReadiness,
  hasProductionReadyProvider,
  type ReadinessCheck,
  type ReadinessCheckResult,
  type ReadinessConfig,
} from "./readinessValidator";

// Certification checklist
export {
  createProviderCertification,
  verifyCertificationItem,
  isProviderCertified,
  getUnverifiedItems,
  getVerifiedItems,
  summarizeCertification,
  type CertificationItem,
  type CertificationStatus,
  type ProviderCertification,
} from "./certificationChecklist";

// Activation gate
export {
  checkActivationGate,
  createActivationDiagnostic,
  type ActivationCheck,
  type ActivationGateConfig,
  type ActivationGateResult,
} from "./activationGate";

// Sandbox support
export {
  createDemoEnvironmentConfig,
  createSandboxEnvironmentConfig,
  createProductionEnvironmentConfig,
  determineProviderEnvironment,
  validateEnvironmentConfig,
  getEnvironmentLabel,
  environmentAllowsCalls,
  environmentRequiresCredentials,
  summarizeEnvironmentConfig,
  type ProviderEnvironment,
  type ProviderEnvironmentConfig,
} from "./sandboxSupport";
