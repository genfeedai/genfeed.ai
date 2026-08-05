-- Canonicalize model registry fields that were temporarily stored in config
-- during the MongoDB-to-PostgreSQL migration. After this migration, config is
-- reserved for provider-specific payload only.

ALTER TABLE "models"
ADD COLUMN "key" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "provider" TEXT,
ADD COLUMN "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "costPerUnit" DOUBLE PRECISION,
ADD COLUMN "minCost" DOUBLE PRECISION,
ADD COLUMN "providerCostUsd" DOUBLE PRECISION,
ADD COLUMN "inputCostPerMillionTokens" DOUBLE PRECISION,
ADD COLUMN "outputCostPerMillionTokens" DOUBLE PRECISION,
ADD COLUMN "margin" DOUBLE PRECISION,
ADD COLUMN "pricingType" TEXT,
ADD COLUMN "costTier" TEXT,
ADD COLUMN "qualityTier" TEXT,
ADD COLUMN "speedTier" TEXT,
ADD COLUMN "aspectRatios" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "durations" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "recommendedFor" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "supportsFeatures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "defaultAspectRatio" TEXT,
ADD COLUMN "defaultDuration" INTEGER,
ADD COLUMN "maxDimensions" JSONB,
ADD COLUMN "minDimensions" JSONB,
ADD COLUMN "maxOutputs" INTEGER,
ADD COLUMN "maxReferences" INTEGER,
ADD COLUMN "hasAudioToggle" BOOLEAN,
ADD COLUMN "hasDurationEditing" BOOLEAN,
ADD COLUMN "hasEndFrame" BOOLEAN,
ADD COLUMN "hasInterpolation" BOOLEAN,
ADD COLUMN "hasResolutionOptions" BOOLEAN,
ADD COLUMN "hasSpeech" BOOLEAN,
ADD COLUMN "isBatchSupported" BOOLEAN,
ADD COLUMN "isImagenModel" BOOLEAN,
ADD COLUMN "isReferencesMandatory" BOOLEAN,
ADD COLUMN "usesOrientation" BOOLEAN,
ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isDiscovered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isLegacy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "isDeprecated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deprecatedAt" TIMESTAMP(3),
ADD COLUMN "discoveredAt" TIMESTAMP(3),
ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedBy" TEXT,
ADD COLUMN "reviewStatus" TEXT,
ADD COLUMN "rejectionReason" TEXT,
ADD COLUMN "predecessorOf" TEXT,
ADD COLUMN "succeededBy" TEXT,
ADD COLUMN "trigger" TEXT,
ADD COLUMN "triggerWord" TEXT;

