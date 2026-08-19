-- Better Auth Infra's dash plugin records recent authenticated activity here.
-- Existing users remain null: activity begins only after tracking is enabled.
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3);
