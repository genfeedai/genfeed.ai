-- Carousel slide order (#6740). `_post_ingredients` is an implicit many-to-many
-- with no position, so the order a user arranged was lost. `post_ingredients`
-- carries it explicitly.
--
-- Expand only: the implicit `_post_ingredients` table is left in place (a
-- later contract migration drops it once a published release no longer reads
-- it), so no row is ever dropped before it has been copied here.
--
-- Rollout bridge (end of file): the hosted deploy runs this migration before it
-- rolls the services, so tasks built before this release keep writing the
-- implicit table afterwards, and a rollback must keep working. Triggers mirror
-- link adds and removes in both directions until the old table is dropped.

CREATE TABLE "post_ingredients" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_ingredients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_ingredients_post_ingredient_key"
  ON "post_ingredients" ("postId", "ingredientId");

CREATE INDEX "post_ingredients_post_position_idx"
  ON "post_ingredients" ("postId", "position");

CREATE INDEX "post_ingredients_ingredient_idx"
  ON "post_ingredients" ("ingredientId");

CREATE INDEX "post_ingredients_organization_idx"
  ON "post_ingredients" ("organizationId");

ALTER TABLE "post_ingredients"
  ADD CONSTRAINT "post_ingredients_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "posts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_ingredients"
  ADD CONSTRAINT "post_ingredients_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_ingredients"
  ADD CONSTRAINT "post_ingredients_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Block writes to the old table (reads stay allowed) from before the backfill
-- reads it until this migration commits, so an old task cannot commit a link
-- change between the backfill and the bridge triggers below. The lock is held
-- to the end of the migration's transaction, which also covers CREATE TRIGGER.
LOCK TABLE "_post_ingredients" IN SHARE ROW EXCLUSIVE MODE;

-- Existing carousels keep the order they publish in today: group index
-- ascending (ungrouped last, as Postgres sorts NULLs), then ingredient id.
-- In `_post_ingredients`, "A" is the ingredient and "B" the post.
INSERT INTO "post_ingredients"
  ("id", "postId", "ingredientId", "organizationId", "position")
SELECT
  md5(link."B" || ':' || link."A"),
  link."B",
  link."A",
  p."organizationId",
  (ROW_NUMBER() OVER (
    PARTITION BY link."B"
    ORDER BY i."groupIndex" ASC NULLS LAST, i."id" ASC
  ) - 1)::INTEGER
FROM "_post_ingredients" link
JOIN "posts" p ON p."id" = link."B"
JOIN "ingredients" i ON i."id" = link."A"
ON CONFLICT ("postId", "ingredientId") DO NOTHING;

-- Rollout bridge (#6740). Old releases read and write only `_post_ingredients`
-- and the new release only `post_ingredients`, and both stay deployable until
-- the contract migration. The triggers mirror link inserts and deletes between
-- the tables so neither side misses a write:
--   old -> new  an added link takes the post's next position; a removed link is removed.
--   new -> old  an added or removed link is mirrored so a rollback sees it.
-- A position change has no counterpart in the old table and is not mirrored.
-- A mirror write fires the opposite trigger one level deeper, which
-- pg_trigger_depth() skips, so the pair cannot call each other. Every write is
-- idempotent (ON CONFLICT DO NOTHING, plain deletes) and a foreign-key cascade
-- (post or ingredient deleted) clears both tables on its own.
--
-- Contract: this bridge and `_post_ingredients` go away together, in a later
-- migration, once no old task and no rollback target remains.
-- Installed after the backfill, under the write lock taken before it, so no old
-- write can fall between the two steps.

CREATE FUNCTION mirror_post_ingredient_link_to_positions() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- Serialize concurrent old-release adds to one post so each gets its own position.
    PERFORM pg_advisory_xact_lock(hashtext('post_ingredients:' || NEW."B"));
    INSERT INTO "post_ingredients"
      ("id", "postId", "ingredientId", "organizationId", "position")
    SELECT
      md5(NEW."B" || ':' || NEW."A"),
      NEW."B",
      NEW."A",
      p."organizationId",
      COALESCE((SELECT MAX(l."position") + 1 FROM "post_ingredients" l WHERE l."postId" = NEW."B"), 0)
    FROM "posts" p
    WHERE p."id" = NEW."B"
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM "post_ingredients"
    WHERE "postId" = OLD."B" AND "ingredientId" = OLD."A";
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION mirror_post_ingredient_link_to_implicit() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "_post_ingredients" ("A", "B")
    VALUES (NEW."ingredientId", NEW."postId")
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM "_post_ingredients"
    WHERE "A" = OLD."ingredientId" AND "B" = OLD."postId";
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER post_ingredients_implicit_insert AFTER INSERT ON "_post_ingredients"
  FOR EACH ROW EXECUTE FUNCTION mirror_post_ingredient_link_to_positions();
CREATE TRIGGER post_ingredients_implicit_delete AFTER DELETE ON "_post_ingredients"
  FOR EACH ROW EXECUTE FUNCTION mirror_post_ingredient_link_to_positions();
CREATE TRIGGER post_ingredients_positions_insert AFTER INSERT ON "post_ingredients"
  FOR EACH ROW EXECUTE FUNCTION mirror_post_ingredient_link_to_implicit();
CREATE TRIGGER post_ingredients_positions_delete AFTER DELETE ON "post_ingredients"
  FOR EACH ROW EXECUTE FUNCTION mirror_post_ingredient_link_to_implicit();
