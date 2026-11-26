-- Reusable Library elements: locations, styles and props (#7374). Characters
-- stay in `personas`. Expand only: no existing table changes.

CREATE TYPE "LibraryElementType" AS ENUM ('LOCATION', 'STYLE', 'PROP');

CREATE TABLE "library_elements" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT,
  "type" "LibraryElementType" NOT NULL,
  "label" TEXT NOT NULL,
  "handle" TEXT NOT NULL,
  "description" TEXT,
  "availabilityMode" "PersonaAvailabilityMode" NOT NULL DEFAULT 'OWNING_BRAND',
  "availableBrandIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "library_elements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "library_elements_organizationId_isDeleted_type_idx"
  ON "library_elements" ("organizationId", "isDeleted", "type");

CREATE INDEX "library_elements_brandId_organizationId_isDeleted_idx"
  ON "library_elements" ("brandId", "organizationId", "isDeleted");

CREATE INDEX "library_elements_organizationId_isDeleted_availabilityMode_idx"
  ON "library_elements" ("organizationId", "isDeleted", "availabilityMode");

CREATE INDEX "library_elements_available_brand_ids_idx"
  ON "library_elements" USING GIN ("availableBrandIds");

-- One live handle per (organization, brand). Not representable in schema.prisma.
-- Uniqueness against characters is checked by the service under the
-- `persona-handle` advisory lock, because the two tables cannot share an index.
CREATE UNIQUE INDEX "library_elements_org_brand_handle_live_key"
  ON "library_elements" ("organizationId", "brandId", "handle")
  WHERE "isDeleted" = false;

ALTER TABLE "library_elements"
  ADD CONSTRAINT "library_elements_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "library_elements"
  ADD CONSTRAINT "library_elements_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "library_elements"
  ADD CONSTRAINT "library_elements_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "brands"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "library_element_references" (
  "id" TEXT NOT NULL,
  "elementId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "library_element_references_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "library_element_references_element_ingredient_key"
  ON "library_element_references" ("elementId", "ingredientId");

CREATE INDEX "library_element_references_element_position_idx"
  ON "library_element_references" ("elementId", "position");

CREATE INDEX "library_element_references_ingredient_idx"
  ON "library_element_references" ("ingredientId");

CREATE INDEX "library_element_references_organization_idx"
  ON "library_element_references" ("organizationId");

ALTER TABLE "library_element_references"
  ADD CONSTRAINT "library_element_references_elementId_fkey"
    FOREIGN KEY ("elementId") REFERENCES "library_elements"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "library_element_references"
  ADD CONSTRAINT "library_element_references_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "library_element_references"
  ADD CONSTRAINT "library_element_references_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
