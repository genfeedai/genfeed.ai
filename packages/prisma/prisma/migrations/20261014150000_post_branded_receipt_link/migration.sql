-- Account and thread generation links each draft to its branded generation
-- receipt (#5786). Both columns are nullable and unindexed: they are written
-- once per generated post and only read with the post.
ALTER TABLE "posts" ADD COLUMN "brandedReceiptId" TEXT;

ALTER TABLE "posts" ADD COLUMN "brandedReceiptState" TEXT;
