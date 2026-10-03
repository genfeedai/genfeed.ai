-- Reclassify rows that were still UNKNOWN when they were written (#6010).
--
-- During a rolling deploy the migration runs before the services roll, so an
-- old task inserts uploads with the default origin and no classification
-- receipt: a direct video upload or a presigned upload is created PROCESSING,
-- and completion later only sets the storage fields and status UPLOADED. The
-- INSERT trigger could not classify such a row, and the UPDATE trigger only
-- reacts to an explicit write of `origin`, so it stayed UNKNOWN forever.
--
-- A BEFORE UPDATE trigger now classifies a row that is UNKNOWN before and after
-- the update with the same `ingredients_classify_origin` rules, so it becomes
-- UPLOADED, IMPORTED or GENERATED as soon as its status or receipt fields make
-- it classifiable. A known origin is untouched, and `ingredients_origin_immutable`
-- still rejects any change out of a known origin.
--
-- The backfill is re-run (it is idempotent) for rows that landed on UNKNOWN and
-- were completed between the first backfill and this migration. The count per
-- outcome is reported as a NOTICE.

CREATE FUNCTION "ingredients_origin_on_update"() RETURNS trigger AS $$
BEGIN
  IF OLD."origin" = 'UNKNOWN' AND NEW."origin" = 'UNKNOWN' THEN
    NEW."origin" := "ingredients_classify_origin"(
      NEW."bookmarkId", NEW."sourceActionId", NEW."providerData", NEW."generationPrompt",
      NEW."modelUsed", NEW."generationSource", NEW."status"
    );
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ingredients_origin_on_update"
  BEFORE UPDATE ON "ingredients"
  FOR EACH ROW
  WHEN (OLD."origin" = 'UNKNOWN')
  EXECUTE FUNCTION "ingredients_origin_on_update"();

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

  RAISE NOTICE 'ingredient origin reclassify (#6010): imported=%, generated=%, uploaded=%, unknown=%',
    imported_count, generated_count, uploaded_count, unknown_count;
END
$$;
