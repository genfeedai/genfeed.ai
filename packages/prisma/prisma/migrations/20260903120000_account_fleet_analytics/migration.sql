-- Account fleet analytics (#4147): distinct post KPI dimensions, credential
-- attribution on snapshots, dated account growth history, and evaluation policy.

ALTER TABLE "post_analytics"
  ADD COLUMN IF NOT EXISTS "credentialId" TEXT,
  ADD COLUMN IF NOT EXISTS "impressions" INTEGER,
  ADD COLUMN IF NOT EXISTS "reach" INTEGER,
  ADD COLUMN IF NOT EXISTS "clicks" INTEGER,
  ADD COLUMN IF NOT EXISTS "videoViews" INTEGER,
  ADD COLUMN IF NOT EXISTS "watchTimeSeconds" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "averageWatchTimeSeconds" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "metricAvailability" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "correctionKind" TEXT;

CREATE INDEX IF NOT EXISTS "post_analytics_credentialId_date_idx"
  ON "post_analytics" ("credentialId", "date" DESC);

CREATE INDEX IF NOT EXISTS "post_analytics_organizationId_credentialId_date_idx"
  ON "post_analytics" ("organizationId", "credentialId", "date" DESC);

ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "fleetEvaluationPolicy" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "account_analytics_snapshots" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "platform" "CredentialPlatform" NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "followers" INTEGER,
  "subscribers" INTEGER,
  "metricAvailability" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "account_analytics_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "account_analytics_snapshots_credentialId_date_key"
  ON "account_analytics_snapshots" ("credentialId", "date");

CREATE INDEX IF NOT EXISTS "account_analytics_snapshots_organizationId_isDeleted_date_idx"
  ON "account_analytics_snapshots" ("organizationId", "isDeleted", "date" DESC);

CREATE INDEX IF NOT EXISTS "account_analytics_snapshots_brandId_isDeleted_date_idx"
  ON "account_analytics_snapshots" ("brandId", "isDeleted", "date" DESC);

CREATE INDEX IF NOT EXISTS "account_analytics_snapshots_credentialId_isDeleted_date_idx"
  ON "account_analytics_snapshots" ("credentialId", "isDeleted", "date" DESC);

ALTER TABLE "account_analytics_snapshots"
  DROP CONSTRAINT IF EXISTS "account_analytics_snapshots_organizationId_fkey",
  ADD CONSTRAINT "account_analytics_snapshots_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_analytics_snapshots"
  DROP CONSTRAINT IF EXISTS "account_analytics_snapshots_brandId_fkey",
  ADD CONSTRAINT "account_analytics_snapshots_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_analytics_snapshots"
  DROP CONSTRAINT IF EXISTS "account_analytics_snapshots_credentialId_fkey",
  ADD CONSTRAINT "account_analytics_snapshots_credentialId_fkey"
    FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "post_analytics"
  DROP CONSTRAINT IF EXISTS "post_analytics_credentialId_fkey",
  ADD CONSTRAINT "post_analytics_credentialId_fkey"
    FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
