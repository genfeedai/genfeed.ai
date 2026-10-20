-- Agent chat default margin: 1.7x -> 2.0x (100% markup on provider cost).
--
-- At 1.7x a fully used Scale subscription earned ~27% gross margin on agent
-- chat once its 16.8% credit discount is applied. 2.0x lifts that to ~40%
-- (pay-as-you-go ~50%).
--
-- Only rows still on the old default move. A row an operator set to any other
-- value is a deliberate choice and stays as it is.

-- AlterTable
ALTER TABLE "platform_settings"
  ALTER COLUMN "marginMultiplierAgentChat" SET DEFAULT 2.0;

UPDATE "platform_settings"
SET "marginMultiplierAgentChat" = 2.0
WHERE "marginMultiplierAgentChat" = 1.7;
