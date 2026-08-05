-- Org-level Telegram notification toggle (parity with Discord/Email).
-- IF NOT EXISTS keeps this safe for environments that already received the
-- column via a manual/local apply while migration history was mid-drift.
ALTER TABLE "organization_settings"
ADD COLUMN IF NOT EXISTS "isNotificationsTelegramEnabled" BOOLEAN NOT NULL DEFAULT false;
