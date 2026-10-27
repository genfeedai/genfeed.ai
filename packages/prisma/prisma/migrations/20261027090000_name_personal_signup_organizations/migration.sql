-- Signup organizations for personal mailboxes (gmail, outlook, ...) were named
-- after the email handle ("Pjeeva391") with a handle-derived slug. New signups
-- are now named "Personal" with slug personal-<id tail>; this backfill moves the
-- existing ones the same way.
--
-- Guarded so it only touches an org still on the name signup generated:
--   * the org is live and owned by a user whose email is on a personal domain
--     (the PERSONAL_EMAIL_DOMAINS list in @genfeedai/contracts);
--   * its label is exactly what signup derived, i.e. the owner's display name or
--     the title-cased email local part (resolveSignupWorkspaceLabel). Any org the
--     owner has renamed, and every work-domain org, is left alone.
-- The slug follows only when it is still the one generated from that label
-- (`pjeeva391` or `pjeeva391-2`) and the new slug is free and unique in this run.
-- Rows are only updated; nothing is created, dropped or renamed at table level.

WITH owners AS (
  SELECT
    o."id" AS "orgId",
    o."label" AS "label",
    o."slug" AS "slug",
    NULLIF(btrim(u."name"), '') AS "ownerName",
    array_to_string(
      ARRAY(
        SELECT initcap(seg)
        FROM regexp_split_to_table(
          lower(split_part(u."email", '@', 1)),
          '[._[:space:]-]+'
        ) AS seg
        WHERE seg <> ''
      ),
      ' '
    ) AS "handleLabel"
  FROM "organizations" o
  JOIN "users" u ON u."id" = o."userId"
  WHERE o."isDeleted" = false
    AND o."label" <> 'Personal'
    AND lower(split_part(u."email", '@', 2)) IN (
      'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
      'protonmail.com', 'proton.me', 'googlemail.com', 'yahoo.co.uk',
      'hotmail.co.uk', 'outlook.fr', 'hotmail.fr', 'gmx.de', 'gmx.net',
      'tuta.com', 'tutamail.com', 'aol.com', 'mail.com', 'zoho.com',
      'yandex.com', 'gmx.com', 'live.com', 'msn.com', 'pm.me', 'tutanota.com',
      'fastmail.com', 'hey.com', 'me.com', 'mac.com'
    )
),
auto_named AS (
  SELECT
    owners.*,
    btrim(regexp_replace(lower(owners."label"), '[^a-z0-9]+', '-', 'g'), '-') AS "labelSlug",
    'personal-' || lower(right(regexp_replace(owners."orgId", '[^A-Za-z0-9]', '', 'g'), 8)) AS "newSlug"
  FROM owners
  WHERE owners."label" = owners."ownerName"
     OR (owners."handleLabel" <> '' AND owners."label" = owners."handleLabel")
),
planned AS (
SELECT
  a."orgId",
  CASE
    WHEN (a."slug" = a."labelSlug" OR a."slug" ~ ('^' || a."labelSlug" || '-[0-9]+$'))
      AND a."labelSlug" <> ''
      AND a."newSlug" <> 'personal-'
      AND count(*) OVER (PARTITION BY a."newSlug") = 1
      AND NOT EXISTS (
        SELECT 1 FROM "organizations" other
        WHERE other."slug" = a."newSlug" AND other."id" <> a."orgId"
      )
    THEN a."newSlug"
    ELSE NULL
  END AS "newSlug"
FROM auto_named a
)
UPDATE "organizations" o
SET "label" = 'Personal',
    "slug" = COALESCE(b."newSlug", o."slug"),
    "updatedAt" = CURRENT_TIMESTAMP
FROM planned b
WHERE o."id" = b."orgId";
