-- Permanent asset origin (#6010).
--
-- Every Library asset gets exactly one origin, decided when it is created and
-- never changed afterwards. It replaces inferring "what I uploaded" from
-- `status`, which moves as an asset renders and is reviewed (an uploaded file
-- and a generated image both end up VALIDATED).
--
-- Column
-- ------
-- `origin` is NOT NULL with a constant default, so adding it is a metadata-only
-- change. The default is UNKNOWN on purpose: the application sets origin on
-- every creation path, and a row that ever lands on the default is visible as
-- Unknown instead of being silently mislabelled.
--
-- Backfill (one time, deterministic, idempotent)
-- ----------------------------------------------
-- Every existing row, trashed ones included, is classified by the first rule
-- that matches:
--   1. linked to an imported source (a bookmark)                 -> IMPORTED
--   2. carries a generation receipt (prompt, model or generation
--      source)                                                   -> GENERATED
--   3. UPLOADED status without a generation receipt              -> UPLOADED
--   4. anything else                                             -> UNKNOWN
-- Imported is checked first, so an imported source that also carries generation
-- metadata stays Imported. The count per outcome is reported as a NOTICE.
--
-- Immutability
-- ------------
-- The trigger rejects any UPDATE that changes `origin`, so the guarantee does
-- not depend on every writer in the API remembering it. It is created after the
-- backfill, which is the only time origin is ever written to an existing row.

CREATE TYPE "IngredientOrigin" AS ENUM ('UPLOADED', 'GENERATED', 'IMPORTED', 'UNKNOWN');

ALTER TABLE "ingredients"
  ADD COLUMN "origin" "IngredientOrigin" NOT NULL DEFAULT 'UNKNOWN';

DO $$
DECLARE
  imported_count bigint;
  generated_count bigint;
  uploaded_count bigint;
  unknown_count bigint;
BEGIN
  UPDATE "ingredients"
  SET "origin" = 'IMPORTED'
  WHERE "origin" = 'UNKNOWN'
    AND btrim(coalesce("bookmarkId", '')) <> '';
  GET DIAGNOSTICS imported_count = ROW_COUNT;

  UPDATE "ingredients"
  SET "origin" = 'GENERATED'
  WHERE "origin" = 'UNKNOWN'
    AND (
      btrim(coalesce("generationPrompt", '')) <> ''
      OR btrim(coalesce("modelUsed", '')) <> ''
      OR btrim(coalesce("generationSource", '')) <> ''
    );
  GET DIAGNOSTICS generated_count = ROW_COUNT;

  UPDATE "ingredients"
  SET "origin" = 'UPLOADED'
  WHERE "origin" = 'UNKNOWN'
    AND "status" = 'UPLOADED';
  GET DIAGNOSTICS uploaded_count = ROW_COUNT;

  SELECT count(*) INTO unknown_count
  FROM "ingredients"
  WHERE "origin" = 'UNKNOWN';

  RAISE NOTICE 'ingredient origin backfill (#6010): imported=%, generated=%, uploaded=%, unknown=%',
    imported_count, generated_count, uploaded_count, unknown_count;
END
$$;

CREATE INDEX "ingredients_org_origin_created_at_idx"
  ON "ingredients" ("organizationId", "origin", "isDeleted", "createdAt" DESC);

CREATE FUNCTION "ingredients_origin_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."origin" IS DISTINCT FROM OLD."origin" THEN
    RAISE EXCEPTION 'ingredients.origin is immutable (#6010): % -> % on ingredient %',
      OLD."origin", NEW."origin", OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ingredients_origin_immutable"
  BEFORE UPDATE OF "origin" ON "ingredients"
  FOR EACH ROW
  EXECUTE FUNCTION "ingredients_origin_immutable"();
