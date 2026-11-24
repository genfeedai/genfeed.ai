-- Operator Discord channel for system alerts (trend ingestion health, provider budget). Unset, alerts are skipped.
ALTER TABLE platform_settings ADD COLUMN "discordChannelIdAlerts" TEXT;
