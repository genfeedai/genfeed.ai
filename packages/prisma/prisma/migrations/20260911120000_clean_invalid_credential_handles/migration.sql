-- #4695: the OAuth callback handle audit found `externalHandle` persisted
-- from an email address (Facebook: `profile.email`) or, on platforms with no
-- public handle concept, the very same display name already stored in
-- `externalName` (Facebook: full name; LinkedIn: full name; Beehiiv:
-- publication name; Ghost: site URL). None of those are a real public
-- @handle, so leaving them in place would keep surfacing them as one.
--
-- Scoped narrowly and safe to replay:
--   1. Any platform, only when `externalHandle` is shaped like an email
--      address — the exact Facebook defect, and not a shape any platform's
--      real handle legitimately takes for the account that authorized its
--      own connection.
--   2. Only FACEBOOK / LINKEDIN / BEEHIIV / GHOST, only when `externalHandle`
--      is exactly equal to `externalName` — the display-name-as-handle
--      defect fixed for those four platforms specifically. Other platforms
--      keep real handles that may legitimately match their display name.
--
-- Every other credential column, and every row on every other platform, is
-- left untouched.

UPDATE "credentials"
SET "externalHandle" = NULL, "updatedAt" = now()
WHERE "externalHandle" IS NOT NULL
  AND "externalHandle" ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';

UPDATE "credentials"
SET "externalHandle" = NULL, "updatedAt" = now()
WHERE "platform" IN ('FACEBOOK', 'LINKEDIN', 'BEEHIIV', 'GHOST')
  AND "externalHandle" IS NOT NULL
  AND "externalHandle" = "externalName";
