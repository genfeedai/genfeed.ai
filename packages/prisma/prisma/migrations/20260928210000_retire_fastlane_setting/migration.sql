-- Retire the per-organization Fastlane setting (#5463, #5407). Idea batches
-- are now gated by the central `batch_ideas` Admin platform flag instead of
-- an org-level opt-in, matching every other product switch.
ALTER TABLE "organization_settings" DROP COLUMN "isFastlaneEnabled";
