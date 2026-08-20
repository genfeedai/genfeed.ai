-- Model selection keys remain globally stable. Provider + endpoint is the
-- upstream identity, allowing Fal and Replicate to share owner/model names.
BEGIN;

ALTER TABLE "models" ADD COLUMN "endpoint" TEXT;

UPDATE "models"
SET "endpoint" = "key"
WHERE "endpoint" IS NULL;

ALTER TABLE "models" ALTER COLUMN "endpoint" SET NOT NULL;

CREATE UNIQUE INDEX "models_provider_endpoint_key" ON "models"("provider", "endpoint");

COMMIT;
