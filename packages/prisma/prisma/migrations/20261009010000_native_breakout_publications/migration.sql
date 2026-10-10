ALTER TABLE "post_exposure_observations" ALTER COLUMN "postId" DROP NOT NULL;
ALTER TABLE "post_exposure_observations" ADD COLUMN "nativeSourcePostId" TEXT;
ALTER TABLE "post_exposure_observations" ADD CONSTRAINT "post_exposure_observations_native_source_scope_fkey" FOREIGN KEY ("nativeSourcePostId", "organizationId", "brandId") REFERENCES "source_posts"("id", "organizationId", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "post_exposure_observations" ADD CONSTRAINT "post_exposure_observations_exact_source_check" CHECK (("postId" IS NOT NULL)::int + ("nativeSourcePostId" IS NOT NULL)::int = 1);
ALTER TABLE "breakout_responses" ALTER COLUMN "sourcePostId" DROP NOT NULL;
ALTER TABLE "breakout_responses" ADD COLUMN "nativeSourcePostId" TEXT;
ALTER TABLE "breakout_responses" ADD CONSTRAINT "breakout_responses_native_source_scope_fkey" FOREIGN KEY ("nativeSourcePostId", "organizationId", "brandId") REFERENCES "source_posts"("id", "organizationId", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "breakout_responses" ADD CONSTRAINT "breakout_responses_exact_source_check" CHECK (("sourcePostId" IS NOT NULL)::int + ("nativeSourcePostId" IS NOT NULL)::int = 1);
CREATE INDEX "post_exposure_observations_native_source_idx" ON "post_exposure_observations"("organizationId", "nativeSourcePostId", "isDeleted", "receivedAt" DESC);
