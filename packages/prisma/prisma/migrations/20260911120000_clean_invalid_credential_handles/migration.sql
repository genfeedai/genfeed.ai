-- #4695: the OAuth callback handle audit found `externalHandle` persisted
-- from an email address (Facebook: `profile.email`) or, on platforms with no
-- public handle concept, a value that duplicates another already-persisted
-- column instead of a real @handle:
--   - Facebook: full name (equals externalName), when no email was granted
--   - LinkedIn: full name (equals externalName)
--   - Beehiiv: publication name (equals externalName)
--   - Ghost: site URL (equals externalId, not externalName — Ghost's old
--     connect code set both `handle` and `id` to the same `ghostUrl`)
--   - YouTube: channel title, when the channel had no `customUrl` (equals
--     externalName, or — since a title can differ from the stored name in
--     edge cases — contains whitespace, which no real YouTube @handle does)
--
-- Scoped narrowly and safe to replay:
--   1. Any platform, only when `externalHandle` is shaped like an email
--      address — the exact Facebook defect, and not a shape any platform's
--      real handle legitimately takes for the account that authorized its
--      own connection.
--   2. Only FACEBOOK / LINKEDIN / BEEHIIV, only when `externalHandle` is
--      exactly equal to `externalName`.
--   3. Only GHOST, only when `externalHandle` is exactly equal to
--      `externalId`.
--   4. Only YOUTUBE, only when `externalHandle` equals `externalName` or
--      contains whitespace (a real YouTube @handle never does).
--
-- Every other credential column, and every row on every other platform, is
-- left untouched.

UPDATE "credentials"
SET "externalHandle" = NULL, "updatedAt" = now()
WHERE "externalHandle" IS NOT NULL
  AND "externalHandle" ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';

UPDATE "credentials"
SET "externalHandle" = NULL, "updatedAt" = now()
WHERE "platform" IN ('FACEBOOK', 'LINKEDIN', 'BEEHIIV')
  AND "externalHandle" IS NOT NULL
  AND "externalHandle" = "externalName";

UPDATE "credentials"
SET "externalHandle" = NULL, "updatedAt" = now()
WHERE "platform" = 'GHOST'
  AND "externalHandle" IS NOT NULL
  AND "externalHandle" = "externalId";

UPDATE "credentials"
SET "externalHandle" = NULL, "updatedAt" = now()
WHERE "platform" = 'YOUTUBE'
  AND "externalHandle" IS NOT NULL
  AND ("externalHandle" = "externalName" OR "externalHandle" ~ '\s');