UPDATE "models"
SET
  "key" = COALESCE(NULLIF("config"->>'key', ''), NULLIF("externalId", ''), 'legacy/' || "id"),
  "label" = COALESCE(NULLIF("label", ''), NULLIF("config"->>'label', ''), NULLIF("config"->>'key', ''), "id"),
  "category" = COALESCE(NULLIF("category", ''), NULLIF("config"->>'category', ''), 'image'),
  "description" = NULLIF("config"->>'description', ''),
  "provider" = COALESCE(NULLIF("config"->>'provider', ''), 'unknown'),
  "cost" = CASE WHEN "config"->>'cost' ~ '^-?[0-9]+(?:\.[0-9]+)?$' THEN ("config"->>'cost')::DOUBLE PRECISION ELSE 0 END,
  "costPerUnit" = CASE WHEN "config"->>'costPerUnit' ~ '^-?[0-9]+(?:\.[0-9]+)?$' THEN ("config"->>'costPerUnit')::DOUBLE PRECISION END,
  "minCost" = CASE WHEN "config"->>'minCost' ~ '^-?[0-9]+(?:\.[0-9]+)?$' THEN ("config"->>'minCost')::DOUBLE PRECISION END,
  "providerCostUsd" = CASE WHEN "config"->>'providerCostUsd' ~ '^-?[0-9]+(?:\.[0-9]+)?$' THEN ("config"->>'providerCostUsd')::DOUBLE PRECISION END,
  "inputCostPerMillionTokens" = CASE WHEN "config"->>'inputCostPerMillionTokens' ~ '^-?[0-9]+(?:\.[0-9]+)?$' THEN ("config"->>'inputCostPerMillionTokens')::DOUBLE PRECISION END,
  "outputCostPerMillionTokens" = CASE WHEN "config"->>'outputCostPerMillionTokens' ~ '^-?[0-9]+(?:\.[0-9]+)?$' THEN ("config"->>'outputCostPerMillionTokens')::DOUBLE PRECISION END,
  "margin" = CASE WHEN "config"->>'margin' ~ '^-?[0-9]+(?:\.[0-9]+)?$' THEN ("config"->>'margin')::DOUBLE PRECISION END,
  "pricingType" = NULLIF("config"->>'pricingType', ''),
  "costTier" = NULLIF("config"->>'costTier', ''),
  "qualityTier" = NULLIF("config"->>'qualityTier', ''),
  "speedTier" = NULLIF("config"->>'speedTier', ''),
  "aspectRatios" = CASE WHEN jsonb_typeof("config"->'aspectRatios') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text("config"->'aspectRatios')) ELSE ARRAY[]::TEXT[] END,
  "capabilities" = CASE WHEN jsonb_typeof("config"->'capabilities') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text("config"->'capabilities')) ELSE ARRAY[]::TEXT[] END,
  "durations" = CASE WHEN jsonb_typeof("config"->'durations') = 'array' THEN ARRAY(SELECT value::INTEGER FROM jsonb_array_elements_text("config"->'durations') AS value WHERE value ~ '^[0-9]+$') ELSE ARRAY[]::INTEGER[] END,
  "recommendedFor" = CASE WHEN jsonb_typeof("config"->'recommendedFor') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text("config"->'recommendedFor')) ELSE ARRAY[]::TEXT[] END,
  "supportsFeatures" = CASE WHEN jsonb_typeof("config"->'supportsFeatures') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text("config"->'supportsFeatures')) ELSE ARRAY[]::TEXT[] END,
  "defaultAspectRatio" = NULLIF("config"->>'defaultAspectRatio', ''),
  "defaultDuration" = CASE WHEN "config"->>'defaultDuration' ~ '^[0-9]+$' THEN ("config"->>'defaultDuration')::INTEGER END,
  "maxDimensions" = "config"->'maxDimensions',
  "minDimensions" = "config"->'minDimensions',
  "maxOutputs" = CASE WHEN "config"->>'maxOutputs' ~ '^[0-9]+$' THEN ("config"->>'maxOutputs')::INTEGER END,
  "maxReferences" = CASE WHEN "config"->>'maxReferences' ~ '^[0-9]+$' THEN ("config"->>'maxReferences')::INTEGER END,
  "hasAudioToggle" = CASE WHEN "config"->>'hasAudioToggle' IN ('true', 'false') THEN ("config"->>'hasAudioToggle')::BOOLEAN END,
  "hasDurationEditing" = CASE WHEN "config"->>'hasDurationEditing' IN ('true', 'false') THEN ("config"->>'hasDurationEditing')::BOOLEAN END,
  "hasEndFrame" = CASE WHEN "config"->>'hasEndFrame' IN ('true', 'false') THEN ("config"->>'hasEndFrame')::BOOLEAN END,
  "hasInterpolation" = CASE WHEN "config"->>'hasInterpolation' IN ('true', 'false') THEN ("config"->>'hasInterpolation')::BOOLEAN END,
  "hasResolutionOptions" = CASE WHEN "config"->>'hasResolutionOptions' IN ('true', 'false') THEN ("config"->>'hasResolutionOptions')::BOOLEAN END,
  "hasSpeech" = CASE WHEN "config"->>'hasSpeech' IN ('true', 'false') THEN ("config"->>'hasSpeech')::BOOLEAN END,
  "isBatchSupported" = CASE WHEN "config"->>'isBatchSupported' IN ('true', 'false') THEN ("config"->>'isBatchSupported')::BOOLEAN END,
  "isImagenModel" = CASE WHEN "config"->>'isImagenModel' IN ('true', 'false') THEN ("config"->>'isImagenModel')::BOOLEAN END,
  "isReferencesMandatory" = CASE WHEN "config"->>'isReferencesMandatory' IN ('true', 'false') THEN ("config"->>'isReferencesMandatory')::BOOLEAN END,
  "usesOrientation" = CASE WHEN "config"->>'usesOrientation' IN ('true', 'false') THEN ("config"->>'usesOrientation')::BOOLEAN END,
  "isDefault" = CASE WHEN "config"->>'isDefault' IN ('true', 'false') THEN ("config"->>'isDefault')::BOOLEAN ELSE false END,
  "isDiscovered" = CASE WHEN "config"->>'isDiscovered' IN ('true', 'false') THEN ("config"->>'isDiscovered')::BOOLEAN ELSE false END,
  "isHighlighted" = CASE WHEN "config"->>'isHighlighted' IN ('true', 'false') THEN ("config"->>'isHighlighted')::BOOLEAN ELSE false END,
  "isLegacy" = CASE WHEN "config"->>'isLegacy' IN ('true', 'false') THEN ("config"->>'isLegacy')::BOOLEAN ELSE false END,
  "isPublic" = CASE WHEN "config"->>'isPublic' IN ('true', 'false') THEN ("config"->>'isPublic')::BOOLEAN ELSE true END,
  "isDeprecated" = CASE WHEN "config"->>'isDeprecated' IN ('true', 'false') THEN ("config"->>'isDeprecated')::BOOLEAN ELSE false END,
  "deprecatedAt" = CASE WHEN "config"->>'deprecatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN ("config"->>'deprecatedAt')::TIMESTAMP(3) END,
  "discoveredAt" = CASE WHEN "config"->>'discoveredAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN ("config"->>'discoveredAt')::TIMESTAMP(3) END,
  "lastSyncedAt" = CASE WHEN "config"->>'lastSyncedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN ("config"->>'lastSyncedAt')::TIMESTAMP(3) END,
  "reviewedAt" = CASE WHEN "config"->>'reviewedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN ("config"->>'reviewedAt')::TIMESTAMP(3) END,
  "reviewedBy" = NULLIF("config"->>'reviewedBy', ''),
  "reviewStatus" = NULLIF("config"->>'reviewStatus', ''),
  "rejectionReason" = NULLIF("config"->>'rejectionReason', ''),
  "predecessorOf" = NULLIF("config"->>'predecessorOf', ''),
  "succeededBy" = NULLIF("config"->>'succeededBy', ''),
  "trigger" = NULLIF("config"->>'trigger', ''),
  "triggerWord" = NULLIF("config"->>'triggerWord', '');

