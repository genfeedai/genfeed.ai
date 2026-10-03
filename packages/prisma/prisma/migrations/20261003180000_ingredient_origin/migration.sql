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
-- every creation path, and a row nobody classified is visible as Unknown
-- instead of being silently mislabelled.
--
-- Classification (one function, three users)
-- ------------------------------------------
-- `ingredients_classify_origin` holds the product rules, first match wins:
--   1. linked to an imported source: a bookmark, a page-capture media row
--      (`sourceActionId` `imported-source-media:*`, `providerData.sourceCaptureIngest`),
--      an imported-source record (`providerData.importedSource`) or an agent
--      source import (`sourceActionId` `agent-source:*`)        -> IMPORTED
--   2. carries a generation receipt (prompt, model or generation
--      source)                                                   -> GENERATED
--   3. UPLOADED status without a generation receipt              -> UPLOADED
--   4. anything else                                             -> UNKNOWN
-- The one-time backfill, the insert trigger below and any future reader share
-- it, so they cannot drift apart.
--
-- Backfill (one time, deterministic, idempotent)
-- ----------------------------------------------
-- Every existing row, trashed ones included, is classified. The count per
-- outcome is reported as a NOTICE.
--
-- Rolling deploys
-- ---------------
-- Migrations run before the services roll, so a task still on the old code
-- keeps inserting rows with the default UNKNOWN after the backfill. A BEFORE
-- INSERT trigger classifies a row that arrives as UNKNOWN with the same rules,
-- and the immutability trigger allows exactly one transition, UNKNOWN to a
-- known value, so a row that could not be classified at insert can still be
-- corrected once. A known origin can never change.

CREATE TYPE "IngredientOrigin" AS ENUM ('UPLOADED', 'GENERATED', 'IMPORTED', 'UNKNOWN');

ALTER TABLE "ingredients"
  ADD COLUMN "origin" "IngredientOrigin" NOT NULL DEFAULT 'UNKNOWN';

CREATE FUNCTION "ingredients_classify_origin"(
  "bookmarkId" TEXT,
  "sourceActionId" TEXT,
  "providerData" JSONB,
  "generationPrompt" TEXT,
  "modelUsed" TEXT,
  "generationSource" TEXT,
  "status" "IngredientStatus"
) RETURNS "IngredientOrigin" AS $$
  SELECT CASE
    WHEN btrim(coalesce("bookmarkId", '')) <> ''
      OR coalesce("sourceActionId", '') LIKE 'imported-source-media:%'
      OR coalesce("sourceActionId", '') LIKE 'agent-source:%'
      OR "providerData" -> 'sourceCaptureIngest' IS NOT NULL
      OR "providerData" -> 'importedSource' IS NOT NULL
      THEN 'IMPORTED'::"IngredientOrigin"
    WHEN btrim(coalesce("generationPrompt", '')) <> ''
      OR btrim(coalesce("modelUsed", '')) <> ''
      OR btrim(coalesce("generationSource", '')) <> ''
      THEN 'GENERATED'::"IngredientOrigin"
    WHEN "status" = 'UPLOADED' THEN 'UPLOADED'::"IngredientOrigin"
    ELSE 'UNKNOWN'::"IngredientOrigin"
  END
$$ LANGUAGE sql IMMUTABLE;

DO $$
DECLARE
  imported_count bigint;
  generated_count bigint;
  uploaded_count bigint;
  unknown_count bigint;
BEGIN
  UPDATE "ingredients" i
  SET "origin" = 'IMPORTED'
  WHERE i."origin" = 'UNKNOWN'
    AND "ingredients_classify_origin"(
      i."bookmarkId", i."sourceActionId", i."providerData", i."generationPrompt",
      i."modelUsed", i."generationSource", i."status"
    ) = 'IMPORTED';
  GET DIAGNOSTICS imported_count = ROW_COUNT;

  UPDATE "ingredients" i
  SET "origin" = 'GENERATED'
  WHERE i."origin" = 'UNKNOWN'
    AND "ingredients_classify_origin"(
      i."bookmarkId", i."sourceActionId", i."providerData", i."generationPrompt",
      i."modelUsed", i."generationSource", i."status"
    ) = 'GENERATED';
  GET DIAGNOSTICS generated_count = ROW_COUNT;

  UPDATE "ingredients" i
  SET "origin" = 'UPLOADED'
  WHERE i."origin" = 'UNKNOWN'
    AND "ingredients_classify_origin"(
      i."bookmarkId", i."sourceActionId", i."providerData", i."generationPrompt",
      i."modelUsed", i."generationSource", i."status"
    ) = 'UPLOADED';
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

CREATE FUNCTION "ingredients_origin_on_insert"() RETURNS trigger AS $$
BEGIN
  IF NEW."origin" = 'UNKNOWN' THEN
    NEW."origin" := "ingredients_classify_origin"(
      NEW."bookmarkId", NEW."sourceActionId", NEW."providerData", NEW."generationPrompt",
      NEW."modelUsed", NEW."generationSource", NEW."status"
    );
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ingredients_origin_on_insert"
  BEFORE INSERT ON "ingredients"
  FOR EACH ROW
  EXECUTE FUNCTION "ingredients_origin_on_insert"();

CREATE FUNCTION "ingredients_origin_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."origin" IS DISTINCT FROM OLD."origin" AND OLD."origin" <> 'UNKNOWN' THEN
    RAISE EXCEPTION 'ingredients.origin is immutable once known (#6010): % -> % on ingredient %',
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
