-- Agent and MCP drafts were saved with no account, so their page showed a
-- gray platform letter instead of the account's picture and handle. Bind each
-- unbound draft to the brand's only connected account on its platform. A
-- brand with none, or with several, keeps its drafts unbound.
UPDATE "posts" AS p
SET "credentialId" = c."id"
FROM (
  SELECT
    "organizationId",
    "brandId",
    lower("platform"::text) AS "platform",
    min("id") AS "id"
  FROM "credentials"
  WHERE "isConnected" = true
    AND "isDeleted" = false
    AND "organizationId" IS NOT NULL
    AND "brandId" IS NOT NULL
  GROUP BY "organizationId", "brandId", lower("platform"::text)
  HAVING count(*) = 1
) AS c
WHERE p."credentialId" IS NULL
  AND p."isDeleted" = false
  AND p."targetExecutionState" = 'draft'
  AND p."organizationId" = c."organizationId"
  AND p."brandId" = c."brandId"
  AND p."platform" = c."platform";
