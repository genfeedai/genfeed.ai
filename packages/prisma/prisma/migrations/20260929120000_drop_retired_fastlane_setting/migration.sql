-- Retired (#5463): idea batches are gated by the batch_ideas platform flag, and
-- v0.1.77 (which no longer reads this column) has fully rolled out (#5567).
ALTER TABLE "organization_settings" DROP COLUMN IF EXISTS "isFastlaneEnabled";
