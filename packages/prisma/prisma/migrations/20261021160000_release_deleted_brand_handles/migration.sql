-- Keep soft-deleted brands and their relations, but release their public handles.
BEGIN;

ALTER TABLE "brands" ADD COLUMN "deletedSlug" TEXT;

-- Old API instances can still delete brands between this migration and rollout.
-- Updated instances supply both fields themselves; preserve those values.
CREATE FUNCTION release_deleted_brand_handle() RETURNS trigger AS $$
BEGIN
  NEW."deletedSlug" := OLD."slug";
  NEW."slug" := 'deleted-' || gen_random_uuid()::text;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER release_deleted_brand_handle
BEFORE UPDATE OF "isDeleted" ON "brands"
FOR EACH ROW
WHEN (NEW."isDeleted" = true AND NEW."deletedSlug" IS NULL)
EXECUTE FUNCTION release_deleted_brand_handle();

UPDATE "brands"
SET "deletedSlug" = "slug",
    "slug" = 'deleted-' || gen_random_uuid()::text,
    "updatedAt" = (now() AT TIME ZONE 'UTC')
WHERE "isDeleted" = true;

COMMIT;
