-- Align persisted usage events with the runtime writers used by the voice engine.
-- PostgreSQL enum additions are idempotent so partially upgraded environments remain deployable.
ALTER TYPE "UsageEventType" ADD VALUE IF NOT EXISTS 'TURN_TELEMETRY';
ALTER TYPE "UsageEventType" ADD VALUE IF NOT EXISTS 'PROVIDER_FALLBACK';
