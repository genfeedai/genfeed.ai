-- Normalize benchmark hot-path fields out of ad_performance.data so benchmark
-- endpoints can filter and aggregate in SQL instead of scanning JSON rows.

-- AlterTable
ALTER TABLE "ad_performance" ADD COLUMN     "headlineText" TEXT,
ADD COLUMN     "ctaText" TEXT,
ADD COLUMN     "adPlatform" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "scope" TEXT,
ADD COLUMN     "spend" DOUBLE PRECISION,
ADD COLUMN     "ctr" DOUBLE PRECISION,
ADD COLUMN     "roas" DOUBLE PRECISION,
ADD COLUMN     "cpc" DOUBLE PRECISION,
ADD COLUMN     "cpa" DOUBLE PRECISION,
ADD COLUMN     "performanceScore" DOUBLE PRECISION,
ADD COLUMN     "conversionRate" DOUBLE PRECISION,
ADD COLUMN     "dataConfidence" DOUBLE PRECISION,
ADD COLUMN     "spendBucket" TEXT,
ADD COLUMN     "headlinePatternCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ctaPatternCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill scalar mirrors from the legacy JSON payload.
UPDATE "ad_performance"
SET
  "headlineText" = NULLIF("data"->>'headlineText', ''),
  "ctaText" = NULLIF("data"->>'ctaText', ''),
  "adPlatform" = NULLIF("data"->>'adPlatform', ''),
  "industry" = NULLIF("data"->>'industry', ''),
  "scope" = NULLIF("data"->>'scope', ''),
  "spend" = CASE
    WHEN ("data"->>'spend') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN ("data"->>'spend')::DOUBLE PRECISION
    ELSE NULL
  END,
  "ctr" = CASE
    WHEN ("data"->>'ctr') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN ("data"->>'ctr')::DOUBLE PRECISION
    ELSE NULL
  END,
  "roas" = CASE
    WHEN ("data"->>'roas') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN ("data"->>'roas')::DOUBLE PRECISION
    ELSE NULL
  END,
  "cpc" = CASE
    WHEN ("data"->>'cpc') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN ("data"->>'cpc')::DOUBLE PRECISION
    ELSE NULL
  END,
  "cpa" = CASE
    WHEN ("data"->>'cpa') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN ("data"->>'cpa')::DOUBLE PRECISION
    ELSE NULL
  END,
  "performanceScore" = CASE
    WHEN ("data"->>'performanceScore') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN ("data"->>'performanceScore')::DOUBLE PRECISION
    ELSE NULL
  END,
  "conversionRate" = CASE
    WHEN ("data"->>'conversionRate') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN ("data"->>'conversionRate')::DOUBLE PRECISION
    ELSE NULL
  END,
  "dataConfidence" = CASE
    WHEN ("data"->>'dataConfidence') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN ("data"->>'dataConfidence')::DOUBLE PRECISION
    ELSE NULL
  END,
  "spendBucket" = CASE
    WHEN ("data"->>'spend') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN NULL
    WHEN ("data"->>'spend')::DOUBLE PRECISION <= 0 THEN NULL
    WHEN ("data"->>'spend')::DOUBLE PRECISION < 50 THEN '$0-50/day'
    WHEN ("data"->>'spend')::DOUBLE PRECISION < 200 THEN '$50-200/day'
    WHEN ("data"->>'spend')::DOUBLE PRECISION < 500 THEN '$200-500/day'
    WHEN ("data"->>'spend')::DOUBLE PRECISION < 1000 THEN '$500-1000/day'
    ELSE '$1000+/day'
  END,
  "headlinePatternCategories" = array_remove(ARRAY[
    CASE WHEN COALESCE("data"->>'headlineText', '') ~* '(^|[^[:alnum:]_])(get|save|earn|boost|improve|increase)([^[:alnum:]_]|$)' THEN 'benefit-focused' END,
    CASE WHEN COALESCE("data"->>'headlineText', '') ~* '(^|[^[:alnum:]_])(vs\.?|versus|compared|better than|unlike)([^[:alnum:]_]|$)' THEN 'comparison' END,
    CASE WHEN COALESCE("data"->>'headlineText', '') ~* '(^|[^[:alnum:]_])(secret|surprising|you won''t believe|revealed)([^[:alnum:]_]|$)' THEN 'curiosity-gap' END,
    CASE WHEN COALESCE("data"->>'headlineText', '') ~* '^how[[:space:]]+to([^[:alnum:]_]|$)' THEN 'how-to' END,
    CASE WHEN COALESCE("data"->>'headlineText', '') ~ '[0-9]+' THEN 'number-driven' END,
    CASE WHEN COALESCE("data"->>'headlineText', '') ~ '\?$' THEN 'question-based' END,
    CASE WHEN COALESCE("data"->>'headlineText', '') ~* '(^|[^[:alnum:]_])(review|rated|trusted|customers say)([^[:alnum:]_]|$)' THEN 'testimonial' END,
    CASE WHEN COALESCE("data"->>'headlineText', '') ~* '(^|[^[:alnum:]_])(limited|now|today|hurry|last chance|don''t miss|ends|expires)([^[:alnum:]_]|$)' THEN 'urgency' END
  ], NULL),
  "ctaPatternCategories" = array_remove(ARRAY[
    CASE WHEN COALESCE("data"->>'ctaText', '') ~* '(^|[^[:alnum:]_])(book|reserve|schedule)([^[:alnum:]_]|$)' THEN 'book-now' END,
    CASE WHEN COALESCE("data"->>'ctaText', '') ~* '(^|[^[:alnum:]_])(contact|call|reach out|get in touch)([^[:alnum:]_]|$)' THEN 'contact-us' END,
    CASE WHEN COALESCE("data"->>'ctaText', '') ~* '(^|[^[:alnum:]_])(download|install|get the app)([^[:alnum:]_]|$)' THEN 'download' END,
    CASE WHEN COALESCE("data"->>'ctaText', '') ~* '(^|[^[:alnum:]_])(get started|start|begin|try)([^[:alnum:]_]|$)' THEN 'get-started' END,
    CASE WHEN COALESCE("data"->>'ctaText', '') ~* '(^|[^[:alnum:]_])(learn more|find out|discover|explore)([^[:alnum:]_]|$)' THEN 'learn-more' END,
    CASE WHEN COALESCE("data"->>'ctaText', '') ~* '(^|[^[:alnum:]_])(shop|buy|order|purchase)([^[:alnum:]_]|$)' THEN 'shop-now' END,
    CASE WHEN COALESCE("data"->>'ctaText', '') ~* '(^|[^[:alnum:]_])(sign up|register|join|subscribe|create account)([^[:alnum:]_]|$)' THEN 'sign-up' END,
    CASE WHEN COALESCE("data"->>'ctaText', '') ~* '(^|[^[:alnum:]_])(free trial|try free|start free|no cost)([^[:alnum:]_]|$)' THEN 'try-free' END
  ], NULL);

-- CreateIndex
CREATE INDEX "ad_performance_isDeleted_scope_industry_idx" ON "ad_performance"("isDeleted", "scope", "industry");

-- CreateIndex
CREATE INDEX "ad_performance_isDeleted_scope_adPlatform_industry_idx" ON "ad_performance"("isDeleted", "scope", "adPlatform", "industry");

-- CreateIndex
CREATE INDEX "ad_performance_isDeleted_scope_spendBucket_adPlatform_industry_idx" ON "ad_performance"("isDeleted", "scope", "spendBucket", "adPlatform", "industry");

-- CreateIndex
CREATE INDEX "ad_performance_headlinePatternCategories_gin_idx" ON "ad_performance" USING GIN ("headlinePatternCategories");

-- CreateIndex
CREATE INDEX "ad_performance_ctaPatternCategories_gin_idx" ON "ad_performance" USING GIN ("ctaPatternCategories");
