-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'SUPERADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

-- BackfillRole
UPDATE "users"
SET "platformRole" = 'SUPERADMIN'
WHERE "isSuperAdmin" = true;

-- InitialPlatformAdmin
UPDATE "users"
SET "platformRole" = 'SUPERADMIN'
WHERE lower("email") = lower('vincent@genfeed.ai');

-- DropFlag
ALTER TABLE "users" DROP COLUMN "isSuperAdmin";
