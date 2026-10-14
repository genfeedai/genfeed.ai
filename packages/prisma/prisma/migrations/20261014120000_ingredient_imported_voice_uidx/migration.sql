-- One active imported ElevenLabs voice reference per organization and
-- provider voice (#5128). The second write of a concurrent import collides
-- here and keeps the first reference instead of saving a duplicate. The
-- predicate only matches voiceSource 'imported', which the same release
-- introduces, so no existing row can violate it. Partial predicates can't be
-- expressed as `@@unique`, so this lives in raw SQL only; schema.prisma
-- documents it.
--
-- Built CONCURRENTLY: `ingredients` is a hot table. CONCURRENTLY must run
-- outside a transaction block, and Prisma runs a migration without a wrapping
-- transaction only when the file contains nothing but CONCURRENTLY index
-- builds — so this file holds only this statement (precedent:
-- 20260928170100_ingredient_stitch_source_action_uidx).
--
-- If the build fails it leaves an INVALID index of the same name: DROP it,
-- then `prisma migrate resolve` and re-deploy. Do not blindly re-run.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "ingredients_org_imported_voice_uidx"
  ON "ingredients" ("organizationId", "voiceProvider", "externalVoiceId")
  WHERE "isDeleted" = false
    AND "voiceSource" = 'imported'
    AND "externalVoiceId" IS NOT NULL;
