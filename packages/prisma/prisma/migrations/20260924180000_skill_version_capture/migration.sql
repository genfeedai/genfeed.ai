-- Release A of the scoped skill library (#5104).
-- Expands ownership and immutable version storage, and captures legacy config
-- writes. New private organization/brand lifecycle stays off until every reader
-- is policy-aware. Hashes use core sha256, not pgcrypto.

CREATE FUNCTION skill_stable_json(value JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path FROM CURRENT
AS $$
DECLARE
    result TEXT;
BEGIN
    CASE jsonb_typeof(value)
        WHEN 'object' THEN
            SELECT '{' || COALESCE(
                string_agg(
                    to_jsonb(entry.key)::text || ':' || skill_stable_json(entry.value),
                    ',' ORDER BY entry.key COLLATE "C"
                ),
                ''
            ) || '}'
            INTO result
            FROM jsonb_each(value) AS entry;
            RETURN result;
        WHEN 'array' THEN
            SELECT '[' || COALESCE(
                string_agg(
                    skill_stable_json(entry.value),
                    ',' ORDER BY entry.ordinality
                ),
                ''
            ) || ']'
            INTO result
            FROM jsonb_array_elements(value) WITH ORDINALITY AS entry(value, ordinality);
            RETURN result;
        WHEN 'number' THEN
            RETURN trim_scale((value #>> '{}')::numeric)::text;
        ELSE
            RETURN value::text;
    END CASE;
END;
$$;

CREATE FUNCTION skill_content_hash(payload JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path FROM CURRENT
AS $$
    SELECT 'sha256:skill-v1:' || encode(
        pg_catalog.sha256(convert_to(skill_stable_json(payload), 'UTF8')),
        'hex'
    );
$$;

CREATE FUNCTION skill_instruction_hash(instruction TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path FROM CURRENT
AS $$
    SELECT 'sha256:skill-instruction-v1:' || encode(
        pg_catalog.sha256(convert_to(COALESCE(instruction, ''), 'UTF8')),
        'hex'
    );
$$;

CREATE FUNCTION skill_version_id(skill_id TEXT, version_number INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path FROM CURRENT
AS $$
    SELECT 'sv1_' || skill_id || '_' || version_number::text;
$$;

CREATE FUNCTION skill_builtin_id(slug TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path FROM CURRENT
AS $$
    SELECT CASE slug
        WHEN 'content-geo-optimizer' THEN 'cskillbuiltincontentgeo'
        WHEN 'content-writing' THEN 'cskillbuiltincontentwrite'
        WHEN 'image-generation' THEN 'cskillbuiltinimagegenerate'
        WHEN 'trend-discovery' THEN 'cskillbuiltintrenddiscover'
        WHEN 'trend-remix' THEN 'cskillbuiltintrendremix'
        ELSE 'cskillbuiltin' || regexp_replace(lower(COALESCE(slug, '')), '[^a-z0-9]', '', 'g')
    END;
$$;

CREATE FUNCTION skill_is_trusted_builtin(skill_id TEXT, config JSONB)
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

CREATE FUNCTION skill_legacy_snapshot(row_label TEXT, config JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path FROM CURRENT
AS $$
DECLARE
    preserved JSONB;
    instruction TEXT := '';
    source_field TEXT;
    usable BOOLEAN := false;
BEGIN
    IF config IS NULL OR jsonb_typeof(config) <> 'object' THEN
        RETURN jsonb_build_object(
            'format', 'genfeed.skill.invalid-legacy-snapshot.v1',
            'label', COALESCE(row_label, ''),
            'rawConfig', COALESCE(config, 'null'::jsonb)
        );
    END IF;

    SELECT COALESCE(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    INTO preserved
    FROM jsonb_each(config) AS entry(key, value)
    WHERE entry.key NOT IN ('isEnabled', 'status');

    IF jsonb_typeof(config->'systemPromptTemplate') = 'string'
       AND length(config->>'systemPromptTemplate') > 0 THEN
        instruction := config->>'systemPromptTemplate';
        source_field := 'systemPromptTemplate';
        usable := length(btrim(instruction)) > 0;
    ELSIF jsonb_typeof(config->'defaultInstructions') = 'string'
       AND length(config->>'defaultInstructions') > 0 THEN
        instruction := config->>'defaultInstructions';
        source_field := 'defaultInstructions';
        usable := length(btrim(instruction)) > 0;
    END IF;

    RETURN jsonb_build_object(
        'format', 'genfeed.skill.legacy-snapshot.v1',
        'label', COALESCE(row_label, ''),
        'instructions', jsonb_build_object(
            'text', instruction,
            'sourceField', source_field
        ),
        'instructionUsable', usable,
        'config', preserved
    );
END;
$$;

ALTER TABLE "skills"
    ADD COLUMN "ownerKind" TEXT,
    ADD COLUMN "ownerUserId" TEXT,
    ADD COLUMN "brandId" TEXT,
    ADD COLUMN "audience" TEXT,
    ADD COLUMN "isQuarantined" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "latestVersionNumber" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "currentVersionId" TEXT,
    ADD COLUMN "sharedVersionId" TEXT,
    ADD COLUMN "publishedVersionId" TEXT;

UPDATE "skills"
SET
    "ownerKind" = CASE
        WHEN "organizationId" IS NULL AND skill_is_trusted_builtin("id", "config") THEN 'system'
        WHEN "organizationId" IS NOT NULL THEN 'organization'
        ELSE NULL
    END,
    "audience" = CASE
        WHEN "organizationId" IS NOT NULL THEN 'organization'
        ELSE 'private'
    END,
    "isQuarantined" = (
        "organizationId" IS NULL
        AND NOT skill_is_trusted_builtin("id", "config")
    );

ALTER TABLE "skills" ALTER COLUMN "audience" SET NOT NULL;

CREATE TABLE "skill_versions" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "instructionText" TEXT NOT NULL DEFAULT '',
    "instructionSourceField" TEXT,
    "instructionUsable" BOOLEAN NOT NULL DEFAULT false,
    "contentHash" TEXT NOT NULL,
    "instructionHash" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skill_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "skill_versions_skill_version_key" UNIQUE ("skillId", "versionNumber"),
    CONSTRAINT "skill_versions_id_skill_key" UNIQUE ("id", "skillId")
);

CREATE TABLE "skill_grants" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "skillVersionId" TEXT NOT NULL,
    "recipientKind" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "recipientOrganizationId" TEXT,
    "recipientBrandId" TEXT,
    "access" TEXT NOT NULL DEFAULT 'use',
    "grantedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skill_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "skill_grants_shape_check" CHECK (
        "access" IN ('use', 'use_and_read')
        AND (
            (
                "recipientKind" = 'user'
                AND "recipientUserId" IS NOT NULL
                AND "recipientOrganizationId" IS NULL
                AND "recipientBrandId" IS NULL
            )
            OR (
                "recipientKind" = 'organization'
                AND "recipientUserId" IS NULL
                AND "recipientOrganizationId" IS NOT NULL
                AND "recipientBrandId" IS NULL
            )
            OR (
                "recipientKind" = 'brand'
                AND "recipientUserId" IS NULL
                AND "recipientOrganizationId" IS NOT NULL
                AND "recipientBrandId" IS NOT NULL
            )
        )
    )
);

CREATE TABLE "skill_assignments" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "skillVersionId" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "userId" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "skill_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "skill_assignments_shape_check" CHECK (
        (
            "targetKind" = 'user'
            AND "userId" IS NOT NULL
            AND "brandId" IS NULL
        )
        OR (
            "targetKind" = 'organization'
            AND "userId" IS NULL
            AND "brandId" IS NULL
        )
        OR (
            "targetKind" = 'brand'
            AND "userId" IS NULL
            AND "brandId" IS NOT NULL
        )
    )
);

CREATE TABLE "skill_publications" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "skillVersionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skill_publications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "skill_publications_shape_check" CHECK (
        "action" IN ('publish', 'unpublish')
        AND "audience" IN ('organization', 'public')
    )
);

CREATE TABLE "skill_resolutions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skill_resolutions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "skill_resolution_items" (
    "id" TEXT NOT NULL,
    "resolutionId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "skillVersionId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "inclusion" TEXT NOT NULL,
    "exclusionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skill_resolution_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "skill_resolution_items_shape_check" CHECK (
        "origin" IN ('assignment', 'selection', 'default', 'catalog')
        AND "inclusion" IN ('included', 'excluded')
        AND (
            ("inclusion" = 'included' AND "exclusionReason" IS NULL)
            OR ("inclusion" = 'excluded' AND "exclusionReason" IS NOT NULL)
        )
    )
);

CREATE TABLE "generation_prompt_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT,
    "resolutionId" TEXT,
    "workflowExecutionId" TEXT,
    "providerAttemptRef" TEXT,
    "format" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "retentionState" TEXT NOT NULL DEFAULT 'retained',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generation_prompt_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "generation_prompt_snapshots_ciphertext_check" CHECK (
        "ciphertext" ~ '^[0-9a-fA-F]{32}:[0-9a-fA-F]+:[0-9a-fA-F]{32}$'
        AND "retentionState" IN ('retained', 'purged')
    )
);

