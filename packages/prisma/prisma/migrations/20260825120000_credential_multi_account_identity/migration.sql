-- Credential identity becomes (brandId, platform, externalId) so one brand can hold
-- several accounts on the same platform. Partial unique cannot be represented in
-- schema.prisma — same pattern as 20260824120000_persona_handle_brand_unique.
--
-- Predicate notes:
--   isDeleted = false      → a disconnected account may be reconnected later.
--   externalId IS NOT NULL → pending rows (mid-OAuth, identity not yet resolved)
--                            and providers that never return an id stay unconstrained.
--
-- Legacy data already satisfies this (the old write path kept one row per
-- brand+platform), but the dedup below keeps the migration safe to replay: the most
-- recently updated live row per identity survives, older twins are soft-deleted.

UPDATE "credentials"
SET "externalId" = NULL, "updatedAt" = now()
WHERE "externalId" IS NOT NULL AND btrim("externalId") = '';

WITH ranked_identities AS (
  SELECT
    c."id",
    ROW_NUMBER() OVER (
      PARTITION BY c."brandId", c."platform", c."externalId"
      ORDER BY c."updatedAt" DESC, c."id" ASC
    ) AS rank
  FROM "credentials" c
  WHERE c."externalId" IS NOT NULL
    AND c."brandId" IS NOT NULL
    AND c."isDeleted" = false
)
UPDATE "credentials"
SET "isDeleted" = true, "updatedAt" = now()
FROM ranked_identities
WHERE "credentials"."id" = ranked_identities."id"
  AND ranked_identities.rank > 1;

CREATE UNIQUE INDEX "credentials_brand_platform_external_key"
ON "credentials" ("brandId", "platform", "externalId")
WHERE "isDeleted" = false AND "externalId" IS NOT NULL;

-- Account listing: every connected account for a brand + platform, oldest first.
CREATE INDEX IF NOT EXISTS "credentials_brand_platform_connected_idx"
ON "credentials" ("brandId", "platform", "isDeleted", "isConnected", "createdAt");

-- Stale-pending reaping at connect time.
CREATE INDEX IF NOT EXISTS "credentials_pending_reap_idx"
ON "credentials" ("brandId", "platform", "userId", "isConnected", "updatedAt")
WHERE "isDeleted" = false AND "externalId" IS NULL;
