-- One-off data migration for the Cloud schedule-actor release (#6706, with #6682/#6692/#6703).
-- Production rows predate "workflows"."scheduleInitiatingActor" and "platformSeedKey", so the Cloud
-- scheduler would pause every enabled schedule on its first run after this release. Data only, no
-- DDL, so it is safe on an empty database, on self-hosted (the scheduler ignores the actor there)
-- and when re-run (it skips rows that already have an actor).
--
-- It never deletes or disables a workflow. Template instantiation is intentionally not unique when
-- no key is set, so two live rows from the same template in one organization are a customer's own
-- workflows, not duplicates.

DO $$
DECLARE
  bound_actors integer;
BEGIN
  -- Grandfather the actor. An enabled, active schedule with no actor and no platform marker is
  -- bound to its owner, only while the owner is a live member of the workflow's organization (the
  -- same member, organization and role conditions BrandAccessService.resolve applies). That is who
  -- the row already runs as. The value is exactly what toScheduleInitiatingActorWrite stores for a
  -- session user (not an API key): no apiKeyId and an empty scopes list. The scheduler still
  -- re-checks membership and brand access on every fire. Owners who left stay unbound, so Cloud
  -- pauses those rows on their first run.
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

  RAISE NOTICE 'workflow schedule actor grandfather (#6706): actors bound=%', bound_actors;
END
$$;
