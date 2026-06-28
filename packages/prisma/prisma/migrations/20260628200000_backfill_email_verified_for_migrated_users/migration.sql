-- Backfill emailVerified for users migrated from the legacy auth provider (Clerk).
--
-- These accounts were email-verified in the prior IdP but carry Prisma's column
-- default (emailVerified = false). Better Auth's account-linking gate
-- (account.accountLinking.requireLocalEmailVerified, default true) refuses to
-- implicitly link a social provider (Google) onto a local user whose
-- emailVerified is false, surfacing as `account_not_linked` on first Google
-- sign-in. Migrated users are identified by a non-null authProviderId (the legacy
-- IdP user id); new Better Auth users have a null authProviderId and get their
-- emailVerified set correctly at sign-up, so they are intentionally excluded.
--
-- Idempotent: only flips rows still sitting on the default. Safe to re-run.
UPDATE "users"
SET "emailVerified" = true
WHERE "authProviderId" IS NOT NULL
  AND "emailVerified" = false
  AND "isDeleted" = false;
