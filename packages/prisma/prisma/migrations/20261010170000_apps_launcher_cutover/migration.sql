-- #5502 Apps launcher cutover: a hard cut with no runtime mapping of old ids.

-- The Studio rail item opened Playground, so a Studio pin becomes a
-- Playground pin. Automation, Messages and Discovery keep their ids.
UPDATE "settings"
SET "pinnedAppIds" = array_replace("pinnedAppIds", 'studio', 'playground')
WHERE 'studio' = ANY("pinnedAppIds");

-- Every member could reach these apps through More or the Studio parent before
-- the cutover, so install them for existing memberships, appended after any
-- installs already made. Installation only controls the launcher: organization,
-- subscription and release access still decide what each member can open.
UPDATE "members"
SET "installedAppIds" = "installedAppIds" || ARRAY(
  SELECT "appId"
  FROM unnest(ARRAY[
    'playground',
    'storyboard',
    'turbo',
    'motion',
    'clips',
    'editor',
    'automation',
    'messages',
    'discovery'
  ]::TEXT[]) WITH ORDINALITY AS "catalog"("appId", "position")
  WHERE NOT ("appId" = ANY("members"."installedAppIds"))
  ORDER BY "position"
)
WHERE "isDeleted" = false;
