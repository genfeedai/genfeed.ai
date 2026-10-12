-- Carousel slide order (#6740). `_post_ingredients` is an implicit many-to-many
-- with no position, so the order a user arranged was lost. `post_ingredients`
-- carries it explicitly.
--
-- Expand only: the implicit `_post_ingredients` table is left in place (a
-- later contract migration drops it once a published release no longer reads
-- it), so no row is ever dropped before it has been copied here.

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
