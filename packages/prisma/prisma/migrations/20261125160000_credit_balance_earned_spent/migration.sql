-- Creator earnings (#9780): earned credits that spends consumed and no refund
-- has restored yet. Constant default, so Postgres adds it without a rewrite.
ALTER TABLE "credit_balances"
  ADD COLUMN "earnedSpent" DOUBLE PRECISION NOT NULL DEFAULT 0;
