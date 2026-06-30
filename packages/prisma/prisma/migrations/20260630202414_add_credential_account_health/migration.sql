ALTER TABLE "credentials"
ADD COLUMN "warmupState" TEXT NOT NULL DEFAULT 'not_started',
ADD COLUMN "warmupScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "warmupRiskLevel" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "warmupSignals" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "warmupThresholds" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "warmupAssessedAt" TIMESTAMP(3),
ADD COLUMN "warmupHoldReason" TEXT,
ADD COLUMN "warmupManualOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "warmupOverrideReason" TEXT,
ADD COLUMN "warmupOverrideUntil" TIMESTAMP(3),
ADD COLUMN "warmupOverrideConfirmedAt" TIMESTAMP(3),
ADD COLUMN "warmupOverrideConfirmedByUserId" TEXT;

CREATE INDEX "credentials_warmup_state_idx"
ON "credentials"("organizationId", "brandId", "isDeleted", "warmupState");
