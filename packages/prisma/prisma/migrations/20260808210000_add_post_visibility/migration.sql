-- Expand phase for #2641. Existing rows intentionally remain NULL until the
-- dry-run-first visibility backfill classifies their legacy status safely.
ALTER TABLE "posts" ADD COLUMN "visibility" TEXT;

ALTER TABLE "posts"
  ADD CONSTRAINT "posts_visibility_check"
  CHECK (
    "visibility" IS NULL
    OR "visibility" IN ('public', 'private', 'unlisted')
  );

-- New code writes targetExecutionState explicitly. Keep the legacy read-only
-- projection from inventing a scheduled lifecycle for newly-created drafts.
ALTER TABLE "posts" ALTER COLUMN "status" SET DEFAULT 'draft';
