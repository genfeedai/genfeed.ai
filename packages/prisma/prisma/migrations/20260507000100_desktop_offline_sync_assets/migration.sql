-- Desktop sync asset metadata and tombstones.
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "localAssetId" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "cloudObjectKey" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "sha256" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "kind" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "origin" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "residency" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "uploadPolicy" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "originalFileName" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "assets_parentOrgId_parentBrandId_updatedAt_idx" ON "assets"("parentOrgId", "parentBrandId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "assets_sha256_sizeBytes_idx" ON "assets"("sha256", "sizeBytes");
CREATE INDEX IF NOT EXISTS "assets_localAssetId_idx" ON "assets"("localAssetId");

-- Durable one-time PKCE codes for desktop browser sign-in.
CREATE TABLE IF NOT EXISTS "desktop_auth_codes" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "userEmail" TEXT,
  "userName" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "desktop_auth_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "desktop_auth_codes_codeHash_key" ON "desktop_auth_codes"("codeHash");
CREATE INDEX IF NOT EXISTS "desktop_auth_codes_expiresAt_idx" ON "desktop_auth_codes"("expiresAt");
CREATE INDEX IF NOT EXISTS "desktop_auth_codes_userId_organizationId_idx" ON "desktop_auth_codes"("userId", "organizationId");

-- Cloud-backed conversation sync uses the canonical Genfeed user id, not legacy auth provider id.
CREATE TABLE IF NOT EXISTS "desktop_threads" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "organization_id" TEXT,
  "local_user_id" TEXT,
  "title" TEXT NOT NULL DEFAULT 'New conversation',
  "status" TEXT NOT NULL DEFAULT 'idle',
  "workspaceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "desktop_threads_pkey" PRIMARY KEY ("id")
);

ALTER TABLE IF EXISTS "desktop_threads" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE IF EXISTS "desktop_threads" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE IF EXISTS "desktop_threads" ADD COLUMN IF NOT EXISTS "local_user_id" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'desktop_threads'
      AND column_name = 'authProviderUserId'
  ) THEN
    ALTER TABLE "desktop_threads" ALTER COLUMN "authProviderUserId" DROP NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "desktop_messages" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "draftId" TEXT,
  "generatedContent" JSONB,
  CONSTRAINT "desktop_messages_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'desktop_messages_threadId_fkey'
  ) THEN
    ALTER TABLE "desktop_messages"
      ADD CONSTRAINT "desktop_messages_threadId_fkey"
      FOREIGN KEY ("threadId") REFERENCES "desktop_threads"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "desktop_threads_user_id_updatedAt_idx" ON "desktop_threads"("user_id", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "desktop_threads_organization_id_updatedAt_idx" ON "desktop_threads"("organization_id", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "desktop_messages_threadId_createdAt_idx" ON "desktop_messages"("threadId", "createdAt");
