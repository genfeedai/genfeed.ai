-- Better Auth uses the canonical Genfeed User.id as its subject. The legacy
-- provider snapshot is frozen, has no live writers, and must not remain
-- available for accidental identity lookups.
DROP INDEX IF EXISTS "users_authProviderId_key";

ALTER TABLE "users" DROP COLUMN IF EXISTS "authProviderId";
