-- Operator Discord channel for credit and revenue alerts. Unset, they keep posting to the users channel.
ALTER TABLE platform_settings ADD COLUMN "discordChannelIdBilling" TEXT;
