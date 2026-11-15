-- First-party product skills motion-video and video-brand-profile
-- (skills/media/<slug>/SKILL.md), pinned from genfeedai/skills. Later
-- additions to the first-party catalog get their own migration because
-- 20260824120000_provision_first_party_skill_catalog is already applied and
-- immutable. Catalog-global stubs only; the full SKILL.md bodies are applied
-- by SkillCatalogSeedService in the reference-data sync. Re-running is
-- idempotent. The slugs are trusted by 20261115100000_trust_video_skills,
-- which runs first.

UPDATE "skills"
SET
  "isDeleted" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "organizationId" IS NOT NULL
  AND "isDeleted" = false
  AND COALESCE("config"->>'slug', '') = ANY (ARRAY[
    'motion-video',
    'video-brand-profile'
  ]::text[]);

DO $$
BEGIN
    PERFORM set_config('genfeed.skill_write_origin', 'provisioning', true);

    -- The capture trigger writes a version row before ON CONFLICT is
    -- evaluated, so a conflict clause alone would fail a re-run.
    INSERT INTO "skills" (
      "id",
      "organizationId",
      "label",
      "config",
      "isDeleted",
      "createdAt",
      "updatedAt"
    )
    SELECT stub.*
    FROM (
    VALUES
  (
    'cskillbuiltinmotionvideo',
    NULL,
    'Motion Video',
    jsonb_build_object(
      'category', 'video',
      'channels', jsonb_build_array(),
      'defaultInstructions', 'Author a Remotion composition with your own Claude or Codex sub, render it locally and package it as Genfeed Motion-style output, no model API',
      'description', 'Author a Remotion composition with your own Claude or Codex sub, render it locally and package it as Genfeed Motion-style output, no model API',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('video'),
      'name', 'Motion Video',
      'requiredProviders', jsonb_build_array(),
      'slug', 'motion-video',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'version', '1.2.0',
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cskillbuiltinvideobrandprofile',
    NULL,
    'Video Brand Profile',
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array('youtube', 'tiktok'),
      'defaultInstructions', 'Define and apply a reusable video brand profile: signature placement, caption font and position, thumbnail rules and export sizes',
      'description', 'Define and apply a reusable video brand profile: signature placement, caption font and position, thumbnail rules and export sizes',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('multi', 'video', 'text'),
      'name', 'Video Brand Profile',
      'requiredProviders', jsonb_build_array(),
      'slug', 'video-brand-profile',
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
    ) AS stub("id", "organizationId", "label", "config", "isDeleted", "createdAt", "updatedAt")
    WHERE NOT EXISTS (
      SELECT 1 FROM "skills" existing WHERE existing."id" = stub."id"
    );

    PERFORM set_config('genfeed.skill_write_origin', '', true);
END;
$$;
