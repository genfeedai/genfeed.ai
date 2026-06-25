# Platform Admin Role

SaaS control-plane access is stored on `users.platformRole`, not on organization
membership. Organization owners/admins do not receive `/admin` access unless
their user row has `platformRole = 'SUPERADMIN'`.

## Initial Assignment Runbook

The migration `20260624120000_replace_superadmin_flag_with_platform_role`
backfills legacy `isSuperAdmin = true` rows and assigns
`vincent@genfeed.ai` as the intended initial platform administrator.

Dry-run verification:

```sql
BEGIN;

UPDATE "users"
SET "platformRole" = 'SUPERADMIN'
WHERE lower("email") = lower('vincent@genfeed.ai')
RETURNING "id", "email", "platformRole";

SELECT "id", "email", "platformRole"
FROM "users"
WHERE "platformRole" = 'SUPERADMIN'
ORDER BY "email";

ROLLBACK;
```

Expected result: `vincent@genfeed.ai` is present as a `SUPERADMIN`; other rows
may also appear if they were backfilled from legacy `isSuperAdmin = true`.

If production verification after deploy shows no platform administrator, rerun
the `UPDATE ... RETURNING` statement above inside a transaction and `COMMIT`
only after the returned row is exactly the intended `vincent@genfeed.ai` account.
