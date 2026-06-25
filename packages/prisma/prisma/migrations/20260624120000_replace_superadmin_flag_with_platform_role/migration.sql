-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'SUPERADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

-- BackfillRole
UPDATE "users"
SET "platformRole" = 'SUPERADMIN'
WHERE "isSuperAdmin" = true;

-- InitialPlatformAdmin
DO $$
DECLARE
  bootstrap_match_count integer;
BEGIN
  SELECT COUNT(*)
  INTO bootstrap_match_count
  FROM "users"
  WHERE lower("email") = lower('vincent@genfeed.ai');

  IF bootstrap_match_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one bootstrap superadmin account for vincent@genfeed.ai, found %',
      bootstrap_match_count;
  END IF;

  UPDATE "users"
  SET "platformRole" = 'SUPERADMIN'
  WHERE lower("email") = lower('vincent@genfeed.ai');
END $$;

-- DropFlag
ALTER TABLE "users" DROP COLUMN "isSuperAdmin";
