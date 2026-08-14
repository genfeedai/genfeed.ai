-- Guided social-account warm-up enrollments, checklist audit events, and
-- readiness signals (#2214). Distinct from admin warmup_accounts.

CREATE TYPE "SocialWarmupEnrollmentState" AS ENUM (
  'ENROLLED',
  'IN_PROGRESS',
  'PAUSED',
  'GRADUATED',
  'BLOCKED',
  'DISCONNECTED'
);

CREATE TYPE "SocialWarmupEventAction" AS ENUM ('COMPLETED', 'REOPENED');

CREATE TYPE "SocialWarmupSignalStatus" AS ENUM (
  'AVAILABLE',
  'EMPTY',
  'STALE',
  'UNAVAILABLE',
  'PERMISSION_LIMITED',
  'FAILED',
  'MISSING',
  'REVOKED'
);

CREATE TYPE "SocialWarmupSignalSource" AS ENUM ('PLATFORM', 'GENFEED', 'USER');

CREATE TABLE "social_warmup_enrollments" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "blueprintId" TEXT NOT NULL,
  "blueprintVersion" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentPhaseId" TEXT NOT NULL,
  "state" "SocialWarmupEnrollmentState" NOT NULL DEFAULT 'ENROLLED',
  "enrolledByUserId" TEXT NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "social_warmup_enrollments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_warmup_enrollments_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "social_warmup_enrollments_brandId_organizationId_fkey"
    FOREIGN KEY ("brandId", "organizationId")
    REFERENCES "brands"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "social_warmup_enrollments_credentialId_fkey"
    FOREIGN KEY ("credentialId") REFERENCES "credentials"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "social_warmup_enrollments_enrolledByUserId_fkey"
    FOREIGN KEY ("enrolledByUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "social_warmup_enrollments_id_scope_key"
  ON "social_warmup_enrollments"("id", "organizationId", "brandId");
CREATE UNIQUE INDEX "social_warmup_enrollments_org_credential_alive_key"
  ON "social_warmup_enrollments"("organizationId", "credentialId")
  WHERE "isDeleted" = false;
CREATE INDEX "social_warmup_enrollments_scope_credential_idx"
  ON "social_warmup_enrollments"("organizationId", "brandId", "credentialId", "isDeleted");
CREATE INDEX "social_warmup_enrollments_scope_state_idx"
  ON "social_warmup_enrollments"("organizationId", "brandId", "isDeleted", "state");

CREATE TABLE "social_warmup_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "provenance" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" "SocialWarmupEventAction" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "social_warmup_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_warmup_events_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "social_warmup_events_brandId_organizationId_fkey"
    FOREIGN KEY ("brandId", "organizationId")
    REFERENCES "brands"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "social_warmup_events_enrollment_scope_fkey"
    FOREIGN KEY ("enrollmentId", "organizationId", "brandId")
    REFERENCES "social_warmup_enrollments"("id", "organizationId", "brandId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "social_warmup_events_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "social_warmup_events_scope_enrollment_idx"
  ON "social_warmup_events"("organizationId", "brandId", "enrollmentId", "occurredAt");
CREATE INDEX "social_warmup_events_item_idx"
  ON "social_warmup_events"("organizationId", "enrollmentId", "itemId", "occurredAt");

CREATE TABLE "social_warmup_signals" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3),
  "staleAt" TIMESTAMP(3),
  "status" "SocialWarmupSignalStatus" NOT NULL,
  "source" "SocialWarmupSignalSource" NOT NULL,
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "social_warmup_signals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_warmup_signals_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "social_warmup_signals_brandId_organizationId_fkey"
    FOREIGN KEY ("brandId", "organizationId")
    REFERENCES "brands"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "social_warmup_signals_enrollment_scope_fkey"
    FOREIGN KEY ("enrollmentId", "organizationId", "brandId")
    REFERENCES "social_warmup_enrollments"("id", "organizationId", "brandId")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "social_warmup_signals_id_scope_key"
  ON "social_warmup_signals"("id", "organizationId", "brandId");
CREATE UNIQUE INDEX "social_warmup_signals_enrollment_key_alive_key"
  ON "social_warmup_signals"("enrollmentId", "key")
  WHERE "isDeleted" = false;
CREATE INDEX "social_warmup_signals_scope_key_idx"
  ON "social_warmup_signals"("organizationId", "brandId", "enrollmentId", "key", "isDeleted");
