-- #5485: "Import existing posts" is chosen per account when it is connected,
-- not once per brand. The choice lives on the pending credential created at
-- connect and is read by the post-connect import scheduler. NULL means no
-- choice was made (connects outside the integrations page), which imports.
ALTER TABLE "credentials"
  ADD COLUMN "isHistoryImportRequested" BOOLEAN;

-- A brand that had turned the import off keeps it off for its existing
-- accounts (a reconnect reuses the stored choice).
UPDATE "credentials" AS c
SET "isHistoryImportRequested" = false
FROM "brands" AS b
WHERE c."brandId" = b."id"
  AND b."isSocialHistoryImportEnabled" = false;

-- "brands"."isSocialHistoryImportEnabled" is no longer read or written but is
-- kept this release: migrations run before the rollout, and the previous API
-- and workers still select it. A follow-up release drops it (#5495).
