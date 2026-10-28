ALTER TABLE "brands"
  ADD COLUMN "endCardAssetId" TEXT,
  ADD COLUMN "endCardDurationSeconds" DOUBLE PRECISION NOT NULL DEFAULT 3,
  ADD COLUMN "isEndCardEnabled" BOOLEAN NOT NULL DEFAULT false;

-- NOT VALID enforces the check on new writes immediately without scanning
-- existing "brands" rows.
ALTER TABLE "brands" ADD CONSTRAINT "brands_end_card_duration_check" CHECK ("endCardDurationSeconds" >= 1 AND "endCardDurationSeconds" <= 10) NOT VALID;
