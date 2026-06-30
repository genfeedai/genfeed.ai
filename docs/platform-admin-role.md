# Platform Admin Role

SaaS control-plane access is stored on `users.platformRole`, not on organization
membership. Organization owners/admins do not receive `/admin` access unless
their user row has `platformRole = 'SUPERADMIN'`.

## Initial Assignment Runbook

The migration `20260624120000_replace_superadmin_flag_with_platform_role`
replaces the removed boolean flag with `platformRole`. The follow-up migration
`20260630093000_restrict_platform_superadmin_to_vincent` restricts current
platform-superadmin access to `vincent@genfeed.ai`.

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
do not have `platformRole = 'SUPERADMIN'`.

If production verification after deploy shows no platform administrator, rerun
the `UPDATE ... RETURNING` statement above inside a transaction and `COMMIT`
only after the returned row is exactly the intended `vincent@genfeed.ai` account.
