-- Bridge production databases that ran pre-rename auth-provider migrations.
-- Current Prisma schema expects authProvider* column names, while some live
-- databases still have earlier Clerk-specific column names.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'clerkId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'authProviderId'
  ) THEN
    ALTER TABLE "users" RENAME COLUMN "clerkId" TO "authProviderId";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'authProviderId'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "authProviderId" TEXT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'users_clerkId_key'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'authProviderId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'clerkId'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'users_authProviderId_key'
  ) THEN
    ALTER INDEX "users_clerkId_key" RENAME TO "users_authProviderId_key";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'users_authProviderId_key'
  ) THEN
    CREATE UNIQUE INDEX "users_authProviderId_key" ON "users"("authProviderId");
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'clerkOrganizationId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'authProviderOrganizationId'
  ) THEN
    ALTER TABLE "organizations" RENAME COLUMN "clerkOrganizationId" TO "authProviderOrganizationId";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'organizations_clerkOrganizationId_key'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'authProviderOrganizationId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'clerkOrganizationId'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'organizations_authProviderOrganizationId_key'
  ) THEN
    ALTER INDEX "organizations_clerkOrganizationId_key" RENAME TO "organizations_authProviderOrganizationId_key";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'members'
      AND column_name = 'clerkMembershipId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'members'
      AND column_name = 'authProviderMembershipId'
  ) THEN
    ALTER TABLE "members" RENAME COLUMN "clerkMembershipId" TO "authProviderMembershipId";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'members_clerkMembershipId_key'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'members'
      AND column_name = 'authProviderMembershipId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'members'
      AND column_name = 'clerkMembershipId'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'members_authProviderMembershipId_key'
  ) THEN
    ALTER INDEX "members_clerkMembershipId_key" RENAME TO "members_authProviderMembershipId_key";
  END IF;
END $$;
