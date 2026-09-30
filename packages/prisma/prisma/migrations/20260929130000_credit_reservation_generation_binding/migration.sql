-- Async generation holds settle from the reservation on completion (#5657): a
-- hold records what it pays for and is found by the output it is bound to.

ALTER TABLE "credit_reservations"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "source" TEXT,
  ADD COLUMN "metadata" JSONB;

CREATE INDEX "credit_reservations_workloadType_workloadId_organizationId_idx"
  ON "credit_reservations" ("workloadType", "workloadId", "organizationId");

-- No wallet hold for BYOK; persist completion usage linkage separately.
ALTER TABLE "ingredients" ADD COLUMN "generationBilling" JSONB;
