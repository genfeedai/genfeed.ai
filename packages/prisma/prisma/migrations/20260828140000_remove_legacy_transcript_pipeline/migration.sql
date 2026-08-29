UPDATE "articles"
SET "category" = 'article'
WHERE "category" = 'transcript';

DROP TABLE IF EXISTS "transcripts";
