-- Better Auth organization compatibility bridge (#792).
--
-- Genfeed Organization/Member/Role/Invitation rows remain the authorization
-- source of truth. These nullable/string compatibility columns let the Better
-- Auth organization plugin map onto existing tables without replacing
-- Member.roleId -> Role or Genfeed InvitationService ownership.

ALTER TABLE "sessions" ADD COLUMN "activeOrganizationId" TEXT;

ALTER TABLE "organizations" ADD COLUMN "authProviderLogoUrl" TEXT;

ALTER TABLE "members" ADD COLUMN "roleKey" TEXT;

ALTER TABLE "invitations" ADD COLUMN "roleKey" TEXT;
ALTER TABLE "invitations" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';

UPDATE "sessions"
SET "activeOrganizationId" = "users"."lastUsedOrganizationId"
FROM "users"
WHERE "sessions"."userId" = "users"."id"
  AND "users"."lastUsedOrganizationId" IS NOT NULL;

UPDATE "members"
SET "roleKey" = "roles"."key"
FROM "roles"
WHERE "members"."roleId" = "roles"."id"
  AND "members"."roleKey" IS NULL;

UPDATE "invitations"
SET "roleKey" = "roles"."key"
FROM "roles"
WHERE "invitations"."roleId" = "roles"."id"
  AND "invitations"."roleKey" IS NULL;

UPDATE "invitations"
SET "status" = CASE
  WHEN "acceptedAt" IS NOT NULL THEN 'accepted'
  WHEN "revokedAt" IS NOT NULL OR "isDeleted" = true THEN 'canceled'
  WHEN "expiresAt" <= CURRENT_TIMESTAMP THEN 'canceled'
  ELSE 'pending'
END;

CREATE INDEX "sessions_activeOrganizationId_idx" ON "sessions"("activeOrganizationId");
CREATE INDEX "members_organizationId_roleKey_isDeleted_idx" ON "members"("organizationId", "roleKey", "isDeleted");
