-- Persist the generation-facing meaning of brand reference images (#3539).
-- Display-name inspection is retained only for this one-time legacy backfill;
-- runtime orchestration reads the typed column exclusively.

CREATE TYPE "ReferenceImageCategory" AS ENUM (
  'FACE',
  'PRODUCT',
  'STYLE',
  'LOGO'
);

ALTER TABLE "assets"
ADD COLUMN "referenceCategory" "ReferenceImageCategory";

UPDATE "assets"
SET "referenceCategory" = CASE
  WHEN lower(COALESCE("displayName", '')) ~ '(product|packshot|merch)' THEN 'PRODUCT'::"ReferenceImageCategory"
  WHEN lower(COALESCE("displayName", '')) ~ '(face|character|person|persona)' THEN 'FACE'::"ReferenceImageCategory"
  WHEN lower(COALESCE("displayName", '')) ~ '(logo|wordmark|logomark)' THEN 'LOGO'::"ReferenceImageCategory"
  ELSE 'STYLE'::"ReferenceImageCategory"
END
WHERE "category" = 'REFERENCE'::"AssetCategory"
  AND "referenceCategory" IS NULL;
