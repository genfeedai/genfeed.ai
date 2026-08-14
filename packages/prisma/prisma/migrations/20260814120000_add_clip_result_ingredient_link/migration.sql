-- Canonical Library asset for a ready clip result. Reuses rendered media
-- identity (s3Key/cdnUrl) instead of copying bytes. Nullable so a completed
-- clip can exist before (or after a failed) Library link.
ALTER TABLE "clip_results" ADD COLUMN "ingredientId" TEXT;

CREATE UNIQUE INDEX "clip_results_ingredientId_key"
ON "clip_results"("ingredientId");

CREATE INDEX "clip_results_organizationId_ingredientId_idx"
ON "clip_results"("organizationId", "ingredientId");

ALTER TABLE "clip_results"
ADD CONSTRAINT "clip_results_ingredientId_fkey"
FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
