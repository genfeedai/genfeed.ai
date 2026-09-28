-- One autosaved Generate composer draft per organization, brand and user
-- (#5465). Ownership always comes from the authenticated workspace; the JSON
-- columns are validated by the API before they are written.

CREATE TABLE "studio_generate_drafts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "prompt" TEXT NOT NULL DEFAULT '',
  "settingsByType" JSONB NOT NULL DEFAULT '{}',
  "references" JSONB NOT NULL DEFAULT '[]',
  "attachments" JSONB NOT NULL DEFAULT '[]',
  "knowledgeSelection" JSONB NOT NULL DEFAULT '{}',
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "studio_generate_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "studio_generate_drafts_type_check"
    CHECK ("type" IN ('image', 'video', 'music', 'avatar', 'voice')),
  CONSTRAINT "studio_generate_drafts_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "studio_generate_drafts_brandId_organizationId_fkey"
    FOREIGN KEY ("brandId", "organizationId")
    REFERENCES "brands"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "studio_generate_drafts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "studio_generate_drafts_scope_key"
  ON "studio_generate_drafts"("organizationId", "brandId", "userId");
