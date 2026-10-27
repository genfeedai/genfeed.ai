-- One-time duplicate-slug report from the skill version capture migration; nothing
-- reads it. Schema removal shipped in v0.2.17. The guard aborts the migration if
-- findings remain, so they are reviewed before the report is discarded.
-- genfeed-contract-after: v0.2.17
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "skill_migration_findings") THEN
    RAISE EXCEPTION 'Refusing to drop "skill_migration_findings": it still holds rows';
  END IF;
END
$$;

DROP TABLE "skill_migration_findings";
