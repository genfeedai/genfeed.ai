-- Creator earnings (#9715): the part of a wallet received from other
-- organizations. Constant default, so Postgres adds it without a rewrite.
ALTER TABLE "credit_balances"
  ADD COLUMN "earnedBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;
