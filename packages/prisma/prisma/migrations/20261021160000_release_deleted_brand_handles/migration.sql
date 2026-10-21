-- Keep soft-deleted brands and their relations, but release their public handles.
BEGIN;

ALTER TABLE "brands" ADD COLUMN "deletedSlug" TEXT;

UPDATE "brands"
SET "deletedSlug" = "slug",
    "slug" = 'deleted-' || gen_random_uuid()::text,
    "updatedAt" = (now() AT TIME ZONE 'UTC')
WHERE "isDeleted" = true;

COMMIT;
