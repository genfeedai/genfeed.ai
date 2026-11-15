-- The pinned skills catalog gained motion-video and video-brand-profile.
-- skill_is_trusted_builtin (the DB-side allowlist behind system ownership)
-- must list the new slugs before the reference-data sync provisions them, or
-- the rows land ownerless and quarantined and the sync fails on "Skill
-- ownership is immutable" (see 20261029060000_trust_clip_editor_skill).

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
            'instagram-carousel',
            'instagram-post',
            'instagram-reel',
            'instagram-story',
            'instagram-warmup',
            'launch-copy-creator',
            'linkedin-article',
            'linkedin-carousel',
            'linkedin-post',
            'linkedin-warmup',
            'model-selector',
            'motion-video',
            'newsletter-creator',
            'node-creator',
            'onboarding',
            'openclaw-integration',
            'prompt-generator',
            'scope-validator',
            'tiktok-warmup',
            'trend-discovery',
            'trend-remix',
            'video-brand-profile',
            'visual-brand-kit',
            'workflow-creator',
            'x-article',
            'x-post',
            'x-thread',
            'x-warmup',
            'youtube-content-creator',
            'youtube-warmup'
        );
$$;
