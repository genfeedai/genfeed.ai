-- Community gallery counters (#9670): views and Recreate clicks on public
-- images and videos, each counted once a day per visitor.
ALTER TABLE "ingredients" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ingredients" ADD COLUMN "recreateCount" INTEGER NOT NULL DEFAULT 0;