UPDATE "models"
SET "config" = COALESCE("config"->'providerConfig', '{}'::JSONB) ||
  ("config"
    - 'aspectRatios' - 'capabilities' - 'category' - 'cost' - 'costPerUnit'
    - 'costTier' - 'defaultAspectRatio' - 'defaultDuration' - 'deprecatedAt'
    - 'description' - 'discoveredAt' - 'durations' - 'hasAudioToggle'
    - 'hasDurationEditing' - 'hasEndFrame' - 'hasInterpolation'
    - 'hasResolutionOptions' - 'hasSpeech' - 'inputCostPerMillionTokens'
    - 'isBatchSupported' - 'isDefault' - 'isDeprecated' - 'isDiscovered'
    - 'isHighlighted' - 'isImagenModel' - 'isLegacy' - 'isPublic'
    - 'isReferencesMandatory' - 'key' - 'label' - 'lastSyncedAt' - 'margin'
    - 'maxDimensions' - 'maxOutputs' - 'maxReferences' - 'minCost'
    - 'minDimensions' - 'organization' - 'outputCostPerMillionTokens'
    - 'parentModel' - 'predecessorOf' - 'pricingType' - 'provider'
    - 'providerConfig' - 'providerCostUsd' - 'qualityTier' - 'recommendedFor'
    - 'rejectionReason' - 'reviewedAt' - 'reviewedBy' - 'reviewStatus'
    - 'speedTier' - 'succeededBy' - 'supportsFeatures' - 'training' - 'trigger'
    - 'triggerWord' - 'usesOrientation');

ALTER TABLE "models"
ALTER COLUMN "key" SET NOT NULL,
ALTER COLUMN "label" SET NOT NULL,
ALTER COLUMN "category" SET NOT NULL,
ALTER COLUMN "provider" SET NOT NULL;

WITH ranked_defaults AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId", "category"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id"
    ) AS rank
  FROM "models"
  WHERE "isDefault" = true AND "isDeleted" = false
)
UPDATE "models"
SET "isDefault" = false
FROM ranked_defaults
WHERE "models"."id" = ranked_defaults."id" AND ranked_defaults.rank > 1;

CREATE UNIQUE INDEX "models_key_key" ON "models"("key");
CREATE INDEX "models_category_isActive_isDeleted_idx" ON "models"("category", "isActive", "isDeleted");
CREATE INDEX "models_provider_isActive_isDeleted_idx" ON "models"("provider", "isActive", "isDeleted");

CREATE UNIQUE INDEX "models_global_default_category_key"
ON "models"("category")
WHERE "isDefault" = true AND "isDeleted" = false AND "organizationId" IS NULL;

CREATE UNIQUE INDEX "models_org_default_category_key"
ON "models"("organizationId", "category")
WHERE "isDefault" = true AND "isDeleted" = false AND "organizationId" IS NOT NULL;
