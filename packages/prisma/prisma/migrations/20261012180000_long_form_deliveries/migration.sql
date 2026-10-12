-- Composer Articles and Newsletters deliver to connected long-form accounts (#6753).
-- A delivery is an ordinary release target Post linked back to its source:
-- Articles already use `entityArticleId`; Newsletters get the same link.
ALTER TYPE "PostEntityModel" ADD VALUE IF NOT EXISTS 'NEWSLETTER';

ALTER TABLE "posts" ADD COLUMN "entityNewsletterId" TEXT;

ALTER TABLE "posts" ADD CONSTRAINT "posts_entityNewsletterId_fkey" FOREIGN KEY ("entityNewsletterId") REFERENCES "newsletters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "posts_org_entity_article_idx" ON "posts"("organizationId", "entityArticleId");

CREATE INDEX "posts_org_entity_newsletter_idx" ON "posts"("organizationId", "entityNewsletterId");

-- The live URL a user records after publishing outside Genfeed.
ALTER TABLE "articles" ADD COLUMN "externalUrl" TEXT;

ALTER TABLE "newsletters" ADD COLUMN "externalUrl" TEXT;
