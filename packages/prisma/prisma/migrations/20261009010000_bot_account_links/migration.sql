-- Canonical links are established only by authenticated confirmation, never native-ID backfill.
CREATE UNIQUE INDEX "org_integrations_id_organizationId_key" ON "org_integrations" ("id", "organizationId");
CREATE TABLE "bot_account_links" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" "IntegrationPlatform" NOT NULL,
  "remoteUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "capturedIsApiKey" BOOLEAN NOT NULL DEFAULT false,
  "capturedApiKeyId" TEXT,
  "capturedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bot_account_links_shape_check" CHECK (
    "revision" > 0 AND length("remoteUserId") > 0 AND "platform" IN ('SLACK', 'DISCORD', 'TELEGRAM')
    AND (("capturedIsApiKey" AND "capturedApiKeyId" IS NOT NULL)
      OR (NOT "capturedIsApiKey" AND "capturedApiKeyId" IS NULL))
  ),
  CONSTRAINT "bot_account_links_installation_identity_key" UNIQUE ("organizationId", "integrationId", "platform", "remoteUserId"),
  CONSTRAINT "bot_account_links_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bot_account_links_installation_fkey" FOREIGN KEY ("integrationId", "organizationId") REFERENCES "org_integrations" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bot_account_links_user_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bot_account_links_key_fkey" FOREIGN KEY ("capturedApiKeyId") REFERENCES "api_keys" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "bot_account_links_user_idx" ON "bot_account_links" ("organizationId", "userId", "isDeleted");
