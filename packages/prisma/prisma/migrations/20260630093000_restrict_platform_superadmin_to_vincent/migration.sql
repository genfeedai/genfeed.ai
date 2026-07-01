-- Restrict current platform-superadmin access to the intended initial admin.
-- Organization owner/admin roles remain separate and do not grant platform admin.
UPDATE "users"
SET "platformRole" = 'USER'
WHERE "platformRole" = 'SUPERADMIN'
  AND lower("email") <> lower('vincent@genfeed.ai');

UPDATE "users"
SET "platformRole" = 'SUPERADMIN'
WHERE lower("email") = lower('vincent@genfeed.ai');
