-- Minutes after the parent post goes live before a thread child publishes.
-- Null (and 0) keeps the historical behaviour: the follow-up goes out with the
-- parent, in `order`.
ALTER TABLE "posts" ADD COLUMN "threadDelayMinutes" INTEGER;

-- The delayed-comment sweep looks up children of a published parent that are
-- still scheduled and now due.
CREATE INDEX "posts_thread_child_due_idx"
  ON "posts" ("isDeleted", "parentId", "targetExecutionState", "scheduledDate");
