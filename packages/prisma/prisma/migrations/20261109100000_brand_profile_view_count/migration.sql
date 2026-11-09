-- Public profile views at genfeed.ai/@handle: one per visitor a day.
ALTER TABLE "brands" ADD COLUMN "profileViewCount" INTEGER NOT NULL DEFAULT 0;
