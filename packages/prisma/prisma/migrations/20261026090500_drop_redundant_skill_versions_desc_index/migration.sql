-- Covered by the unique (skillId, versionNumber) index: Postgres scans a btree
-- backward for the DESC order. The schema declaration had no map: name, so it
-- never matched the real index name created in skill_version_capture.
-- Keep this as the migration's only statement.
DROP INDEX CONCURRENTLY IF EXISTS "skill_versions_skill_version_desc_idx";
