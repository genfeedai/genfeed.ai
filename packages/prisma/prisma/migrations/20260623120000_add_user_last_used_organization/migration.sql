-- AlterTable
-- Active-organization pointer (epic #735, Phase C). Replaces the Clerk
-- publicMetadata.organization routing candidate so the user's current org is
-- DB-authoritative across the Clerk -> Better Auth cutover. Nullable/no FK:
-- applies cleanly over existing rows and never blocks leaving/deleting an org.
ALTER TABLE "users" ADD COLUMN     "lastUsedOrganizationId" TEXT;
