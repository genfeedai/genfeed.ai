-- Durable retry source for a batch settlement deduction that failed after the
-- JSON credit ledger was already claimed. NULL means there is no collectible
-- shortfall; the stored amount remains durable through collection and is
-- cleared only after a successful, idempotent deduction.
-- The seq pins the marker to the settlement occurrence that produced it, so a
-- retry reuses that occurrence's idempotency reference and can never collide
-- with (or double-bill) a different occurrence's charge.
ALTER TABLE "batches"
ADD COLUMN "settlementShortfall" DOUBLE PRECISION,
ADD COLUMN "settlementShortfallSeq" INTEGER;

-- The platform sweep scans across organizations for positive markers. Keep the
-- soft-delete predicate first to match its bounded query shape.
CREATE INDEX "batches_deleted_settlement_shortfall_idx"
ON "batches" ("isDeleted", "settlementShortfall");
