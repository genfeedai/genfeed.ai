-- First-party product skill: clip-editor (skills/clip-editor/SKILL.md).
-- Later additions to the first-party catalog get their own migration because
-- 20260824120000_provision_first_party_skill_catalog is already applied and
-- immutable. Catalog-global stub only; the full SKILL.md body is applied by
-- SkillCatalogSeedService on API boot. Re-running is idempotent
-- (ON CONFLICT DO NOTHING).

UPDATE "skills"
SET
  "isDeleted" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "organizationId" IS NOT NULL
  AND "isDeleted" = false
  AND COALESCE("config"->>'slug', '') = 'clip-editor';

INSERT INTO "skills" (
  "id",
  "organizationId",
  "label",
  "config",
  "isDeleted",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    'cskillbuiltinclipeditor',
    NULL,
    'Clip Editor',
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array(),
      'defaultInstructions', 'Edit a finished clip directly from the agent. Read the clip and its transcript, propose an exact new window, then re-cut it with edit_clip once the user agrees. Triggers on "edit this clip", "cut the intro", "make this clip shorter", "this clip ends mid-sentence", "change where this clip starts", "retitle this clip".',
      'description', 'Edit a finished clip directly from the agent. Read the clip and its transcript, propose an exact new window, then re-cut it with edit_clip once the user agrees. Triggers on "edit this clip", "cut the intro", "make this clip shorter", "this clip ends mid-sentence", "change where this clip starts", "retitle this clip".',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', 'Clip Editor',
      'requiredProviders', jsonb_build_array(),
      'slug', 'clip-editor',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'version', '1.0.0',
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("id") DO NOTHING;
