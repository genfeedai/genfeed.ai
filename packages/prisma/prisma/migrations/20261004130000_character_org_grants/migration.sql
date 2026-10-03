-- Use-only grants of a character to another organization (#6037).
-- No existing rows change.

CREATE TABLE "persona_grants" (
  "id" TEXT NOT NULL,
  "personaId" TEXT NOT NULL,
  "ownerOrganizationId" TEXT NOT NULL,
  "recipientOrganizationId" TEXT NOT NULL,
  "availabilityMode" "PersonaAvailabilityMode" NOT NULL DEFAULT 'ALL_BRANDS',
  "availableBrandIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "access" TEXT NOT NULL DEFAULT 'use',
  "grantedByUserId" TEXT NOT NULL,
  "revokedByUserId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "persona_grants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "persona_grants_recipientOrganizationId_revokedAt_idx"
  ON "persona_grants" ("recipientOrganizationId", "revokedAt");
CREATE INDEX "persona_grants_personaId_revokedAt_idx"
  ON "persona_grants" ("personaId", "revokedAt");
CREATE INDEX "persona_grants_ownerOrganizationId_revokedAt_idx"
  ON "persona_grants" ("ownerOrganizationId", "revokedAt");

-- One active grant per character and receiving organization.
CREATE UNIQUE INDEX "persona_grants_active_persona_recipient_key"
  ON "persona_grants" ("personaId", "recipientOrganizationId")
  WHERE "revokedAt" IS NULL;

ALTER TABLE "persona_grants"
  ADD CONSTRAINT "persona_grants_personaId_fkey"
  FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "persona_grants"
  ADD CONSTRAINT "persona_grants_ownerOrganizationId_fkey"
  FOREIGN KEY ("ownerOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "persona_grants"
  ADD CONSTRAINT "persona_grants_recipientOrganizationId_fkey"
  FOREIGN KEY ("recipientOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE TABLE "persona_grant_audits" (
  "id" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "personaId" TEXT NOT NULL,
  "ownerOrganizationId" TEXT NOT NULL,
  "recipientOrganizationId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousMode" "PersonaAvailabilityMode",
  "previousBrandIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "newMode" "PersonaAvailabilityMode",
  "newBrandIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "persona_grant_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "persona_grant_audits_grantId_createdAt_idx"
  ON "persona_grant_audits" ("grantId", "createdAt" DESC);
CREATE INDEX "persona_grant_audits_ownerOrganizationId_createdAt_idx"
  ON "persona_grant_audits" ("ownerOrganizationId", "createdAt" DESC);
