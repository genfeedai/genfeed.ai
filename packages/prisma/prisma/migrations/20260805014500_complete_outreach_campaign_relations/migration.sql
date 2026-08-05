ALTER TABLE "outreach_campaigns"
ADD COLUMN "credentialId" TEXT;

UPDATE "outreach_campaigns" AS campaign
SET "brandId" = brand."id"
FROM "brands" AS brand
WHERE campaign."brandId" = brand."mongoId";

UPDATE "outreach_campaigns" AS campaign
SET "brandId" = NULL
WHERE campaign."brandId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "brands" AS brand
    WHERE brand."id" = campaign."brandId"
  );

UPDATE "outreach_campaigns" AS campaign
SET "credentialId" = credential."id"
FROM "credentials" AS credential
WHERE campaign."config"->>'credential' IN (
  credential."id",
  credential."mongoId"
);

UPDATE "outreach_campaigns"
SET "config" = "config" - ARRAY[
  'brand',
  'credential',
  'organization',
  'user'
];

ALTER TABLE "outreach_campaigns"
ADD CONSTRAINT "outreach_campaigns_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "brands"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "outreach_campaigns"
ADD CONSTRAINT "outreach_campaigns_credentialId_fkey"
FOREIGN KEY ("credentialId") REFERENCES "credentials"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "outreach_campaigns_brandId_isDeleted_idx"
ON "outreach_campaigns"("brandId", "isDeleted");

CREATE INDEX "outreach_campaigns_credentialId_isDeleted_idx"
ON "outreach_campaigns"("credentialId", "isDeleted");
