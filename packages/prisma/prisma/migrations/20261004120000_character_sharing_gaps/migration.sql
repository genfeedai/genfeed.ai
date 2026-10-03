-- Record an owning-brand move in the character audit trail (#6040).
-- Rows written by availability changes leave both columns NULL.

ALTER TABLE "persona_availability_audits"
  ADD COLUMN "previousOwningBrandId" TEXT,
  ADD COLUMN "newOwningBrandId" TEXT;
