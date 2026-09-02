/**
 * Provider Certification Checklist
 * 
 * Tracks certification status for telephony providers.
 * A provider cannot be considered production-ready until all required items are verified.
 * 
 * Certification Items:
 * 1. Authentication — Credential validation works
 * 2. Credential Security — Secrets never exposed
 * 3. Health Check — Provider health monitoring works
 * 4. Capability Detection — Capabilities correctly reported
 * 5. Inbound Webhook — Webhook endpoint receives events
 * 6. Webhook Signature Verification — Signature validation works
 * 7. Replay Protection — Duplicate events are rejected
 * 8. Idempotency — Events can be safely retried
 * 9. Inbound Call Lifecycle — Full lifecycle works
 * 10. Outbound Call Lifecycle — Call initiation works
 * 11. Call Status Synchronization — Status updates are consistent
 * 12. Media Capability — Media streaming works (if supported)
 * 13. Call Teardown — Hangup works correctly
 * 14. Error Handling — Errors are normalized correctly
 * 15. Rate Limit Handling — Rate limits are handled gracefully
 * 16. Timeout Handling — Timeouts are handled correctly
 * 17. Tenant Isolation — Multi-tenant security verified
 * 18. Observability — Logging and metrics work
 * 19. Sandbox Validation — Sandbox mode works (if supported)
 * 20. Production Guard — Production mode enforcement verified
 */

/**
 * Certification status for a single item.
 */
export interface CertificationItem {
  /** Item number (1-20) */
  number: number;
  /** Item name */
  name: string;
  /** Description of what this item verifies */
  description: string;
  /** Whether this item has been verified */
  verified: boolean;
  /** When this item was verified (ISO timestamp) */
  verifiedAt?: string;
  /** Who verified this item */
  verifiedBy?: string;
  /** Notes about the verification */
  notes?: string;
}

/**
 * Overall certification status for a provider.
 */
export type CertificationStatus =
  | "unavailable"        // Provider not available
  | "registered"         // Provider registered but not configured
  | "configuration_required" // Configuration incomplete
  | "configured"         // Configuration complete
  | "sandbox_ready"      // Ready for sandbox testing
  | "certification_pending" // Undergoing certification
  | "certified"          // All items verified
  | "production_ready"   // Ready for production
  | "active"             // Currently active in production
  | "degraded"           // Active but experiencing issues
  | "disabled";          // Administratively disabled

/**
 * Full certification record for a provider.
 */
export interface ProviderCertification {
  /** Provider identifier */
  providerId: string;
  /** Overall certification status */
  status: CertificationStatus;
  /** Individual certification items */
  items: CertificationItem[];
  /** Total number of items */
  totalItems: number;
  /** Number of verified items */
  verifiedItems: number;
  /** Percentage complete (0-100) */
  completionPercentage: number;
  /** When certification started */
  startedAt: string;
  /** When certification completed (if certified) */
  completedAt?: string;
  /** Last updated */
  updatedAt: string;
}

/**
 * Create a new certification record for a provider.
 */
