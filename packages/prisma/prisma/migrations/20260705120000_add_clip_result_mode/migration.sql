-- Extend clip-results with a generation-mode discriminator (#1239, epic #1234).
-- Additive + backward compatible: `mode` is NOT NULL with a DEFAULT of 'avatar', so
-- every existing avatar clip-result is backfilled to 'avatar' by the DEFAULT with no
-- data migration. Raw-cut results set 'raw-cut' going forward.
ALTER TABLE "clip_results" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'avatar';

-- Supports "list clip-results for an org by mode" (raw-cut vs avatar) without a
-- table scan. Plain (non-CONCURRENTLY) build is safe: `clip_results` is not a hot
-- write path and the column is brand-new, so the exclusive lock is momentary.
CREATE INDEX "clip_results_organizationId_mode_isDeleted_idx" ON "clip_results"("organizationId", "mode", "isDeleted");
