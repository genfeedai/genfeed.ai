-- Server-side idea generation for Studio Batch projects (#5463): idea batches
-- start from an accepted credit quote bound to the project revision, and each
-- item records its quote line, reservation and settlement state.

ALTER TABLE "batch_projects" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "batch_projects" ADD COLUMN "quote" JSONB;

ALTER TABLE "batch_project_items" ADD COLUMN "dispatch" JSONB;
