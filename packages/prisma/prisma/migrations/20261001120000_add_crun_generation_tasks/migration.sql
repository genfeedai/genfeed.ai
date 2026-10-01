-- Additive only: disabling admissions must preserve accepted-task recovery.
CREATE TABLE "crun_generation_tasks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "brandId" TEXT,
    "reservationId" TEXT,
    "fundingBinding" JSONB NOT NULL,
    "modelKey" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "outputIndex" INTEGER NOT NULL,
    "inputHash" TEXT NOT NULL,
    "inputMetadata" JSONB NOT NULL,
    "quoteSnapshot" JSONB NOT NULL,
    "credentialSource" TEXT NOT NULL,
    "credentialId" TEXT,
    "credentialFingerprint" TEXT NOT NULL,
    "providerTaskId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'prepared',
    "submittedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "nextPollAt" TIMESTAMP(3),
    "pollCount" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "terminalReceipt" JSONB,
    "failureCode" TEXT,
    "recoveryCode" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "mediaPersistedAt" TIMESTAMP(3),
    "billingRecordedAt" TIMESTAMP(3),
    "vendorCostRecordedAt" TIMESTAMP(3),
    "copyAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crun_generation_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crun_tasks_funding_binding_check" CHECK (COALESCE(
        ("credentialSource" = 'hosted' AND "fundingBinding"->>'kind' = 'reservation' AND "reservationId" IS NOT NULL)
        OR ("credentialSource" = 'hosted' AND "fundingBinding"->>'kind' = 'free' AND "reservationId" IS NULL)
        OR ("credentialSource" = 'byok' AND "fundingBinding"->>'kind' = 'byok' AND "reservationId" IS NULL), false))
);

CREATE UNIQUE INDEX "crun_tasks_org_ingredient_key" ON "crun_generation_tasks" ("organizationId", "ingredientId");
CREATE UNIQUE INDEX "crun_tasks_org_quote_output_key" ON "crun_generation_tasks" ("organizationId", "quoteId", "outputIndex");
CREATE UNIQUE INDEX "crun_tasks_credential_provider_task_key" ON "crun_generation_tasks" ("credentialFingerprint", "providerTaskId");
CREATE INDEX "crun_tasks_due_idx" ON "crun_generation_tasks" ("isDeleted", "state", "nextPollAt");
CREATE INDEX "crun_tasks_reservation_idx" ON "crun_generation_tasks" ("organizationId", "reservationId", "isDeleted");
