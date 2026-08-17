-- Per-generation media vendor cost ledger (companion to llm_vendor_costs, #2361).
-- Micro-USD integers derived from Model.providerCostUsd × realized output units.

CREATE TABLE IF NOT EXISTS "media_vendor_costs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "ingredientId" TEXT,
    "units" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "pricingType" TEXT,
    "vendorCostMicros" INTEGER NOT NULL DEFAULT 0,
    "isByok" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_vendor_costs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_vendor_costs_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "media_vendor_costs_org_deleted_created_at_idx"
  ON "media_vendor_costs" ("organizationId", "isDeleted", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "media_vendor_costs_org_deleted_model_created_at_idx"
  ON "media_vendor_costs" ("organizationId", "isDeleted", "model", "createdAt" DESC);
