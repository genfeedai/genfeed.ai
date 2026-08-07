-- Seven Postgres enum types with no backing column anywhere in the schema.
-- Same cleanup as 20260807120000_drop_orphan_workflow_status_enum (#2492).
--
-- Two ways they were orphaned:
--
-- 1. Created by 20260417050332_init and never attached to a column at all:
--      ReferenceImageCategory, AgentAutonomyMode, AgentQualityTier, AgentGoalProfile
--
-- 2. Created by 20260417050332_init WITH a column, then orphaned by
--    20260609150437_reconcile_prod_schema, which ran
--    `ALTER COLUMN "status" TYPE TEXT USING lower("status"::text)` and left the
--    type behind:
--      OutreachCampaignStatus ("outreach_campaigns"."status")
--      CampaignTargetStatus   ("campaign_targets"."status")
--      ContentDraftStatus     ("content_drafts"."status")
--
-- Every one of those columns stays TEXT. No data is touched: the types are
-- unreferenced, so the drops cannot fail on a dependent column.
--
-- Leaving stale declarations in schema.prisma is the trap #2492 removed —
-- whoever promotes one of these columns to a real Prisma enum would reuse the
-- dead declaration and ship a migration that rejects rows the app writes today
-- (the domain CampaignTargetStatus, for one, carries SCHEDULED/PROCESSING/
-- REPLIED/SENT/SKIPPED/FAILED, none of which are in the dead Postgres type).
--
-- The same-named domain enums in @genfeedai/enums are unchanged.
DROP TYPE IF EXISTS "ReferenceImageCategory";
DROP TYPE IF EXISTS "AgentAutonomyMode";
DROP TYPE IF EXISTS "AgentQualityTier";
DROP TYPE IF EXISTS "AgentGoalProfile";
DROP TYPE IF EXISTS "OutreachCampaignStatus";
DROP TYPE IF EXISTS "CampaignTargetStatus";
DROP TYPE IF EXISTS "ContentDraftStatus";
