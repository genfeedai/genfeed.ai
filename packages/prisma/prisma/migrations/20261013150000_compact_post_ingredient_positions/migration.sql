-- Compact carousel positions after a legacy link delete (#6862).
--
-- 20261012220000_post_ingredient_positions is already applied, so its function
-- body stays as it shipped. This replaces mirror_post_ingredient_link_to_positions
-- in place. The rollout triggers and mirror_post_ingredient_link_to_implicit
-- stay, so an old task and a rollback still see every link add and remove.
--
-- A legacy delete used to remove the mirrored row and leave later positions
-- untouched, so 0,1,2 became 0,2. The replaced function takes the same
-- per-post advisory lock as its insert path, before it locks any position
-- row, then renumbers the survivors to 0..n-1 in position, then id order.
-- That is the order the application writer stores and every read uses.
-- Deleting the middle of 0,1,2 leaves the survivors at 0,1.
--
-- Rows a legacy delete already gapped are renumbered here, in the same order,
-- before the new body serves another write. Share locks block link writers
-- until both steps commit. The implicit table is locked first: a legacy
-- delete locks that row before the mirror writes the position table.

LOCK TABLE "_post_ingredients" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "post_ingredients" IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION compact_post_ingredient_positions(target_post text)
RETURNS void
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $compact$
BEGIN
  UPDATE "post_ingredients" AS link
  SET "position" = ordered."nextPosition"
  FROM (
    SELECT
      survivor."id",
      (ROW_NUMBER() OVER (
        ORDER BY survivor."position" ASC, survivor."id" ASC
      ) - 1)::INTEGER AS "nextPosition"
    FROM "post_ingredients" AS survivor
    WHERE survivor."postId" = target_post
  ) AS ordered
  WHERE link."id" = ordered."id"
    AND link."position" IS DISTINCT FROM ordered."nextPosition";
END;
$compact$;

CREATE OR REPLACE FUNCTION mirror_post_ingredient_link_to_positions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $mirror$
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
    -- Same key as the insert, before any position row lock. A BEFORE ROW
    -- trigger would lock the row first and deadlock against this wait.
    PERFORM pg_advisory_xact_lock(hashtext('post_ingredients:' || OLD."B"));
    DELETE FROM "post_ingredients"
    WHERE "postId" = OLD."B" AND "ingredientId" = OLD."A";
    PERFORM compact_post_ingredient_positions(OLD."B");
  END IF;
  RETURN NULL;
END;
$mirror$;

DO $heal$
DECLARE
  post_id text;
BEGIN
  FOR post_id IN SELECT DISTINCT "postId" FROM "post_ingredients"
  LOOP
    PERFORM compact_post_ingredient_positions(post_id);
  END LOOP;
END
$heal$;
