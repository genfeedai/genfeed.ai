-- Every brand has one built-in Genfeed profile channel: its profile at
-- genfeed.ai/@handle. New brands get it when they are created; this gives
-- every existing brand its channel. The unique index keeps it to one per
-- brand, including a channel a member later removed (soft-deleted rows keep
-- the key, so a removed channel is not recreated).
CREATE UNIQUE INDEX "credentials_genfeed_profile_brand_key"
  ON "credentials" ("organizationId", "brandId")
  WHERE "platform" = 'GENFEED';

INSERT INTO "credentials" (
  "id",
  "organizationId",
  "brandId",
  "userId",
  "platform",
  "externalId",
  "externalHandle",
  "label",
  "isConnected",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  b."organizationId",
  b."id",
  b."userId",
  'GENFEED',
  b."id",
  b."slug",
  'Genfeed profile',
  true,
  CURRENT_TIMESTAMP
FROM "brands" b
WHERE NOT b."isDeleted"
ON CONFLICT DO NOTHING;
