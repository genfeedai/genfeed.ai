-- BrandInterviewStatus was the last Prisma enum whose labels were lowercase,
-- against the canonical rule that a Prisma-enum-backed column and its
-- @genfeedai/enums mirror share SCREAMING_SNAKE labels exactly.
-- See .agents/memory/rules/enum_source_of_truth.md.
--
-- RENAME VALUE keeps each label's pg_enum OID, so nothing that stores the value
-- by OID has to be rewritten:
--   * existing "brand_interviews"."status" rows keep pointing at the same labels
--   * the column DEFAULT (a Const carrying the enum OID) stays valid
--   * the partial unique index "brand_interview_active_unique", whose predicate
--     is `status = 'in_progress' AND "isDeleted" = false`, keeps matching the
--     renamed label — the stored predicate references the OID, not the text
-- No table rewrite, no data backfill, no index rebuild.
ALTER TYPE "brand_interview_status" RENAME VALUE 'in_progress' TO 'IN_PROGRESS';
ALTER TYPE "brand_interview_status" RENAME VALUE 'completed' TO 'COMPLETED';
ALTER TYPE "brand_interview_status" RENAME VALUE 'abandoned' TO 'ABANDONED';
