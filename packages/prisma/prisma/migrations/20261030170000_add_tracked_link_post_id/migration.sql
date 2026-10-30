-- Tie a short link to the scheduled post it was created for, so clicks roll up per post.
ALTER TABLE "tracked_links" ADD COLUMN "postId" TEXT;

ALTER TABLE "tracked_links"
  ADD CONSTRAINT "tracked_links_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tracked_links_org_post_idx" ON "tracked_links"("organizationId", "postId", "isDeleted");
