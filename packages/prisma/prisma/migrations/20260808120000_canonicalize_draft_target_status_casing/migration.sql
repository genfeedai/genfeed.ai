-- content_drafts.status and campaign_targets.status are String columns that
-- held two casings at once (#2543). 20260417050332_init created them as Prisma
-- enums with SCREAMING labels; 20260609150437_reconcile_prod_schema converted
-- both to TEXT with `USING lower("status"::text)` and set lowercase defaults
-- ('draft', 'pending') — but the application kept writing the SCREAMING domain
-- enums (ContentDraftStatus, CampaignTargetStatus in @genfeedai/enums). Rows
-- written since the reconcile are SCREAMING; rows that predate it are
-- lowercase and silently invisible to every status-filtered query, and the
-- lowercase defaults are values no code path produces or matches.
--
-- SCREAMING wins (rule 2 of enum_source_of_truth: the column picks one casing
-- and sticks to it): both domain enums are SCREAMING and used across services,
-- workers, and DTOs, so uppercasing the data is the small change. The columns
-- stay TEXT — the orphan Postgres enum types were dropped in
-- 20260807160000_drop_orphan_enums and must not come back.
--
-- Legacy campaign_targets rows may carry the dead pipeline vocabulary
-- (contacted/responded/converted/rejected) that today's domain enum does not
-- include. This migration canonicalizes casing only — those become
-- CONTACTED/RESPONDED/CONVERTED/REJECTED, terminal legacy states no filter
-- matches, exactly as before, but now in the column's single casing.

ALTER TABLE "content_drafts" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
UPDATE "content_drafts" SET "status" = upper("status") WHERE "status" <> upper("status");

ALTER TABLE "campaign_targets" ALTER COLUMN "status" SET DEFAULT 'PENDING';
UPDATE "campaign_targets" SET "status" = upper("status") WHERE "status" <> upper("status");