CREATE TABLE "skill_migration_findings" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skill_migration_findings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "skill_versions"
    ADD CONSTRAINT "skill_versions_skill_fkey"
    FOREIGN KEY ("skillId") REFERENCES "skills"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "skill_versions"
    ADD CONSTRAINT "skill_versions_created_by_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skills"
    ADD CONSTRAINT "skills_owner_user_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skills"
    ADD CONSTRAINT "skills_owner_brand_fkey"
    FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skills"
    ADD CONSTRAINT "skills_current_version_fkey"
    FOREIGN KEY ("currentVersionId") REFERENCES "skill_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "skills"
    ADD CONSTRAINT "skills_current_version_same_skill_fkey"
    FOREIGN KEY ("currentVersionId", "id") REFERENCES "skill_versions"("id", "skillId")
    ON DELETE RESTRICT ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "skills"
    ADD CONSTRAINT "skills_shared_version_same_skill_fkey"
    FOREIGN KEY ("sharedVersionId", "id") REFERENCES "skill_versions"("id", "skillId")
    ON DELETE RESTRICT ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "skills"
    ADD CONSTRAINT "skills_published_version_same_skill_fkey"
    FOREIGN KEY ("publishedVersionId", "id") REFERENCES "skill_versions"("id", "skillId")
    ON DELETE RESTRICT ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "skills"
    ADD CONSTRAINT "skills_owner_shape_check" CHECK (
        "audience" IN ('private', 'organization', 'public')
        AND (
            (
                "isQuarantined" = true
                AND "audience" = 'private'
                AND "sharedVersionId" IS NULL
                AND "publishedVersionId" IS NULL
                AND (
                    (
                        "ownerKind" IS NULL
                        AND "ownerUserId" IS NULL
                        AND "organizationId" IS NULL
                        AND "brandId" IS NULL
                    )
                    OR (
                        "ownerKind" = 'user'
                        AND "ownerUserId" IS NOT NULL
                        AND "organizationId" IS NULL
                        AND "brandId" IS NULL
                    )
                    OR (
                        "ownerKind" = 'organization'
                        AND "ownerUserId" IS NULL
                        AND "organizationId" IS NOT NULL
                        AND "brandId" IS NULL
                    )
                    OR (
                        "ownerKind" = 'brand'
                        AND "ownerUserId" IS NULL
                        AND "organizationId" IS NOT NULL
                        AND "brandId" IS NOT NULL
                    )
                )
            )
            OR (
                "isQuarantined" = false
                AND "ownerKind" = 'system'
                AND "ownerUserId" IS NULL
                AND "organizationId" IS NULL
                AND "brandId" IS NULL
                AND "audience" = 'private'
                AND "publishedVersionId" IS NULL
            )
            OR (
                "isQuarantined" = false
                AND "ownerKind" = 'user'
                AND "ownerUserId" IS NOT NULL
                AND "organizationId" IS NULL
                AND "brandId" IS NULL
                AND "audience" IN ('private', 'public')
            )
            OR (
                "isQuarantined" = false
                AND "ownerKind" = 'organization'
                AND "ownerUserId" IS NULL
                AND "organizationId" IS NOT NULL
                AND "brandId" IS NULL
                AND "audience" IN ('private', 'organization', 'public')
            )
            OR (
                "isQuarantined" = false
                AND "ownerKind" = 'brand'
                AND "ownerUserId" IS NULL
                AND "organizationId" IS NOT NULL
                AND "brandId" IS NOT NULL
                AND "audience" IN ('private', 'organization', 'public')
            )
        )
    );

