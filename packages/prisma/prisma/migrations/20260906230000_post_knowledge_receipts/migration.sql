-- Generated posts keep the Knowledge source versions that shaped them so the
-- Library and reviewers can trace an output back to its sources after purge.
ALTER TABLE "posts" ADD COLUMN "knowledgeReceipts" JSONB NOT NULL DEFAULT '[]';
