-- Per-completion LLM vendor cost ledger (#2361).
-- Micro-USD integers; no prompt/completion content; no mongoId.

CREATE TABLE IF NOT EXISTS "llm_vendor_costs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "vendorCostMicros" INTEGER NOT NULL DEFAULT 0,
    "isByok" BOOLEAN NOT NULL DEFAULT false,
    "threadId" TEXT,
    "runId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_vendor_costs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "llm_vendor_costs_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "llm_vendor_costs_org_deleted_created_at_idx"
  ON "llm_vendor_costs" ("organizationId", "isDeleted", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "llm_vendor_costs_org_deleted_model_created_at_idx"
  ON "llm_vendor_costs" ("organizationId", "isDeleted", "model", "createdAt" DESC);
