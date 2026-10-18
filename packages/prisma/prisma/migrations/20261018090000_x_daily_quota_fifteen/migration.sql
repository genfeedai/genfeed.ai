-- X daily publishing cap: 15 posts a day per connected X account, with a
-- thread counted once (QuotaService counts root posts only).
--
-- New organizations get the new default. Existing organizations still on the
-- old default of 5 are raised to 15 once; any other explicit cap (including
-- 0 = unmetered) is left as the operator set it.
ALTER TABLE "organization_settings" ALTER COLUMN "quotaTwitter" SET DEFAULT 15;

UPDATE "organization_settings"
SET "quotaTwitter" = 15,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "quotaTwitter" = 5;