ALTER TABLE "skill_grants"
    ADD CONSTRAINT "skill_grants_skill_fkey"
    FOREIGN KEY ("skillId") REFERENCES "skills"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_grants"
    ADD CONSTRAINT "skill_grants_version_fkey"
    FOREIGN KEY ("skillVersionId", "skillId") REFERENCES "skill_versions"("id", "skillId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_grants"
    ADD CONSTRAINT "skill_grants_recipient_user_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_grants"
    ADD CONSTRAINT "skill_grants_recipient_org_fkey"
    FOREIGN KEY ("recipientOrganizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_grants"
    ADD CONSTRAINT "skill_grants_recipient_brand_fkey"
    FOREIGN KEY ("recipientBrandId", "recipientOrganizationId")
    REFERENCES "brands"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_grants"
    ADD CONSTRAINT "skill_grants_granted_by_fkey"
    FOREIGN KEY ("grantedById") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_assignments"
    ADD CONSTRAINT "skill_assignments_skill_fkey"
    FOREIGN KEY ("skillId") REFERENCES "skills"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_assignments"
    ADD CONSTRAINT "skill_assignments_version_fkey"
    FOREIGN KEY ("skillVersionId", "skillId") REFERENCES "skill_versions"("id", "skillId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_assignments"
    ADD CONSTRAINT "skill_assignments_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_assignments"
    ADD CONSTRAINT "skill_assignments_brand_fkey"
    FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_assignments"
    ADD CONSTRAINT "skill_assignments_user_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_publications"
    ADD CONSTRAINT "skill_publications_skill_fkey"
    FOREIGN KEY ("skillId") REFERENCES "skills"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_publications"
    ADD CONSTRAINT "skill_publications_version_fkey"
    FOREIGN KEY ("skillVersionId", "skillId") REFERENCES "skill_versions"("id", "skillId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_publications"
    ADD CONSTRAINT "skill_publications_actor_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_resolutions"
    ADD CONSTRAINT "skill_resolutions_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_resolutions"
    ADD CONSTRAINT "skill_resolutions_user_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_resolutions"
    ADD CONSTRAINT "skill_resolutions_brand_fkey"
    FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_resolution_items"
    ADD CONSTRAINT "skill_resolution_items_resolution_fkey"
    FOREIGN KEY ("resolutionId") REFERENCES "skill_resolutions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_resolution_items"
    ADD CONSTRAINT "skill_resolution_items_skill_fkey"
    FOREIGN KEY ("skillId") REFERENCES "skills"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "skill_resolution_items"
    ADD CONSTRAINT "skill_resolution_items_version_fkey"
    FOREIGN KEY ("skillVersionId", "skillId") REFERENCES "skill_versions"("id", "skillId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "generation_prompt_snapshots"
    ADD CONSTRAINT "generation_prompt_snapshots_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "generation_prompt_snapshots"
    ADD CONSTRAINT "generation_prompt_snapshots_user_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "generation_prompt_snapshots"
    ADD CONSTRAINT "generation_prompt_snapshots_brand_fkey"
    FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "generation_prompt_snapshots"
    ADD CONSTRAINT "generation_prompt_snapshots_resolution_fkey"
    FOREIGN KEY ("resolutionId") REFERENCES "skill_resolutions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "skills_owner_user_deleted_idx" ON "skills"("ownerUserId", "isDeleted");
CREATE INDEX "skills_org_brand_deleted_idx" ON "skills"("organizationId", "brandId", "isDeleted");
CREATE INDEX "skills_uncaptured_idx" ON "skills"("id") WHERE "currentVersionId" IS NULL;
CREATE INDEX "skill_versions_skill_version_desc_idx" ON "skill_versions"("skillId", "versionNumber" DESC);
CREATE INDEX "skill_grants_version_revoked_idx" ON "skill_grants"("skillId", "skillVersionId", "revokedAt");
CREATE INDEX "skill_grants_recipient_user_idx" ON "skill_grants"("recipientUserId", "revokedAt");
CREATE INDEX "skill_grants_recipient_org_idx" ON "skill_grants"("recipientOrganizationId", "revokedAt");
CREATE INDEX "skill_assignments_org_deleted_enabled_idx" ON "skill_assignments"("organizationId", "isDeleted", "isEnabled");
CREATE INDEX "skill_assignments_org_user_deleted_idx" ON "skill_assignments"("organizationId", "userId", "isDeleted");
CREATE INDEX "skill_assignments_org_brand_deleted_idx" ON "skill_assignments"("organizationId", "brandId", "isDeleted");
CREATE INDEX "skill_publications_skill_created_idx" ON "skill_publications"("skillId", "createdAt" DESC);
CREATE INDEX "skill_resolutions_org_deleted_created_idx" ON "skill_resolutions"("organizationId", "isDeleted", "createdAt" DESC);
CREATE INDEX "skill_resolutions_org_user_deleted_idx" ON "skill_resolutions"("organizationId", "userId", "isDeleted");
CREATE INDEX "skill_resolution_items_resolution_idx" ON "skill_resolution_items"("resolutionId");
CREATE INDEX "generation_prompt_snapshots_org_deleted_created_idx" ON "generation_prompt_snapshots"("organizationId", "isDeleted", "createdAt" DESC);
CREATE INDEX "generation_prompt_snapshots_org_user_deleted_idx" ON "generation_prompt_snapshots"("organizationId", "userId", "isDeleted");

CREATE UNIQUE INDEX "skill_assignments_user_active_uidx"
    ON "skill_assignments"("skillId", "organizationId", "userId")
    WHERE "isDeleted" = false AND "targetKind" = 'user';

CREATE UNIQUE INDEX "skill_assignments_org_active_uidx"
    ON "skill_assignments"("skillId", "organizationId")
    WHERE "isDeleted" = false AND "targetKind" = 'organization';

CREATE UNIQUE INDEX "skill_assignments_brand_active_uidx"
    ON "skill_assignments"("skillId", "organizationId", "brandId")
    WHERE "isDeleted" = false AND "targetKind" = 'brand';

CREATE FUNCTION skill_version_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Skill versions are immutable';
    END IF;
    IF current_setting('genfeed.skill_version_capture', true) IS DISTINCT FROM '1' THEN
        RAISE EXCEPTION 'Skill versions are append-only through capture';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER skill_version_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "skill_versions"
    FOR EACH ROW EXECUTE FUNCTION skill_version_guard();

CREATE FUNCTION skill_publication_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
    RAISE EXCEPTION 'Skill publications are append-only';
END;
$$;

CREATE TRIGGER skill_publication_guard
    BEFORE UPDATE OR DELETE ON "skill_publications"
    FOR EACH ROW EXECUTE FUNCTION skill_publication_guard();

CREATE FUNCTION skill_grant_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Skill grants are revoked, not deleted';
    END IF;
    IF NEW."skillId" IS DISTINCT FROM OLD."skillId"
       OR NEW."skillVersionId" IS DISTINCT FROM OLD."skillVersionId"
       OR NEW."recipientKind" IS DISTINCT FROM OLD."recipientKind"
       OR NEW."recipientUserId" IS DISTINCT FROM OLD."recipientUserId"
       OR NEW."recipientOrganizationId" IS DISTINCT FROM OLD."recipientOrganizationId"
       OR NEW."recipientBrandId" IS DISTINCT FROM OLD."recipientBrandId"
       OR NEW."access" IS DISTINCT FROM OLD."access"
       OR NEW."grantedById" IS DISTINCT FROM OLD."grantedById"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR NEW."id" IS DISTINCT FROM OLD."id" THEN
        RAISE EXCEPTION 'Skill grant identity is immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER skill_grant_guard
    BEFORE UPDATE OR DELETE ON "skill_grants"
    FOR EACH ROW EXECUTE FUNCTION skill_grant_guard();

CREATE FUNCTION skill_capture_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
    origin TEXT;
    actor TEXT;
    snapshot JSONB;
    instruction_text TEXT;
    source_field TEXT;
    usable BOOLEAN;
    head_payload JSONB;
    content_changed BOOLEAN;
    lifecycle_changed BOOLEAN;
    next_number INTEGER;
    version_id TEXT;
    activate_id TEXT;
    target_payload JSONB;
    target_hash TEXT;
    target_number INTEGER;
BEGIN
    origin := nullif(current_setting('genfeed.skill_write_origin', true), '');
    actor := nullif(current_setting('genfeed.skill_actor_id', true), '');

    IF actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = actor) THEN
        RAISE EXCEPTION 'Skill write actor does not exist';
    END IF;

    IF origin = 'provisioning' THEN
        IF NEW."organizationId" IS NOT NULL
           OR NEW."ownerUserId" IS NOT NULL
           OR NEW."brandId" IS NOT NULL
           OR (NEW."ownerKind" IS NOT NULL AND NEW."ownerKind" IS DISTINCT FROM 'system') THEN
            RAISE EXCEPTION 'System catalog skills cannot carry tenant ownership';
        END IF;
        NEW."ownerKind" := 'system';
        NEW."isQuarantined" := false;
    ELSIF NEW."ownerKind" IS NULL THEN
        IF NEW."organizationId" IS NOT NULL AND NEW."brandId" IS NOT NULL AND NEW."ownerUserId" IS NULL THEN
            NEW."ownerKind" := 'brand';
        ELSIF NEW."organizationId" IS NOT NULL AND NEW."brandId" IS NULL AND NEW."ownerUserId" IS NULL THEN
            NEW."ownerKind" := 'organization';
        ELSIF NEW."ownerUserId" IS NOT NULL AND NEW."organizationId" IS NULL AND NEW."brandId" IS NULL THEN
            NEW."ownerKind" := 'user';
        ELSIF NEW."organizationId" IS NULL AND skill_is_trusted_builtin(NEW."id", NEW."config") THEN
            NEW."ownerKind" := 'system';
            NEW."isQuarantined" := false;
        ELSE
            NEW."ownerKind" := NULL;
            NEW."ownerUserId" := NULL;
            NEW."organizationId" := NULL;
            NEW."brandId" := NULL;
            NEW."isQuarantined" := true;
        END IF;
    END IF;

    IF NEW."ownerKind" = 'system'
       AND coalesce(origin, '') NOT IN ('provisioning', 'repair')
       AND (TG_OP = 'INSERT' OR OLD."ownerKind" IS DISTINCT FROM 'system') THEN
        RAISE EXCEPTION 'Only server provisioning can create system-owned skills';
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD."ownerKind" = 'system'
       AND coalesce(origin, '') NOT IN ('provisioning', 'repair', 'capture') THEN
        RAISE EXCEPTION 'System catalog skills can only be changed by server provisioning';
    END IF;

    IF TG_OP = 'UPDATE'
       AND coalesce(origin, '') IS DISTINCT FROM 'repair'
       AND (
           NEW."ownerKind" IS DISTINCT FROM OLD."ownerKind"
           OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId"
           OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
           OR NEW."brandId" IS DISTINCT FROM OLD."brandId"
       ) THEN
        RAISE EXCEPTION 'Skill ownership is immutable';
    END IF;

    IF NEW."audience" IS NULL THEN
        IF NEW."ownerKind" IN ('organization', 'brand') THEN
            NEW."audience" := 'organization';
        ELSE
            NEW."audience" := 'private';
        END IF;
    END IF;

    snapshot := skill_legacy_snapshot(NEW."label", NEW."config");
    IF snapshot->>'format' = 'genfeed.skill.invalid-legacy-snapshot.v1' THEN
        IF NEW."ownerKind" = 'system' THEN
            RAISE EXCEPTION 'System catalog skills require an object config';
        END IF;
        instruction_text := '';
        source_field := NULL;
        usable := false;
        NEW."isQuarantined" := true;
        NEW."audience" := 'private';
        NEW."sharedVersionId" := NULL;
        NEW."publishedVersionId" := NULL;
    ELSE
        instruction_text := COALESCE(snapshot #>> '{instructions,text}', '');
        source_field := snapshot #>> '{instructions,sourceField}';
        usable := COALESCE((snapshot->>'instructionUsable')::boolean, false);
    END IF;

    IF NEW."audience" = 'public' AND NEW."publishedVersionId" IS NULL THEN
        RAISE EXCEPTION 'Public audience requires an explicit published version';
    END IF;

    IF NEW."ownerKind" = 'system' AND NEW."audience" IS DISTINCT FROM 'private' THEN
        RAISE EXCEPTION 'System catalog skills are not publicly published';
    END IF;

    IF NEW."ownerKind" = 'user' AND NEW."audience" = 'organization' THEN
        RAISE EXCEPTION 'Personal skills use grants rather than organization audience';
    END IF;

    activate_id := nullif(current_setting('genfeed.skill_activate_version_id', true), '');
    IF TG_OP = 'UPDATE' AND activate_id IS NOT NULL THEN
        SELECT "payload", "contentHash", "versionNumber"
        INTO target_payload, target_hash, target_number
        FROM "skill_versions"
        WHERE "id" = activate_id AND "skillId" = NEW."id";
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Skill activation target is not a version of this skill';
        END IF;
        IF target_payload IS DISTINCT FROM snapshot
           OR target_hash IS DISTINCT FROM skill_content_hash(snapshot) THEN
            RAISE EXCEPTION 'Skill activation payload does not match the target version';
        END IF;
        NEW."currentVersionId" := activate_id;
        NEW."latestVersionNumber" := OLD."latestVersionNumber";
        NEW."revision" := OLD."revision" + 1;
        RETURN NEW;
    END IF;

    head_payload := NULL;
    IF TG_OP = 'UPDATE' AND OLD."currentVersionId" IS NOT NULL THEN
        SELECT "payload" INTO head_payload
        FROM "skill_versions"
        WHERE "id" = OLD."currentVersionId";
    END IF;

    content_changed := head_payload IS NULL OR head_payload IS DISTINCT FROM snapshot;
    lifecycle_changed := TG_OP = 'UPDATE' AND (
        NEW."isDeleted" IS DISTINCT FROM OLD."isDeleted"
        OR NEW."config"->'status' IS DISTINCT FROM OLD."config"->'status'
        OR NEW."config"->'isEnabled' IS DISTINCT FROM OLD."config"->'isEnabled'
        OR NEW."audience" IS DISTINCT FROM OLD."audience"
        OR NEW."isQuarantined" IS DISTINCT FROM OLD."isQuarantined"
        OR NEW."sharedVersionId" IS DISTINCT FROM OLD."sharedVersionId"
        OR NEW."publishedVersionId" IS DISTINCT FROM OLD."publishedVersionId"
    );

    IF TG_OP = 'UPDATE' AND NOT content_changed AND NOT lifecycle_changed THEN
        NEW."revision" := OLD."revision";
        NEW."latestVersionNumber" := OLD."latestVersionNumber";
        NEW."currentVersionId" := OLD."currentVersionId";
        NEW."sharedVersionId" := OLD."sharedVersionId";
        NEW."publishedVersionId" := OLD."publishedVersionId";
        RETURN NEW;
    END IF;

    IF content_changed THEN
        next_number := CASE
            WHEN TG_OP = 'INSERT' THEN 1
            ELSE COALESCE(OLD."latestVersionNumber", 0) + 1
        END;
        version_id := skill_version_id(NEW."id", next_number);
        PERFORM set_config('genfeed.skill_version_capture', '1', true);
        INSERT INTO "skill_versions" (
            "id",
            "skillId",
            "versionNumber",
            "format",
            "payload",
            "instructionText",
            "instructionSourceField",
            "instructionUsable",
            "contentHash",
            "instructionHash",
            "createdById"
        ) VALUES (
            version_id,
            NEW."id",
            next_number,
            snapshot->>'format',
            snapshot,
            instruction_text,
            source_field,
            usable,
            skill_content_hash(snapshot),
            skill_instruction_hash(instruction_text),
            actor
        );
        NEW."currentVersionId" := version_id;
        NEW."latestVersionNumber" := next_number;
    ELSE
        NEW."currentVersionId" := OLD."currentVersionId";
        NEW."latestVersionNumber" := OLD."latestVersionNumber";
    END IF;

    NEW."revision" := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE OLD."revision" + 1 END;
    RETURN NEW;
END;
$$;

CREATE TRIGGER skill_capture_version
    BEFORE INSERT OR UPDATE ON "skills"
    FOR EACH ROW EXECUTE FUNCTION skill_capture_version();

CREATE FUNCTION skill_backfill_capture(batch_size INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
    captured INTEGER := 0;
    skill_row RECORD;
    previous_origin TEXT;
BEGIN
    IF batch_size IS NULL OR batch_size < 1 OR batch_size > 500 THEN
        RAISE EXCEPTION 'skill backfill batch_size must be between 1 and 500';
    END IF;

    previous_origin := current_setting('genfeed.skill_write_origin', true);
    PERFORM set_config('genfeed.skill_write_origin', 'capture', true);

    FOR skill_row IN
        SELECT "id"
        FROM "skills"
        WHERE "currentVersionId" IS NULL
        ORDER BY "id"
        FOR UPDATE SKIP LOCKED
        LIMIT batch_size
    LOOP
        UPDATE "skills"
        SET "label" = "label"
        WHERE "id" = skill_row."id";
        captured := captured + 1;
    END LOOP;

    PERFORM set_config('genfeed.skill_write_origin', COALESCE(previous_origin, ''), true);
    RETURN captured;
END;
$$;

DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT count(*) INTO duplicate_count FROM (
        SELECT 1
        FROM "skills"
        WHERE "isDeleted" = false
          AND "isQuarantined" = false
          AND "ownerKind" = 'organization'
          AND "organizationId" IS NOT NULL
          AND COALESCE("config"->>'slug', '') <> ''
        GROUP BY "organizationId", "config"->>'slug'
        HAVING count(*) > 1
    ) duplicates;

    IF duplicate_count = 0 THEN
        CREATE UNIQUE INDEX "skills_organization_slug_active_uidx"
            ON "skills"("organizationId", (("config"->>'slug')))
            WHERE "isDeleted" = false
              AND "isQuarantined" = false
              AND "ownerKind" = 'organization'
              AND "organizationId" IS NOT NULL
              AND COALESCE("config"->>'slug', '') <> '';
    ELSE
        INSERT INTO "skill_migration_findings" ("id", "kind", "detail")
        SELECT
            'slug-org-' || md5("organizationId" || ':' || ("config"->>'slug')),
            'duplicate-organization-slug',
            jsonb_build_object(
                'organizationId', "organizationId",
                'slug', "config"->>'slug',
                'skillIds', jsonb_agg("id" ORDER BY "id")
            )
        FROM "skills"
        WHERE "isDeleted" = false
          AND "isQuarantined" = false
          AND "ownerKind" = 'organization'
          AND "organizationId" IS NOT NULL
          AND COALESCE("config"->>'slug', '') <> ''
        GROUP BY "organizationId", "config"->>'slug'
        HAVING count(*) > 1;
    END IF;
END $$;
