-- One active vote per (entityId, userId) (#6156).
--
-- Partial unique index (isDeleted = false), not a plain one: a vote is
-- soft-deleted on removal and revived on re-add, and historic soft-deleted
-- rows may already be many per pair. A plain unique index would force
-- hard-deleting those rows; the partial index leaves every historic row in
-- place and only constrains the live ones. Prisma cannot declare a partial
-- index, so this is raw SQL (same shape as `persona_grants`).
-- Rows with a NULL entityId are legacy and unconstrained.
--
-- Additive for the running release: no column or table changes. Dedupe first:
-- keep the earliest live vote per pair, soft-delete the rest. Nothing is
-- hard-deleted.
UPDATE "votes" AS v
SET "isDeleted" = true, "updatedAt" = CURRENT_TIMESTAMP
FROM (
  SELECT "id",
    ROW_NUMBER() OVER (
      PARTITION BY "entityId", "userId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "votes"
  WHERE "isDeleted" = false AND "entityId" IS NOT NULL
) AS ranked
WHERE v."id" = ranked."id" AND ranked.rn > 1;

CREATE UNIQUE INDEX "votes_entity_user_active_uidx"
  ON "votes" ("entityId", "userId")
  WHERE "isDeleted" = false AND "entityId" IS NOT NULL;
