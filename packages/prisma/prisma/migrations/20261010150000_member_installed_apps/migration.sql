-- #5502 personal native app installation per organization membership.
-- Additive: existing members keep an empty list until the launcher cutover
-- installs every app they could already reach, so no access is removed.
ALTER TABLE "members" ADD COLUMN "installedAppIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
