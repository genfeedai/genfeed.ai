-- Per-hold provider-recovery backoff so unknown-status holds cannot starve others (#6168).
-- Additive: one nullable column and one column with a constant default; no row rewrite.

ALTER TABLE "credit_reservations" ADD COLUMN "recoveryNextAttemptAt" TIMESTAMP(3);
ALTER TABLE "credit_reservations" ADD COLUMN "recoveryAttempts" INTEGER NOT NULL DEFAULT 0;
