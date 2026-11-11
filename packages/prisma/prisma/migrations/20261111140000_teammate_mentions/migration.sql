-- Teammate @-mentions on agent messages and task comments (#9946, part of #8606).
--
-- A message or comment now records the canonical `users.id` of every teammate
-- it mentions, never a display name. The API validates each id before the row
-- is written (active member of the organization, reaches the brand, can open
-- the thread), so the column only ever holds ids that passed that check.
--
-- Adding a column with a constant default does not rewrite the table and takes
-- only a brief lock, so nothing here needs a backfill or a separate validate
-- step. Existing rows read as "no mentions".

ALTER TABLE "agent_messages"
  ADD COLUMN "mentionedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "task_comments"
  ADD COLUMN "mentionedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
