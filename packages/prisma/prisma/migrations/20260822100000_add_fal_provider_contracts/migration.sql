-- Fal schemas and pricing are immutable provider snapshots. Model execution
-- remains pinned to reviewed fields while synchronization writes candidates.
BEGIN;

ALTER TABLE "models"
  ADD COLUMN "reviewedProviderContractVersion" TEXT,
  ADD COLUMN "pendingProviderContractVersion" TEXT,
  ADD COLUMN "providerSchemaFamily" TEXT,
  ADD COLUMN "providerInputSchema" JSONB,
  ADD COLUMN "providerSyncStatus" TEXT,
  ADD COLUMN "providerSchemaSyncedAt" TIMESTAMP(3),
  ADD COLUMN "providerPricingSyncedAt" TIMESTAMP(3),
  ADD COLUMN "providerSyncFailedAt" TIMESTAMP(3),
  ADD COLUMN "providerSyncFailureCode" TEXT;

CREATE TABLE "model_provider_contracts" (
  "id" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "openapiVersion" TEXT,
  "openapi" JSONB NOT NULL,
  "inputSchema" JSONB NOT NULL,
  "outputSchema" JSONB NOT NULL,
  "schemaFamily" TEXT,
  "pricing" JSONB NOT NULL,
  "currency" TEXT,
  "billingUnit" TEXT,
  "unitPrice" TEXT,
  "unitPriceMicros" BIGINT,
  "conditionalDimensions" JSONB NOT NULL DEFAULT '{}',
  "pricingType" TEXT,
  "mappingStatus" TEXT NOT NULL,
  "unsupportedReason" TEXT,
  "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "model_provider_contracts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "model_provider_contracts_modelId_fkey"
    FOREIGN KEY ("modelId") REFERENCES "models"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "model_provider_contracts_identity_version_key"
  ON "model_provider_contracts"("provider", "endpoint", "version");

CREATE INDEX "model_provider_contracts_model_review_discovered_idx"
  ON "model_provider_contracts"("modelId", "reviewStatus", "discoveredAt" DESC);

COMMIT;
