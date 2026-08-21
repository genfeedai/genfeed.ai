-- Global skills are visible to every tenant. Before this migration, the public
-- create endpoint could write null-owned rows and caller-controlled built-in
-- flags, so neither ownership nor config is valid provenance. Quarantine every
-- historical global row; the canonical migration-owned rows are restored below.
UPDATE "skills"
SET
  "isDeleted" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "organizationId" IS NULL
  AND "isDeleted" = false;

-- Static executor slugs are reserved for the canonical rows. Quarantine
-- historical organization-owned collisions so lookup cannot become dependent
-- on row order and a custom definition cannot stand in for a built-in handler.
UPDATE "skills"
SET
  "isDeleted" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "organizationId" IS NOT NULL
  AND "isDeleted" = false
  AND COALESCE("config"->>'slug', '') = ANY (ARRAY[
    'content-geo-optimizer',
    'content-writing',
    'image-generation',
    'trend-discovery',
    'trend-remix'
  ]::text[]);

-- The executor has five concrete handlers. Recreate those rows from trusted
-- migration data so local/self-hosted databases have a usable catalog and so
-- a forged historical row cannot retain executable prompt content.
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
    'cskillbuiltincontentgeo',
    NULL,
    'Content GEO Optimizer',
    jsonb_build_object(
      'category', 'optimization',
      'channels', jsonb_build_array('blog'),
      'defaultInstructions', 'Improve long-form content for answer-engine extraction, source attribution, entity clarity, and structured-data readiness without inventing evidence.',
      'description', 'Optimizes long-form content for generative answer engines and citation-ready structure.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', 'Content GEO Optimizer',
      'requiredProviders', jsonb_build_array(),
      'slug', 'content-geo-optimizer',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'workflowStage', 'review'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cskillbuiltincontentwrite',
    NULL,
    'Content Writing',
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array('x', 'linkedin', 'blog', 'ads'),
      'defaultInstructions', 'Create clear, useful, brand-aligned content for the requested audience, format, and channel.',
      'description', 'Creates brand-aligned written content for social, editorial, and advertising channels.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', 'Content Writing',
      'requiredProviders', jsonb_build_array(),
      'slug', 'content-writing',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cskillbuiltinimagegenerate',
    NULL,
    'Image Generation',
    jsonb_build_object(
      'category', 'image',
      'channels', jsonb_build_array('tiktok', 'reels', 'youtube', 'x', 'linkedin', 'blog', 'ads'),
      'defaultInstructions', 'Create an image-generation brief that preserves the requested subject, brand constraints, composition, and delivery format.',
      'description', 'Builds and executes brand-aware image generation requests.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('image'),
      'name', 'Image Generation',
      'requiredProviders', jsonb_build_array(),
      'slug', 'image-generation',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cskillbuiltintrenddiscover',
    NULL,
    'Trend Discovery',
    jsonb_build_object(
      'category', 'discovery',
      'channels', jsonb_build_array('tiktok', 'reels', 'youtube', 'x', 'linkedin', 'blog'),
      'defaultInstructions', 'Identify relevant trends, explain why they matter to the brand, and keep evidence separate from inference.',
      'description', 'Finds and prioritizes content trends relevant to the selected brand.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', 'Trend Discovery',
      'requiredProviders', jsonb_build_array(),
      'slug', 'trend-discovery',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'workflowStage', 'research'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cskillbuiltintrendremix',
    NULL,
    'Trend Remix',
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array('tiktok', 'reels', 'youtube', 'x', 'linkedin'),
      'defaultInstructions', 'Transform a source trend into original, brand-aligned content while preserving source attribution and avoiding copied phrasing.',
      'description', 'Remixes a source trend into original content adapted to the selected brand.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('multi'),
      'name', 'Trend Remix',
      'requiredProviders', jsonb_build_array(),
      'slug', 'trend-remix',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("id") DO UPDATE
SET
  "organizationId" = EXCLUDED."organizationId",
  "label" = EXCLUDED."label",
  "config" = EXCLUDED."config",
  "isDeleted" = false,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Heal legacy Brand JSON. The old client re-sends the whole enabledSkills
-- array on every toggle, so one stale value otherwise makes every future
-- replacement fail validation. Preserve order, remove duplicates, and keep
-- only selected-org skills or trusted global catalog rows.
WITH normalized_brand_skills AS (
  SELECT
    brand."id" AS brand_id,
    COALESCE(
      jsonb_agg(entry.value ORDER BY entry.ordinality)
        FILTER (WHERE entry.value IS NOT NULL),
      '[]'::jsonb
    ) AS enabled_skills
  FROM "brands" AS brand
  LEFT JOIN LATERAL (
    SELECT deduplicated.value, deduplicated.ordinality
    FROM (
      SELECT DISTINCT ON (raw_entry.value #>> '{}')
        raw_entry.value #>> '{}' AS value,
        raw_entry.ordinality
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(brand."agentConfig") = 'object'
            AND jsonb_typeof(brand."agentConfig"->'enabledSkills') = 'array'
          THEN brand."agentConfig"->'enabledSkills'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS raw_entry(value, ordinality)
      WHERE jsonb_typeof(raw_entry.value) = 'string'
        AND (raw_entry.value #>> '{}') !~ '^[[:space:]]*$'
        AND length(raw_entry.value #>> '{}') <= 160
      ORDER BY raw_entry.value #>> '{}', raw_entry.ordinality
    ) AS deduplicated
    WHERE EXISTS (
      SELECT 1
      FROM "skills" AS skill
      WHERE skill."isDeleted" = false
        AND jsonb_typeof(skill."config"->'slug') = 'string'
        AND skill."config"->>'slug' = deduplicated.value
        AND skill."config"->'isEnabled' = 'true'::jsonb
        AND skill."config"->>'status' IS DISTINCT FROM 'disabled'
        AND (
          skill."organizationId" = brand."organizationId"
          OR (
            skill."organizationId" IS NULL
            AND skill."config"->'isBuiltIn' = 'true'::jsonb
            AND skill."config"->>'source' = 'built_in'
            AND (
              (
                skill."id" = 'cskillbuiltincontentgeo'
                AND skill."config"->>'slug' = 'content-geo-optimizer'
              )
              OR (
                skill."id" = 'cskillbuiltincontentwrite'
                AND skill."config"->>'slug' = 'content-writing'
              )
              OR (
                skill."id" = 'cskillbuiltinimagegenerate'
                AND skill."config"->>'slug' = 'image-generation'
              )
              OR (
                skill."id" = 'cskillbuiltintrenddiscover'
                AND skill."config"->>'slug' = 'trend-discovery'
              )
              OR (
                skill."id" = 'cskillbuiltintrendremix'
                AND skill."config"->>'slug' = 'trend-remix'
              )
            )
          )
        )
    )
    ORDER BY deduplicated.ordinality
    LIMIT 100
  ) AS entry ON true
  WHERE jsonb_typeof(brand."agentConfig") = 'object'
    AND brand."agentConfig" ? 'enabledSkills'
  GROUP BY brand."id"
)
UPDATE "brands" AS brand
SET "agentConfig" = jsonb_set(
  brand."agentConfig",
  '{enabledSkills}',
  normalized.enabled_skills,
  true
)
FROM normalized_brand_skills AS normalized
WHERE brand."id" = normalized.brand_id;
