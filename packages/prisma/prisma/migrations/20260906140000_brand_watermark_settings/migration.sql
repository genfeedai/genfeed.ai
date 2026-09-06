ALTER TABLE "brands"
  ADD COLUMN "watermarkText" TEXT,
  ADD COLUMN "watermarkLogoId" TEXT,
  ADD COLUMN "watermarkOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
  ADD COLUMN "watermarkPosition" TEXT NOT NULL DEFAULT 'bottom-right';

-- NOT VALID enforces the check on new writes immediately without scanning
-- existing "brands" rows; the follow-up migration validates existing rows.
ALTER TABLE "brands" ADD CONSTRAINT "brands_watermark_opacity_check" CHECK ("watermarkOpacity" >= 0.05 AND "watermarkOpacity" <= 1) NOT VALID;
ALTER TABLE "brands" ADD CONSTRAINT "brands_watermark_position_check" CHECK ("watermarkPosition" IN ('top-left', 'top-right', 'bottom-left', 'bottom-right')) NOT VALID;
