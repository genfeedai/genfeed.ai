-- On by default: every existing public profile keeps showing its reach and
-- post metrics until the owner turns the setting off.
ALTER TABLE "brands"
  ADD COLUMN "isPublicAnalyticsEnabled" BOOLEAN NOT NULL DEFAULT true;
