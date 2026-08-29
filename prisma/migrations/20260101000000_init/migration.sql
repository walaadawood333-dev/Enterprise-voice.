-- CenterAI initial schema. Mirrors prisma/schema.prisma.
-- Apply with `npx prisma migrate deploy` (or `prisma db push` during development).

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED');
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');
CREATE TYPE "Industry" AS ENUM ('BANKING', 'FINANCE', 'HEALTHCARE', 'LEGAL', 'ENTERPRISE_SERVICES');
CREATE TYPE "AgentLanguage" AS ENUM ('EN', 'AR', 'JO');
CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "SessionStatus" AS ENUM ('CREATED', 'ACTIVE', 'COMPLETED', 'FAILED');
CREATE TYPE "EngineMode" AS ENUM ('DEMO', 'PRODUCTION');
CREATE TYPE "VoiceEngine" AS ENUM ('DEMO', 'OPENAI');
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
CREATE TYPE "UsageEventType" AS ENUM (
  'VOICE_SESSION','MESSAGE','AI_REQUEST','CHARACTERS','AUDIO_SECONDS',
  'INPUT_MESSAGES','OUTPUT_MESSAGES','SESSION_STARTED','SESSION_ENDED','SESSION_COMPLETED','SESSION_FAILED'
);

-- CreateTable
CREATE TABLE "organizations" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" "OrgStatus" NOT NULL DEFAULT 'TRIAL',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "password_hash" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agents" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "industry" "Industry" NOT NULL DEFAULT 'BANKING',
  "language" "AgentLanguage" NOT NULL DEFAULT 'EN',
  "voice" TEXT NOT NULL DEFAULT 'layla-service',
  "system_prompt" TEXT NOT NULL DEFAULT '',
  "welcome_message" TEXT NOT NULL DEFAULT '',
  "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_sessions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "user_id" TEXT,
  "language" "AgentLanguage" NOT NULL,
  "status" "SessionStatus" NOT NULL DEFAULT 'CREATED',
  "mode" "EngineMode" NOT NULL DEFAULT 'DEMO',
  "engine" "VoiceEngine" NOT NULL DEFAULT 'DEMO',
  "test_mode" BOOLEAN NOT NULL DEFAULT false,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "duration_seconds" INTEGER,

  CONSTRAINT "voice_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "role" "MessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "latency_ms" INTEGER,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "usage_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "session_id" TEXT,
  "event_type" "UsageEventType" NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "agents_organization_id_name_key" ON "agents"("organization_id", "name");
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");
CREATE INDEX "agents_organization_id_status_idx" ON "agents"("organization_id", "status");
CREATE INDEX "voice_sessions_organization_id_started_at_idx" ON "voice_sessions"("organization_id", "started_at");
CREATE INDEX "voice_sessions_organization_id_status_idx" ON "voice_sessions"("organization_id", "status");
CREATE INDEX "voice_sessions_agent_id_idx" ON "voice_sessions"("agent_id");
CREATE INDEX "messages_session_id_idx" ON "messages"("session_id");
CREATE INDEX "messages_organization_id_created_at_idx" ON "messages"("organization_id", "created_at");
CREATE INDEX "usage_events_organization_id_created_at_idx" ON "usage_events"("organization_id", "created_at");
CREATE INDEX "usage_events_organization_id_event_type_idx" ON "usage_events"("organization_id", "event_type");
CREATE INDEX "usage_events_session_id_idx" ON "usage_events"("session_id");

-- Foreign keys
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "voice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "voice_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
