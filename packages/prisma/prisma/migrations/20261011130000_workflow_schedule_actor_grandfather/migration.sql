-- One-off data cleanup for the Cloud schedule-actor release (#6706, with #6682/#6692/#6703).
-- Production rows predate "workflows"."scheduleInitiatingActor" and "platformSeedKey", so the Cloud
-- scheduler would pause every enabled schedule on its first run after this release. Data only, no
-- DDL, so it is safe on an empty database, on self-hosted (the scheduler ignores the actor there)
-- and when re-run (every statement skips rows it already handled).

DO $$
DECLARE
  removed_duplicates integer;
  bound_actors integer;
BEGIN
  -- Step 1: soft-delete duplicate seeded rows, same org + same template + same brand scope.
  -- The oldest row (createdAt, then id) is kept. A row something still points at is kept in
  -- preference to an older one, and is never deleted: the platform marker, the default-recurring
  -- slot, and the id lists and columns below name workflows by id without a foreign key.
  -- Workflow executions keep their foreign key to the soft-deleted row (history is untouched).
  -- The scheduler loads only live, enabled, active rows, so a deleted duplicate's queued job is
  -- unscheduled on its next tick and boot sync never registers it again.
  WITH seeded AS (
    SELECT
      w."id",
      w."organizationId",
      w."metadata"->>'sourceTemplateId' AS "templateId",
      COALESCE(w."brandId", '') AS "brandScope",
      w."createdAt",
      (
        w."platformSeedKey" IS NOT NULL
        OR w."defaultRecurringBrandId" IS NOT NULL
        OR EXISTS (SELECT 1 FROM "agent_strategies" a WHERE a."preferredWorkflowId" = w."id")
        OR EXISTS (SELECT 1 FROM "social_reply_campaigns" c WHERE c."workflowId" = w."id")
        OR EXISTS (SELECT 1 FROM "knowledge_sources" k WHERE k."refreshWorkflowId" = w."id")
        OR EXISTS (SELECT 1 FROM "turbo_projects" t WHERE t."workflowId" = w."id")
        OR EXISTS (SELECT 1 FROM "settings" s WHERE w."id" = ANY (s."favoriteWorkflowIds"))
        OR EXISTS (SELECT 1 FROM "platform_settings" p WHERE w."id" = ANY (p."featuredWorkflowIds"))
      ) AS "isPinned"
    FROM "workflows" w
    WHERE w."isDeleted" = false
      AND w."metadata"->>'sourceType' = 'seeded-template'
      AND COALESCE(w."metadata"->>'sourceTemplateId', '') <> ''
  ),
  ranked AS (
    SELECT
      s."id",
      s."isPinned",
      ROW_NUMBER() OVER (
        PARTITION BY s."organizationId", s."templateId", s."brandScope"
        ORDER BY s."isPinned" DESC, s."createdAt" ASC, s."id" ASC
      ) AS "position"
    FROM seeded s
  )
  UPDATE "workflows" w
  SET "isDeleted" = true,
      "isScheduleEnabled" = false,
      "scheduleInitiatingActor" = NULL,
      "updatedAt" = (now() AT TIME ZONE 'UTC')
  FROM ranked r
  WHERE r."id" = w."id"
    AND r."position" > 1
    AND r."isPinned" = false;
  GET DIAGNOSTICS removed_duplicates = ROW_COUNT;

  -- Step 2: grandfather the actor. An enabled, active schedule with no actor and no platform
  -- marker is bound to its owner, only while the owner is a live member of the workflow's
  -- organization (the same member, organization and role conditions BrandAccessService.resolve
  -- applies). That is who the row already runs as. The value is exactly what
  -- toScheduleInitiatingActorWrite stores for a session user (not an API key): no apiKeyId and
  -- an empty scopes list. The scheduler still re-checks membership and brand access on every
  -- fire. Owners who left stay unbound, so Cloud pauses those rows on their first run.
  UPDATE "workflows" w
  SET "scheduleInitiatingActor" = jsonb_build_object(
        'isApiKey', false,
        'organizationId', w."organizationId",
        'scopes', '[]'::jsonb,
        'userId', w."userId"
      ),
      "updatedAt" = (now() AT TIME ZONE 'UTC')
  WHERE w."isDeleted" = false
    AND w."isScheduleEnabled" = true
    AND w."status" = 'active'
    AND w."schedule" IS NOT NULL
    AND btrim(w."schedule") <> ''
    AND (
      w."scheduleInitiatingActor" IS NULL
      OR jsonb_typeof(w."scheduleInitiatingActor") = 'null'
    )
    AND w."platformSeedKey" IS NULL
    AND EXISTS (
      SELECT 1
      FROM "members" m
      JOIN "organizations" o ON o."id" = m."organizationId"
      JOIN "roles" r ON r."id" = m."roleId"
      WHERE m."userId" = w."userId"
        AND m."organizationId" = w."organizationId"
        AND m."isActive" = true
        AND m."isDeleted" = false
        AND o."isDeleted" = false
        AND r."isDeleted" = false
        AND r."key" IN ('owner', 'admin', 'creator', 'analytics', 'user', 'support')
    );
  GET DIAGNOSTICS bound_actors = ROW_COUNT;

  RAISE NOTICE 'workflow schedule actor grandfather (#6706): duplicates soft-deleted=%, actors bound=%',
    removed_duplicates, bound_actors;
END
$$;
