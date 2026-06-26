-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'SUPERADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

-- BackfillRole
UPDATE "users"
SET "platformRole" = 'SUPERADMIN'
WHERE "isSuperAdmin" = true;

-- InitialPlatformAdmin
-- Bootstrap the initial platform superadmin when that account exists. This is a
-- no-op on databases that do not have it (fresh installs, community/self-hosted
-- deployments, ephemeral CI test DBs), so `prisma migrate deploy` stays portable
-- across every deployment mode instead of aborting when the account is absent.
-- The users.email unique index guarantees this matches at most one row.
UPDATE "users"
SET "platformRole" = 'SUPERADMIN'
WHERE lower("email") = lower('vincent@genfeed.ai');

-- DropFlag
ALTER TABLE "users" DROP COLUMN "isSuperAdmin";
