-- Locale preference (epic #2497).
--
-- Locale is carried to the server by cookie, but the durable preference lives
-- here so it follows the user across devices. `settings.locale` is the personal
-- choice; `organization_settings.defaultLocale` is the fallback applied to
-- members who have not chosen one — together they are the `user -> org` half of
-- the `user -> org -> browser -> en` precedence chain.
--
-- IF NOT EXISTS mirrors 20260805220000_add_org_notifications_telegram: it keeps
-- the migration safe on environments that already received the column via a
-- manual apply.
ALTER TABLE "settings"
ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'en';

ALTER TABLE "organization_settings"
ADD COLUMN IF NOT EXISTS "defaultLocale" TEXT NOT NULL DEFAULT 'en';