export function createProviderCertification(providerId: string): ProviderCertification {
  const items: CertificationItem[] = [
    {
      number: 1,
      name: "Authentication",
      description: "Credential validation works correctly",
      verified: false,
    },
    {
      number: 2,
      name: "Credential Security",
      description: "Secrets are never exposed in logs, responses, or errors",
      verified: false,
    },
    {
      number: 3,
      name: "Health Check",
      description: "Provider health monitoring works correctly",
      verified: false,
    },
    {
      number: 4,
      name: "Capability Detection",
      description: "Capabilities are correctly reported and detected",
      verified: false,
    },
    {
      number: 5,
      name: "Inbound Webhook",
      description: "Webhook endpoint receives and processes events",
      verified: false,
    },
    {
      number: 6,
      name: "Webhook Signature Verification",
      description: "Webhook signature validation works correctly",
      verified: false,
    },
    {
      number: 7,
      name: "Replay Protection",
      description: "Duplicate events are detected and rejected",
      verified: false,
    },
    {
      number: 8,
      name: "Idempotency",
      description: "Events can be safely retried without side effects",
      verified: false,
    },
    {
      number: 9,
      name: "Inbound Call Lifecycle",
      description: "Full inbound call lifecycle works (created → ringing → answered → completed)",
      verified: false,
    },
    {
      number: 10,
      name: "Outbound Call Lifecycle",
      description: "Outbound call initiation and tracking works",
      verified: false,
    },
    {
      number: 11,
      name: "Call Status Synchronization",
      description: "Call status updates are consistent and accurate",
      verified: false,
    },
    {
      number: 12,
      name: "Media Capability",
      description: "Media streaming works correctly (if supported)",
      verified: false,
    },
    {
      number: 13,
      name: "Call Teardown",
      description: "Call hangup and cleanup works correctly",
      verified: false,
    },
    {
      number: 14,
      name: "Error Handling",
      description: "Errors are normalized and handled correctly",
      verified: false,
    },
    {
      number: 15,
      name: "Rate Limit Handling",
      description: "Rate limits are detected and handled gracefully",
      verified: false,
    },
    {
      number: 16,
      name: "Timeout Handling",
      description: "Timeouts are detected and handled correctly",
      verified: false,
    },
    {
      number: 17,
      name: "Tenant Isolation",
      description: "Multi-tenant security is verified — no cross-tenant access",
      verified: false,
    },
    {
      number: 18,
      name: "Observability",
      description: "Logging and metrics work correctly",
      verified: false,
    },
    {
      number: 19,
      name: "Sandbox Validation",
      description: "Sandbox mode works correctly (if supported)",
      verified: false,
    },
    {
      number: 20,
      name: "Production Guard",
      description: "Production mode enforcement is verified",
      verified: false,
    },
  ];

  return {
    providerId,
    status: "unavailable",
    items,
    totalItems: items.length,
    verifiedItems: 0,
    completionPercentage: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Mark a certification item as verified.
 */
export function verifyCertificationItem(
  certification: ProviderCertification,
  itemNumber: number,
  verifiedBy: string,
  notes?: string
): ProviderCertification {
  const item = certification.items.find((i) => i.number === itemNumber);
  if (!item) {
    throw new Error(`Certification item ${itemNumber} not found`);
  }

  item.verified = true;
  item.verifiedAt = new Date().toISOString();
  item.verifiedBy = verifiedBy;
  if (notes) {
    item.notes = notes;
  }

  // Update counts
  certification.verifiedItems = certification.items.filter((i) => i.verified).length;
  certification.completionPercentage = Math.round(
    (certification.verifiedItems / certification.totalItems) * 100
  );
  certification.updatedAt = new Date().toISOString();

  // Update status based on completion
  certification.status = calculateCertificationStatus(certification);

  return certification;
}

/**
 * Calculate certification status based on completion percentage.
 */
function calculateCertificationStatus(certification: ProviderCertification): CertificationStatus {
  const percentage = certification.completionPercentage;

  if (percentage === 100) {
    return "certified";
  } else if (percentage >= 80) {
    return "certification_pending";
  } else if (percentage >= 50) {
    return "sandbox_ready";
  } else if (percentage > 0) {
    return "configured";
  } else {
    return "unavailable";
  }
}

/**
 * Check if a provider is fully certified (100% complete).
 */
export function isProviderCertified(certification: ProviderCertification): boolean {
  return certification.completionPercentage === 100;
}

/**
 * Get a list of unverified certification items.
 */
export function getUnverifiedItems(certification: ProviderCertification): CertificationItem[] {
  return certification.items.filter((item) => !item.verified);
}

/**
 * Get a list of verified certification items.
 */
export function getVerifiedItems(certification: ProviderCertification): CertificationItem[] {
  return certification.items.filter((item) => item.verified);
}

/**
 * Create a summary of certification status (safe for logging).
 */
export function summarizeCertification(certification: ProviderCertification): {
  providerId: string;
  status: CertificationStatus;
  completionPercentage: number;
  verifiedItems: number;
  totalItems: number;
  unverifiedCount: number;
} {
  return {
    providerId: certification.providerId,
    status: certification.status,
    completionPercentage: certification.completionPercentage,
    verifiedItems: certification.verifiedItems,
    totalItems: certification.totalItems,
    unverifiedCount: certification.totalItems - certification.verifiedItems,
  };
}
