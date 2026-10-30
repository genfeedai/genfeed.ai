-- #8695: a brand can place its watermark at a size and inset given as ratios of
-- the canvas width. NULL keeps the previous behaviour (fit inside 30% x 12%,
-- 2.5% margin of the shorter side).
ALTER TABLE "brands"
  ADD COLUMN "watermarkSizeRatio" DOUBLE PRECISION,
  ADD COLUMN "watermarkInsetXRatio" DOUBLE PRECISION,
  ADD COLUMN "watermarkInsetYRatio" DOUBLE PRECISION;
