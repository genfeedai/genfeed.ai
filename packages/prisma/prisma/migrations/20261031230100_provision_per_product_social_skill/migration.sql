-- First-party product skills x-post, x-thread, x-article, linkedin-post,
-- linkedin-article, linkedin-carousel, instagram-post, instagram-carousel,
-- instagram-reel and instagram-story (skills/<slug>/SKILL.md), which replace
-- the x-, linkedin- and instagram-content-creator routers. Later additions to
-- the first-party catalog get their own migration because
-- 20260824120000_provision_first_party_skill_catalog is already applied and
-- immutable. Catalog-global stubs only; the full SKILL.md bodies are applied
-- by SkillCatalogSeedService in the reference-data sync. Re-running is
-- idempotent. The slugs are trusted by
-- 20261031230000_trust_per_product_social_skills, which runs first.

UPDATE "skills"
SET
  "isDeleted" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "organizationId" IS NOT NULL
  AND "isDeleted" = false
  AND COALESCE("config"->>'slug', '') = ANY (ARRAY[
    'instagram-carousel',
    'instagram-post',
    'instagram-reel',
    'instagram-story',
    'linkedin-article',
    'linkedin-carousel',
    'linkedin-post',
    'x-article',
    'x-post',
    'x-thread'
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
    'cskillbuiltininstagramcarousel',
    NULL,
    'Instagram Carousel',
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array(),
      'defaultInstructions', 'Plan and write an Instagram carousel; slide-by-slide copy, design spec, caption, hashtags and handoff to a local renderer for finished PNG slides. Use for "Instagram carousel", "carousel outline", "turn this into swipeable slides". For a single image use instagram-post; for LinkedIn use linkedin-carousel.',
      'description', 'Plan and write an Instagram carousel; slide-by-slide copy, design spec, caption, hashtags and handoff to a local renderer for finished PNG slides. Use for "Instagram carousel", "carousel outline", "turn this into swipeable slides". For a single image use instagram-post; for LinkedIn use linkedin-carousel.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', 'Instagram Carousel',
      'requiredProviders', jsonb_build_array(),
      'slug', 'instagram-carousel',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'version', '1.0.0',
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cskillbuiltininstagrampost',
    NULL,
    'Instagram Post',
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array(),
      'defaultInstructions', 'Write an Instagram feed post; the caption (hook, body, CTA), the hashtag set, alt text and the image brief for a single-image post. Use for "write an Instagram caption", "hashtag strategy", "IG post for this photo". For carousels use instagram-carousel; for Reels use instagram-reel; for Stories use instagram-story.',
      'description', 'Write an Instagram feed post; the caption (hook, body, CTA), the hashtag set, alt text and the image brief for a single-image post. Use for "write an Instagram caption", "hashtag strategy", "IG post for this photo". For carousels use instagram-carousel; for Reels use instagram-reel; for Stories use instagram-story.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', 'Instagram Post',
      'requiredProviders', jsonb_build_array(),
      'slug', 'instagram-post',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'version', '1.0.0',
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cskillbuiltininstagramreel',
    NULL,
    'Instagram Reel',
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array(),
      'defaultInstructions', 'Write an Instagram Reel; the hook, a timed shot-by-shot script with text overlays, the caption, audio direction and handoff to video tools. Use for "Reel script", "Instagram Reel idea", "short video for Instagram". For feed images use instagram-post; for Stories use instagram-story.',
      'description', 'Write an Instagram Reel; the hook, a timed shot-by-shot script with text overlays, the caption, audio direction and handoff to video tools. Use for "Reel script", "Instagram Reel idea", "short video for Instagram". For feed images use instagram-post; for Stories use instagram-story.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', 'Instagram Reel',
      'requiredProviders', jsonb_build_array(),
      'slug', 'instagram-reel',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'version', '1.0.0',
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cskillbuiltininstagramstory',
    NULL,
    'Instagram Story',
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array(),
      'defaultInstructions', 'Write an Instagram Story sequence; a 5-7 frame arc with on-frame text, stickers (poll, question, quiz, slider, countdown, link, add yours), a CTA and a weekly theme calendar. Use for "Instagram Stories", "story sequence", "plan my stories". For feed posts use instagram-post; for Reels use instagram-reel.',
      'description', 'Write an Instagram Story sequence; a 5-7 frame arc with on-frame text, stickers (poll, question, quiz, slider, countdown, link, add yours), a CTA and a weekly theme calendar. Use for "Instagram Stories", "story sequence", "plan my stories". For feed posts use instagram-post; for Reels use instagram-reel.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', 'Instagram Story',
      'requiredProviders', jsonb_build_array(),
      'slug', 'instagram-story',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'version', '1.0.0',
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cskillbuiltinlinkedinarticle',
    NULL,
    'Linkedin Article',
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array(),
      'defaultInstructions', 'Write a LinkedIn article or a LinkedIn newsletter edition; keyword-aware long-form of 1,500-2,500 words with a hook, sections, action steps and a feed post to promote it. Use for "write a LinkedIn article", "LinkedIn newsletter edition", "turn this into a LinkedIn article". For a short post use linkedin-post; for a PDF carousel use linkedin-carousel.',
      'description', 'Write a LinkedIn article or a LinkedIn newsletter edition; keyword-aware long-form of 1,500-2,500 words with a hook, sections, action steps and a feed post to promote it. Use for "write a LinkedIn article", "LinkedIn newsletter edition", "turn this into a LinkedIn article". For a short post use linkedin-post; for a PDF carousel use linkedin-carousel.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', 'Linkedin Article',
      'requiredProviders', jsonb_build_array(),
      'slug', 'linkedin-article',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'version', '1.0.0',
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cskillbuiltinlinkedincarousel',
    NULL,
    'Linkedin Carousel',
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array(),
      'defaultInstructions', 'Plan and write a LinkedIn carousel (a swipeable PDF document post); slide outline, copy per slide, design rules, caption, and handoff to a local renderer for finished PNG and PDF slides. Use for "LinkedIn carousel", "PDF post", "turn this into slides for LinkedIn". For a text post use linkedin-post; for an Instagram carousel use instagram-carousel.',
      'description', 'Plan and write a LinkedIn carousel (a swipeable PDF document post); slide outline, copy per slide, design rules, caption, and handoff to a local renderer for finished PNG and PDF slides. Use for "LinkedIn carousel", "PDF post", "turn this into slides for LinkedIn". For a text post use linkedin-post; for an Instagram carousel use instagram-carousel.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', 'Linkedin Carousel',
      'requiredProviders', jsonb_build_array(),
      'slug', 'linkedin-carousel',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'version', '1.0.0',
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cskillbuiltinlinkedinpost',
    NULL,
    'Linkedin Post',
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array(),
      'defaultInstructions', 'Write a LinkedIn text post; story, insight, contrarian, listicle, celebration or objection-to-thought-leadership. Covers hooks, the 1,000-1,300 character shape, tone, hashtags, first-comment links, comment strategy and a pre-publish checklist. Use for "write a LinkedIn post", "thought leadership post". For long-form use linkedin-article; for a document/PDF post use linkedin-carousel.',
      'description', 'Write a LinkedIn text post; story, insight, contrarian, listicle, celebration or objection-to-thought-leadership. Covers hooks, the 1,000-1,300 character shape, tone, hashtags, first-comment links, comment strategy and a pre-publish checklist. Use for "write a LinkedIn post", "thought leadership post". For long-form use linkedin-article; for a document/PDF post use linkedin-carousel.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', 'Linkedin Post',
      'requiredProviders', jsonb_build_array(),
      'slug', 'linkedin-post',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'version', '1.0.0',
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cskillbuiltinxarticle',
    NULL,
    'X Article',
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array(),
      'defaultInstructions', 'Write a long-form X Article, a titled and structured piece published natively on X, plus the promo post that sends the timeline to it. Covers title, header image, section structure, formatting and the launch post. Use for "write an X article", "long-form post on X", "turn this blog post into an X article". For a thread use x-thread; for a short post use x-post.',
      'description', 'Write a long-form X Article, a titled and structured piece published natively on X, plus the promo post that sends the timeline to it. Covers title, header image, section structure, formatting and the launch post. Use for "write an X article", "long-form post on X", "turn this blog post into an X article". For a thread use x-thread; for a short post use x-post.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', 'X Article',
      'requiredProviders', jsonb_build_array(),
      'slug', 'x-article',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'version', '1.0.0',
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cskillbuiltinxpost',
    NULL,
    'X Post',
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array(),
      'defaultInstructions', 'Write a single X (Twitter) post, quote post or reply that earns attention on its own. Covers hooks, the 280-character edit, quote and reply tactics, algorithm signals and a pre-post checklist. Use for "write a tweet", "draft an X post", "quote tweet", "reply to this post". For multi-post threads use x-thread; for long-form use x-article.',
      'description', 'Write a single X (Twitter) post, quote post or reply that earns attention on its own. Covers hooks, the 280-character edit, quote and reply tactics, algorithm signals and a pre-post checklist. Use for "write a tweet", "draft an X post", "quote tweet", "reply to this post". For multi-post threads use x-thread; for long-form use x-article.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', 'X Post',
      'requiredProviders', jsonb_build_array(),
      'slug', 'x-post',
      'source', 'built_in',
      'status', 'published',
      'toolOverrides', jsonb_build_array(),
      'version', '1.0.0',
      'workflowStage', 'creation'
    ),
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cskillbuiltinxthread',
    NULL,
    'X Thread',
    jsonb_build_object(
      'category', 'writing',
      'channels', jsonb_build_array(),
      'defaultInstructions', 'Write an X (Twitter) thread of 2 to 15 posts with a hook, a value chain and a closing CTA. Covers opening templates, one-idea-per-post rules, formatting, the self-reply TL;DR and bump. Use for "write a thread", "turn this into a thread", "X thread on...". For a single post use x-post; for long-form use x-article.',
      'description', 'Write an X (Twitter) thread of 2 to 15 posts with a hook, a value chain and a closing CTA. Covers opening templates, one-idea-per-post rules, formatting, the self-reply TL;DR and bump. Use for "write a thread", "turn this into a thread", "X thread on...". For a single post use x-post; for long-form use x-article.',
      'isBuiltIn', true,
      'isEnabled', true,
      'modalities', jsonb_build_array('text'),
      'name', 'X Thread',
      'requiredProviders', jsonb_build_array(),
      'slug', 'x-thread',
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
    WHERE NOT EXISTS (SELECT 1 FROM "skills" AS existing WHERE existing."id" = stub."id");

    PERFORM set_config('genfeed.skill_write_origin', '', true);
END;
$$;

-- Brands that enabled a retired router now enable the per-product skills it
-- split into. Order is kept and duplicates are dropped, so a brand that
-- already enabled a replacement keeps a single entry.
WITH router_split(retired_slug, replacement_slugs) AS (
  VALUES
  ('x-content-creator', ARRAY['x-post', 'x-thread', 'x-article']::text[]),
  ('linkedin-content-creator', ARRAY['linkedin-post', 'linkedin-article', 'linkedin-carousel']::text[]),
  ('instagram-content-creator', ARRAY['instagram-post', 'instagram-carousel', 'instagram-reel', 'instagram-story']::text[])
),
affected_brands AS MATERIALIZED (
  SELECT brand."id" AS brand_id, brand."agentConfig"->'enabledSkills' AS enabled_skills
  FROM "brands" AS brand
  WHERE jsonb_typeof(brand."agentConfig") = 'object'
    AND jsonb_typeof(brand."agentConfig"->'enabledSkills') = 'array'
    AND (brand."agentConfig"->'enabledSkills') ?| ARRAY['x-content-creator', 'linkedin-content-creator', 'instagram-content-creator']::text[]
),
expanded AS (
  SELECT
    affected.brand_id,
    entry.ordinality AS entry_position,
    replacement.position AS replacement_position,
    replacement.slug
  FROM affected_brands AS affected
  CROSS JOIN LATERAL jsonb_array_elements(affected.enabled_skills)
    WITH ORDINALITY AS entry(value, ordinality)
  CROSS JOIN LATERAL unnest(
    COALESCE(
      (SELECT split.replacement_slugs FROM router_split AS split
       WHERE split.retired_slug = entry.value #>> '{}'),
      ARRAY[entry.value #>> '{}']::text[]
    )
  ) WITH ORDINALITY AS replacement(slug, position)
  WHERE jsonb_typeof(entry.value) = 'string'
),
first_seen AS (
  SELECT brand_id, slug, min(entry_position * 100 + replacement_position) AS sort_key
  FROM expanded
  GROUP BY brand_id, slug
),
rebuilt AS (
  SELECT brand_id, jsonb_agg(to_jsonb(slug) ORDER BY sort_key) AS enabled_skills
  FROM first_seen
  GROUP BY brand_id
)
UPDATE "brands" AS brand
SET
  "agentConfig" = jsonb_set(
    brand."agentConfig",
    '{enabledSkills}',
    rebuilt.enabled_skills,
    true
  ),
  "updatedAt" = CURRENT_TIMESTAMP
FROM rebuilt
WHERE brand."id" = rebuilt.brand_id;

-- Retire the router rows and the organization assignments that point at them.
-- The reference-data sync attaches the replacement defaults to every
-- organization. Under the 'repair' origin the capture trigger accepts the
-- change to a system-owned row and records it as a lifecycle version.
DO $$
BEGIN
    PERFORM set_config('genfeed.skill_write_origin', 'repair', true);

    UPDATE "skill_assignments"
    SET "isDeleted" = true, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "skillId" IN ('cskillbuiltinxcontentcreator', 'cskillbuiltinlinkedincontentcreator', 'cskillbuiltininstagramcontentcreator')
      AND "isDeleted" = false;

    UPDATE "skills"
    SET "isDeleted" = true, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" IN ('cskillbuiltinxcontentcreator', 'cskillbuiltinlinkedincontentcreator', 'cskillbuiltininstagramcontentcreator')
      AND "organizationId" IS NULL
      AND "isDeleted" = false;

    PERFORM set_config('genfeed.skill_write_origin', '', true);
END;
$$;
