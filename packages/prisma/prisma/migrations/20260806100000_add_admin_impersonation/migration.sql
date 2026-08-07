-- Better Auth admin plugin (#2423): platform-role-gated impersonation.
-- users gains plugin-owned moderation state; sessions gains the
-- impersonation audit trail (operator User.id while impersonating).
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "banReason" TEXT,
ADD COLUMN IF NOT EXISTS "banExpires" TIMESTAMP(3);

ALTER TABLE "sessions"
ADD COLUMN IF NOT EXISTS "impersonatedBy" TEXT;
