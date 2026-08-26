-- Brand-scoped named Look presets for the consolidated Studio composer.
-- Ownership always comes from the authenticated organization, active brand,
-- and canonical user id; Look rows are shared inside that brand.

CREATE TABLE "studio_looks" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "assetType" TEXT NOT NULL,
  "promptTemplate" TEXT NOT NULL DEFAULT '',
  "style" TEXT NOT NULL DEFAULT '',
  "mood" TEXT NOT NULL DEFAULT '',
  "scene" TEXT NOT NULL DEFAULT '',
  "camera" TEXT NOT NULL DEFAULT '',
  "lens" TEXT NOT NULL DEFAULT '',
  "lighting" TEXT NOT NULL DEFAULT '',
  "cameraMovement" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "studio_looks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "studio_looks_asset_type_check"
    CHECK ("assetType" IN ('image', 'video')),
  CONSTRAINT "studio_looks_image_camera_movement_check"
    CHECK ("assetType" = 'video' OR "cameraMovement" IS NULL),
  CONSTRAINT "studio_looks_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "studio_looks_brandId_organizationId_fkey"
    FOREIGN KEY ("brandId", "organizationId")
    REFERENCES "brands"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "studio_looks_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "studio_looks_scope_created_idx"
  ON "studio_looks"(
    "organizationId",
    "brandId",
    "isDeleted",
    "createdAt" DESC,
    "id" DESC
  );
