-- Clerk-era organization provider id. Identity is Prisma Organization.id.

DROP INDEX IF EXISTS "organizations_authProviderOrganizationId_key";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "authProviderOrganizationId";
