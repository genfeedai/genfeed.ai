-- Rename Darkroom product fields/enums to Fleet.

ALTER TABLE "brands" RENAME COLUMN "isDarkroomEnabled" TO "isFleetEnabled";
ALTER TABLE "organization_settings" RENAME COLUMN "isDarkroomNsfwVisible" TO "isFleetNsfwVisible";

ALTER TYPE "DarkroomReviewStatus" RENAME TO "FleetReviewStatus";
ALTER TYPE "DarkroomAssetLabel" RENAME TO "FleetAssetLabel";
