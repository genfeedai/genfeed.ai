-- #7363 Rename the Clips app to Clipper, as a hard cut. Clipper owns the app id,
-- module id, platform flags, MCP tools and workflow action ids.
--
-- The clip_projects and clip_results tables keep their physical names: the
-- Prisma models are ClipperProject / ClipperResult with @@map to the existing
-- tables, so no row moves and no table or column is renamed or dropped (the
-- migration safety guard requires an expand/contract split for those).
--
-- This migration rewrites only the stored references the application reads.
-- Platform flags and organization module overrides are copied to the new key and
-- the old key is left in place: a task still running the previous release keeps
-- reading its own key, and a missing Clipper flag would otherwise default the
-- module ON. Both keys therefore carry the same value after this migration.

-- Platform flags keep their stored values (including false) under the new keys.
UPDATE "platform_settings"
SET "flags" = "flags" || jsonb_build_object('clipper', "flags" -> 'clips')
WHERE jsonb_typeof("flags") = 'object'
  AND "flags" ? 'clips'
  AND NOT ("flags" ? 'clipper');

UPDATE "platform_settings"
SET "flags" = "flags" || jsonb_build_object('release_clipper', "flags" -> 'release_clips')
WHERE jsonb_typeof("flags") = 'object'
  AND "flags" ? 'release_clips'
  AND NOT ("flags" ? 'release_clipper');

-- Organization module preference, release list and rail order.
UPDATE "organization_settings"
SET "moduleOverrides" = "moduleOverrides" || jsonb_build_object('clipper', "moduleOverrides" -> 'clips')
WHERE jsonb_typeof("moduleOverrides") = 'object'
  AND "moduleOverrides" ? 'clips'
  AND NOT ("moduleOverrides" ? 'clipper');

UPDATE "organization_settings"
SET "releasedItemIds" = array_replace("releasedItemIds", 'clips', 'clipper')
WHERE 'clips' = ANY("releasedItemIds");

UPDATE "organization_settings"
SET "defaultRailOrder" = array_replace("defaultRailOrder", 'clips', 'clipper')
WHERE 'clips' = ANY("defaultRailOrder");

-- Per-member rail preferences and installed apps.
UPDATE "settings"
SET "pinnedAppIds" = array_replace("pinnedAppIds", 'clips', 'clipper')
WHERE 'clips' = ANY("pinnedAppIds");

UPDATE "settings"
SET "railAppOrder" = array_replace("railAppOrder", 'clips', 'clipper')
WHERE 'clips' = ANY("railAppOrder");

UPDATE "settings"
SET "hiddenAppIds" = array_replace("hiddenAppIds", 'clips', 'clipper')
WHERE 'clips' = ANY("hiddenAppIds");

UPDATE "settings" SET "homeAppId" = 'clipper' WHERE "homeAppId" = 'clips';

UPDATE "members"
SET "installedAppIds" = array_replace("installedAppIds", 'clips', 'clipper')
WHERE 'clips' = ANY("installedAppIds");

-- Persisted agent cards render by type. Exact JSON string tokens only.
UPDATE "agent_messages"
SET "metadata" = replace(replace(
    "metadata"::text,
    '"clip_workflow_run_card"', '"clipper_workflow_run_card"'),
    '"clip_run_card"', '"clipper_run_card"')::jsonb
WHERE "metadata" IS NOT NULL
  AND "metadata"::text ~ '"clip_(workflow_)?run_card"';

-- MCP approvals still waiting for a decision name their tool.
UPDATE "mcp_approvals"
SET "toolName" = CASE "toolName"
  WHEN 'analyze_clip_project' THEN 'analyze_clipper_project'
  WHEN 'create_clip_project_from_youtube' THEN 'create_clipper_project_from_youtube'
  WHEN 'get_clip_highlights' THEN 'get_clipper_highlights'
  WHEN 'get_clip_project' THEN 'get_clipper_project'
  WHEN 'generate_clips' THEN 'run_clipper'
  WHEN 'list_clip_projects' THEN 'list_clipper_projects'
  WHEN 'prepare_clip_workflow_run' THEN 'prepare_clipper_workflow_run'
  ELSE "toolName"
END
WHERE "toolName" IN (
  'analyze_clip_project',
  'create_clip_project_from_youtube',
  'get_clip_highlights',
  'get_clip_project',
  'generate_clips',
  'list_clip_projects',
  'prepare_clip_workflow_run'
);
