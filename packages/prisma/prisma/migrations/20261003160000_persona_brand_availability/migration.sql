-- Share characters across the brands of one organization (#6009).
-- Existing rows default to OWNING_BRAND so today's brand-only behavior is kept.

CREATE TYPE "PersonaAvailabilityMode" AS ENUM ('OWNING_BRAND', 'ALL_BRANDS', 'SELECTED_BRANDS');

ALTER TABLE "personas"
  ADD COLUMN "availabilityMode" "PersonaAvailabilityMode" NOT NULL DEFAULT 'OWNING_BRAND',
  ADD COLUMN "availableBrandIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "personas_organizationId_isDeleted_availabilityMode_idx"
  ON "personas" ("organizationId", "isDeleted", "availabilityMode");

CREATE INDEX "personas_available_brand_ids_idx"
  ON "personas" USING GIN ("availableBrandIds");

CREATE TABLE "persona_availability_audits" (
  "id" TEXT NOT NULL,
  "personaId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "previousMode" "PersonaAvailabilityMode" NOT NULL,
  "previousBrandIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "newMode" "PersonaAvailabilityMode" NOT NULL,
  "newBrandIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "persona_availability_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "persona_availability_audits_personaId_createdAt_idx"
  ON "persona_availability_audits" ("personaId", "createdAt" DESC);

CREATE INDEX "persona_availability_audits_organizationId_createdAt_idx"
  ON "persona_availability_audits" ("organizationId", "createdAt" DESC);

ALTER TABLE "persona_availability_audits"
  ADD CONSTRAINT "persona_availability_audits_personaId_fkey"
  FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
