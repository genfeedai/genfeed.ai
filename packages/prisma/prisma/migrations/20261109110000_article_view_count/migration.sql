-- Readers of the public article page, counted once a day per visitor (#9663).
ALTER TABLE "articles" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
