-- Agent unit economics: per-user LLM vendor cost attribution, a durable
-- Stripe revenue ledger, and period indexes for platform-admin aggregation.

ALTER TABLE "llm_vendor_costs" ADD COLUMN "userId" TEXT;

CREATE INDEX "llm_vendor_costs_org_user_deleted_created_at_idx"
  ON "llm_vendor_costs"("organizationId", "userId", "isDeleted", "createdAt" DESC);

CREATE INDEX "llm_vendor_costs_deleted_created_at_idx"
  ON "llm_vendor_costs"("isDeleted", "createdAt" DESC);

CREATE INDEX "media_vendor_costs_deleted_created_at_idx"
  ON "media_vendor_costs"("isDeleted", "createdAt" DESC);

CREATE INDEX "credit_transactions_deleted_category_created_at_idx"
  ON "credit_transactions"("isDeleted", "category", "createdAt" DESC);

CREATE TABLE "billing_revenue_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT,
  "source" TEXT NOT NULL,
  "stripeObjectId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_revenue_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_revenue_events_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "billing_revenue_events_stripeObjectId_key"
  ON "billing_revenue_events"("stripeObjectId");

CREATE INDEX "billing_revenue_events_deleted_occurred_at_idx"
  ON "billing_revenue_events"("isDeleted", "occurredAt" DESC);

CREATE INDEX "billing_revenue_events_org_deleted_occurred_at_idx"
  ON "billing_revenue_events"("organizationId", "isDeleted", "occurredAt" DESC);
