-- One active stitch output per organization and idempotency key (#5460).
-- The insert is the atomic claim: a concurrent stitch request with the same key
-- collides here and returns the existing output instead of queuing a second
-- job. The predicate only matches stitch outputs (generationSource
-- 'video-stitch:*'), which the same release introduces, so no existing row can
-- violate it. Other sourceActionId producers (image retries) legitimately
-- repeat keys and stay unconstrained. Partial predicates can't be expressed as
-- `@@unique`, so this lives in raw SQL only; schema.prisma documents it.
--
-- Built CONCURRENTLY: `ingredients` is a hot table, and a plain CREATE UNIQUE
-- INDEX would hold a lock that blocks writes for the whole build. CONCURRENTLY
-- must run outside a transaction block, and Prisma runs a migration without a
-- wrapping transaction only when the file contains nothing but CONCURRENTLY
-- index builds — so this file holds only this statement (precedent:
-- 20260703120200_add_billing_stripe_live_uniques, prisma/prisma#14456).
--
-- If the build fails it leaves an INVALID index of the same name: DROP it,
-- then `prisma migrate resolve` and re-deploy. Do not blindly re-run.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "ingredients_org_stitch_source_action_uidx"
  ON "ingredients" ("organizationId", "sourceActionId")
  WHERE "isDeleted" = false
    AND "sourceActionId" IS NOT NULL
    AND "generationSource" LIKE 'video-stitch:%';
