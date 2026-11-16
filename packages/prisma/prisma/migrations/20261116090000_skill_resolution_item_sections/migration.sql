-- Which sections of a skill a generation prompt carried (#10190). Headings
-- and counts only: the instruction text is never stored here. Nullable, so
-- existing rows and excluded items stay as they are. Metadata-only change.
ALTER TABLE "skill_resolution_items" ADD COLUMN "sections" JSONB;
