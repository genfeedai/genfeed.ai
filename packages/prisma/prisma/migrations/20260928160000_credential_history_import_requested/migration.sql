-- #5485: "Import existing posts" is chosen per account when it is connected,
-- not once per brand. The choice lives on the pending credential created at
-- connect and is read by the post-connect import scheduler.
ALTER TABLE "credentials"
  ADD COLUMN "isHistoryImportRequested" BOOLEAN NOT NULL DEFAULT true;

-- Backfill first: a brand that had turned the import off keeps it off for
-- its existing accounts (a reconnect reuses the stored choice). Without this,
-- dropping the brand column would silently opt those accounts back in.
UPDATE "credentials" AS c
SET "isHistoryImportRequested" = false
FROM "brands" AS b
WHERE c."brandId" = b."id"
  AND b."isSocialHistoryImportEnabled" = false;

ALTER TABLE "brands" DROP COLUMN "isSocialHistoryImportEnabled";
