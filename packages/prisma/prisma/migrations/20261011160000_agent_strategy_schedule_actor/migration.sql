-- Server-written actor for autonomous agent turns (#6689, lane L).
--
-- Proactive, campaign and strategy turns have no live request, so the schedules they save were
-- stored unbound and the Cloud scheduler pauses those. The strategy now carries the authenticated
-- actor that saved or enabled it ("scheduleInitiatingActor", the same JSON shape as
-- "workflows"."scheduleInitiatingActor"); a turn that saves a schedule binds that actor after a
-- live refresh. Nullable, so every existing strategy starts unbound.
ALTER TABLE "agent_strategies" ADD COLUMN "scheduleInitiatingActor" JSONB;

-- One-off grandfather for strategies that already run, with the same rules as the workflow schedule
-- actor grandfather (#6706). An active, enabled, undeleted strategy with no actor is bound to its
-- owner, only while the owner is a live member of the strategy's organization (the member,
-- organization and role conditions BrandAccessService.resolve applies). That is who the strategy
-- already runs as. The value is exactly what toScheduleInitiatingActorWrite stores for a session
-- user (not an API key): no apiKeyId and an empty scopes list. The turn still re-checks membership
-- and brand access every time it saves a schedule. Owners who left stay unbound, so those turns
-- keep saving unbound schedules, which Cloud pauses. Update only: it never deletes or disables a
-- strategy and skips rows that already have an actor, so a second run changes nothing.
DO $$
DECLARE
  bound_actors integer;
BEGIN
  UPDATE "agent_strategies" s
  SET "scheduleInitiatingActor" = jsonb_build_object(
        'isApiKey', false,
        'organizationId', s."organizationId",
        'scopes', '[]'::jsonb,
        'userId', s."userId"
      ),
      "updatedAt" = (now() AT TIME ZONE 'UTC')
  WHERE s."isDeleted" = false
    AND s."isActive" = true
    AND s."config" -> 'isEnabled' IS DISTINCT FROM 'false'::jsonb
    AND (
      s."scheduleInitiatingActor" IS NULL
      OR jsonb_typeof(s."scheduleInitiatingActor") = 'null'
    )
    AND EXISTS (
      SELECT 1
      FROM "members" m
      JOIN "organizations" o ON o."id" = m."organizationId"
      JOIN "roles" r ON r."id" = m."roleId"
      WHERE m."userId" = s."userId"
        AND m."organizationId" = s."organizationId"
        AND m."isActive" = true
        AND m."isDeleted" = false
        AND o."isDeleted" = false
        AND r."isDeleted" = false
        AND r."key" IN ('owner', 'admin', 'creator', 'analytics', 'user', 'support')
    );
  GET DIAGNOSTICS bound_actors = ROW_COUNT;

  RAISE NOTICE 'agent strategy schedule actor grandfather (#6689): actors bound=%', bound_actors;
END
$$;
