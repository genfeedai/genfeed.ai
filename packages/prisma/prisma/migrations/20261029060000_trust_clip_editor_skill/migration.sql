-- The first-party skill catalog gained clip-editor in 20261028180000, but
-- skill_is_trusted_builtin (the DB-side allowlist behind system ownership)
-- was never told. The stub row was therefore inserted as an ownerless,
-- quarantined row, and the reference-data sync's provisioning update then
-- failed with "Skill ownership is immutable", blocking the hosted deploy.
-- Add the slug to the allowlist, then repair the existing row in place.

CREATE OR REPLACE FUNCTION skill_is_trusted_builtin(skill_id TEXT, config JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path FROM CURRENT
AS $$
    SELECT
        config IS NOT NULL
        AND jsonb_typeof(config) = 'object'
        AND config->>'isBuiltIn' = 'true'
        AND config->>'source' = 'built_in'
        AND COALESCE(config->>'slug', '') <> ''
        AND skill_id = skill_builtin_id(config->>'slug')
        AND (config->>'slug') IN (
            'ad-copy-creator',
            'ad-performance-analyzer',
            'blog-content-creator',
            'brand-interview',
            'brand-os-architect',
            'cinematic-prompting',
            'clip-editor',
            'competitor-analyzer',
            'content-atomizer',
            'content-geo-optimizer',
            'content-reviewer',
            'content-seo-optimizer',
            'content-strategist',
            'content-writing',
            'genfeed-brand-os',
            'image-generation',
            'image-prompt-engineer',
            'instagram-content-creator',
            'instagram-warmup',
            'launch-copy-creator',
            'linkedin-content-creator',
            'linkedin-warmup',
            'model-selector',
            'newsletter-creator',
            'node-creator',
            'onboarding',
            'openclaw-integration',
            'prompt-generator',
            'scope-validator',
            'tiktok-warmup',
            'trend-discovery',
            'trend-remix',
            'visual-brand-kit',
            'workflow-creator',
            'x-content-creator',
            'x-warmup',
            'youtube-content-creator',
            'youtube-warmup'
        );
$$;

-- Repair the stub row. Under the 'repair' origin the capture trigger
-- re-derives ownership from the (now trusted) built-in identity: system
-- owner, not quarantined. A no-op where the row does not exist.
DO $$
BEGIN
    PERFORM set_config('genfeed.skill_write_origin', 'repair', true);
    UPDATE "skills"
    SET "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = 'cskillbuiltinclipeditor'
      AND "organizationId" IS NULL
      AND "ownerKind" IS NULL;
    PERFORM set_config('genfeed.skill_write_origin', '', true);
END;
$$;
