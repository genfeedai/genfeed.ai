-- Fastlane: org-level enablement flag + post origin label.
-- Both additive and backward-compatible (boolean defaults false; source is nullable).

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "isFastlaneEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "source" TEXT;
