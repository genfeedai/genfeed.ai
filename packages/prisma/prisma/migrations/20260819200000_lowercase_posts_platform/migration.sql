-- posts.platform is a String column that stores the lowercase product Platform
-- vocabulary (twitter, instagram, devto, google_ads). Unmapped credential reads
-- wrote Prisma CredentialPlatform labels (TWITTER, DEVTO, GOOGLE_ADS) into the
-- column. Quota and publisher lookups filter on the lowercase values, so those
-- rows were invisible.
--
-- Code now maps going forward (#3259). This backfill lowercases historical rows.
-- lower('DEVTO') = 'devto' (Platform.DEV_TO). lower('GOOGLE_ADS') = 'google_ads'
-- (Platform.GOOGLE_ADS). Idempotent: already-lowercase rows are a no-op.
--
-- Do not touch credentials.platform or post_analytics.platform — those are
-- Prisma CredentialPlatform enums and must stay SCREAMING.

UPDATE "posts"
SET "platform" = lower("platform")
WHERE "platform" IS NOT NULL
  AND "platform" <> lower("platform");
