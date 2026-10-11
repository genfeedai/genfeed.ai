-- #5502 founder release preview for founder-only modules on cloud.
ALTER TABLE "organization_settings"
  ADD COLUMN "isReleasePreviewEnabled" BOOLEAN NOT NULL DEFAULT false;

-- The founder's organizations keep founder-only modules at cutover: those whose
-- live owner membership belongs to a platform admin. Afterwards only platform
-- admins change the flag, so being a member of a customer organization never
-- unlocks it.
UPDATE "organization_settings" AS "settings"
SET "isReleasePreviewEnabled" = true
WHERE EXISTS (
  SELECT 1
  FROM "members"
  JOIN "roles" ON "roles"."id" = "members"."roleId"
  JOIN "users" ON "users"."id" = "members"."userId"
  WHERE "members"."organizationId" = "settings"."organizationId"
    AND "members"."isDeleted" = false
    AND "members"."isActive" = true
    AND "roles"."key" = 'owner'
    AND "users"."isDeleted" = false
    AND "users"."platformRole" = 'SUPERADMIN'
);
