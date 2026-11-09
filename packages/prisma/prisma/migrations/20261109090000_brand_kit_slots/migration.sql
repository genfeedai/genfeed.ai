-- Brand kit slots (#9705, #9707). A brand holds several logos, one per
-- variant, and one image per platform slot. Existing rows keep a null slot,
-- which reads as LOGO_PRIMARY (logos) or BANNER_MASTER (banners), so single-
-- logo brands keep their logo as the primary variant without a backfill.

-- CreateEnum
CREATE TYPE "BrandKitSlot" AS ENUM ('LOGO_PRIMARY', 'LOGO_ICON', 'LOGO_WORDMARK', 'LOGO_LIGHT', 'LOGO_DARK', 'LOGO_MONOCHROME', 'BANNER_MASTER', 'X_HEADER', 'X_PROFILE', 'YOUTUBE_BANNER', 'YOUTUBE_PROFILE', 'LINKEDIN_COVER', 'LINKEDIN_LOGO', 'FACEBOOK_COVER', 'FACEBOOK_PROFILE');

-- AlterTable
ALTER TABLE "assets" ADD COLUMN "kitSlot" "BrandKitSlot";
