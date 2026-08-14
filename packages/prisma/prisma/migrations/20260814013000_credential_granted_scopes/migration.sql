-- Persist provider-granted OAuth scopes on credentials so publishing
-- readiness can derive permissionScopeStatus. Empty default + null
-- capturedAt distinguishes never-captured (pre-ship) from captured-empty.
-- Do not backfill existing rows.

ALTER TABLE "credentials"
  ADD COLUMN IF NOT EXISTS "grantedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "grantedScopesCapturedAt" TIMESTAMP(3);
