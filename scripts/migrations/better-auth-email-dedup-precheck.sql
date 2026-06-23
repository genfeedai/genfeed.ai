-- Better Auth email-dedup precheck — PRE-RELEASE GATE (epic #735).
--
-- Phase 1 (#750) adds a UNIQUE index on `users.email`
-- (migration `20260622143420_better_auth_phase1_dual_run`). Building that index
-- FAILS if any two rows share an exact email. Run this against the TARGET
-- database BEFORE the migration deploys (i.e. before cutting the release that
-- ships #750's schema). Query (a) MUST return zero rows.
--
--   psql "$DATABASE_URL" -f scripts/migrations/better-auth-email-dedup-precheck.sql
--
-- Releases are tag-driven, so merging #750 did NOT apply this migration — this
-- gate is owed before the first prod deploy carrying it.

-- (a) BLOCKER — exact-duplicate emails fail `CREATE UNIQUE INDEX users_email_key`.
--     Must be empty before deploy. Merge/clean any rows returned here first
--     (keep the newer/more-complete row, repoint its FKs, soft-delete the rest).
SELECT email, count(*) AS n
FROM users
WHERE email IS NOT NULL
GROUP BY email
HAVING count(*) > 1
ORDER BY n DESC;

-- (b) LOGIN-SAFETY (not a migration blocker) — Better Auth lowercases emails on
--     magic-link / sign-in, so case-variant duplicates (Foo@x.com vs foo@x.com)
--     pass the unique index but collide at login. Worth merging too.
SELECT lower(email) AS email_lc, count(*) AS n
FROM users
WHERE email IS NOT NULL
GROUP BY lower(email)
HAVING count(*) > 1
ORDER BY n DESC;

-- (c) LOCKOUT TRIAGE (not a blocker) — NULL-email rows cannot be magic-linked,
--     so those users have no Better Auth sign-in path post-cutover (they keep
--     API keys). Triage / set an email before legacy auth provider is removed.
SELECT count(*) AS null_email_users
FROM users
WHERE email IS NULL;
