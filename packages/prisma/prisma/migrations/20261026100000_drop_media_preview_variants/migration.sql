-- Plan-based preview derivatives are gone: orgs are served signed originals, and
-- only public-share / public-og / public-social derivatives are prepared. The
-- 'preview' rows are dead cache entries (prepared bytes are re-creatable and
-- nothing reads them), so remove them and stop the table accepting the purpose.
DELETE FROM "media_delivery_variants" WHERE "purpose" = 'preview';

ALTER TABLE "media_delivery_variants" DROP CONSTRAINT IF EXISTS "media_delivery_variant_purpose";
ALTER TABLE "media_delivery_variants"
  ADD CONSTRAINT "media_delivery_variant_purpose"
  CHECK ("purpose" IN ('public-share', 'public-og', 'public-social'));
