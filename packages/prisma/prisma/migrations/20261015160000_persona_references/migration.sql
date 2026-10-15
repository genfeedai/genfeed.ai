-- Ordered character reference images. A character used to hold exactly one
-- reference (`personas.avatarIngredientId`); `persona_references` holds any
-- number in priority order. Position 0 is the primary reference and stays
-- mirrored to `avatarIngredientId`, which is kept for single-image readers.
--
-- Expand only: `avatarIngredientId` is untouched. Rollout bridge: the hosted
-- deploy migrates before it rolls services, so tasks from the previous release
-- may still create characters with only `avatarIngredientId`. The new release
-- reads `[avatarIngredientId]` for a character without reference rows, so no
-- trigger is needed and a rollback keeps working.

CREATE TABLE "persona_references" (
  "id" TEXT NOT NULL,
  "personaId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "persona_references_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "persona_references_persona_ingredient_key"
  ON "persona_references" ("personaId", "ingredientId");

CREATE INDEX "persona_references_persona_position_idx"
  ON "persona_references" ("personaId", "position");

CREATE INDEX "persona_references_ingredient_idx"
  ON "persona_references" ("ingredientId");

CREATE INDEX "persona_references_organization_idx"
  ON "persona_references" ("organizationId");

ALTER TABLE "persona_references"
  ADD CONSTRAINT "persona_references_personaId_fkey"
    FOREIGN KEY ("personaId") REFERENCES "personas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "persona_references"
  ADD CONSTRAINT "persona_references_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "persona_references"
  ADD CONSTRAINT "persona_references_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every existing reference image becomes its character's primary reference.
INSERT INTO "persona_references"
  ("id", "personaId", "ingredientId", "organizationId", "position")
SELECT
  md5(p."id" || ':' || p."avatarIngredientId"),
  p."id",
  p."avatarIngredientId",
  p."organizationId",
  0
FROM "personas" p
JOIN "ingredients" i ON i."id" = p."avatarIngredientId"
WHERE p."avatarIngredientId" IS NOT NULL
ON CONFLICT ("personaId", "ingredientId") DO NOTHING;
