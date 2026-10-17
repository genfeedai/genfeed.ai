-- Thumbs up/down on a branded generation (#5786), kept beside the immutable
-- receipt. One row per (receipt, member); a re-rating updates it and a
-- withdrawal soft-deletes it. A new table, so no backfill.
CREATE TABLE "branded_generation_feedback" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "rating" TEXT NOT NULL,
  "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "branded_generation_feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "branded_generation_feedback_rating_check" CHECK ("rating" IN ('up', 'down'))
);

CREATE UNIQUE INDEX "branded_generation_feedback_receipt_actor_key" ON "branded_generation_feedback"("receiptId", "actorId");

CREATE INDEX "branded_generation_feedback_scope_idx" ON "branded_generation_feedback"("organizationId", "brandId", "isDeleted", "createdAt" DESC);

ALTER TABLE "branded_generation_feedback" ADD CONSTRAINT "branded_generation_feedback_receipt_scope_fkey" FOREIGN KEY ("receiptId", "organizationId", "brandId") REFERENCES "branded_generation_receipts"("id", "organizationId", "brandId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "branded_generation_feedback" ADD CONSTRAINT "branded_generation_feedback_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
