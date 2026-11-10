-- The file a brand logo or banner was uploaded as (#9706): its format and
-- nominal size, plus the storage key of a sanitized SVG original.
ALTER TABLE "assets" ADD COLUMN "originalFormat" TEXT;
ALTER TABLE "assets" ADD COLUMN "originalWidth" INTEGER;
ALTER TABLE "assets" ADD COLUMN "originalHeight" INTEGER;
ALTER TABLE "assets" ADD COLUMN "vectorObjectKey" TEXT;
