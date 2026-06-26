-- Canonical SEO scorer (#758): per-entity SEO score + structured scorecard.
-- Additive and backward-compatible (both columns nullable, no defaults).

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "seoScore" DOUBLE PRECISION;
ALTER TABLE "articles" ADD COLUMN     "seoBreakdown" JSONB;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "seoScore" DOUBLE PRECISION;
ALTER TABLE "posts" ADD COLUMN     "seoBreakdown" JSONB;
