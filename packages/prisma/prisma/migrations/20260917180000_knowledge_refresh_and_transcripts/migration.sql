-- Knowledge URL/RSS refresh policy, refresh runs, transcript state, and capture ledger.

CREATE TYPE "KnowledgeSourceSyncState" AS ENUM ('CURRENT', 'CHECKING', 'STALE', 'FAILED');
CREATE TYPE "KnowledgeRefreshRunStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "KnowledgeRefreshRunOutcome" AS ENUM ('CHANGED', 'UNCHANGED', 'SKIPPED');

ALTER TABLE "knowledge_sources"
  ADD COLUMN "mediaReferenceKey" TEXT,
  ADD COLUMN "isRefreshEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refreshIntervalMinutes" INTEGER,
  ADD COLUMN "gracePeriodMinutes" INTEGER,
  ADD COLUMN "refreshWorkflowId" TEXT,
  ADD COLUMN "referenceUrl" TEXT,
  ADD COLUMN "syncState" "KnowledgeSourceSyncState",
  ADD COLUMN "lastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "lastSuccessfulSyncAt" TIMESTAMP(3),
  ADD COLUMN "nextCheckAt" TIMESTAMP(3),
  ADD COLUMN "firstFailureAt" TIMESTAMP(3),
  ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "staleAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncError" TEXT,
  ADD COLUMN "etag" TEXT,
  ADD COLUMN "lastModified" TEXT;

ALTER TABLE "knowledge_source_versions"
  ADD COLUMN "transcriptState" TEXT;

ALTER TABLE "knowledge_source_versions"
  ADD CONSTRAINT "knowledge_source_versions_transcript_state_check"
  CHECK (
    "transcriptState" IS NULL
    OR "transcriptState" IN ('resolved', 'generated', 'unavailable', 'prohibited')
  );

CREATE INDEX "knowledge_sources_organizationId_mediaReferenceKey_isDeleted_idx"
  ON "knowledge_sources"("organizationId", "mediaReferenceKey", "isDeleted");

CREATE INDEX "knowledge_sources_refresh_due_idx"
  ON "knowledge_sources"("organizationId", "isRefreshEnabled", "nextCheckAt", "isDeleted");

CREATE UNIQUE INDEX "knowledge_sources_media_reference_key_unique"
  ON "knowledge_sources"("organizationId", "mediaReferenceKey")
  WHERE "isDeleted" = false AND "mediaReferenceKey" IS NOT NULL;

CREATE TABLE "knowledge_source_refresh_runs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "tickKey" TEXT NOT NULL,
  "status" "KnowledgeRefreshRunStatus" NOT NULL DEFAULT 'QUEUED',
  "outcome" "KnowledgeRefreshRunOutcome",
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "candidateVersionId" TEXT,
  "expectedCurrentVersionId" TEXT,
  "error" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knowledge_source_refresh_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_source_refresh_runs_org_source_tick_key" UNIQUE ("organizationId", "sourceId", "tickKey"),
  CONSTRAINT "knowledge_source_refresh_runs_id_org_key" UNIQUE ("id", "organizationId"),
  CONSTRAINT "knowledge_source_refresh_runs_candidate_unique" UNIQUE ("candidateVersionId"),
  CONSTRAINT "knowledge_source_refresh_runs_source_fkey"
    FOREIGN KEY ("sourceId", "organizationId") REFERENCES "knowledge_sources"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "knowledge_source_refresh_runs_candidate_fkey"
    FOREIGN KEY ("candidateVersionId", "sourceId", "organizationId") REFERENCES "knowledge_source_versions"("id", "sourceId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "knowledge_source_refresh_runs_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "knowledge_source_refresh_runs_scope_status_idx"
  ON "knowledge_source_refresh_runs"("organizationId", "sourceId", "status", "isDeleted");

CREATE INDEX "knowledge_source_refresh_runs_due_idx"
  ON "knowledge_source_refresh_runs"("organizationId", "nextAttemptAt", "isDeleted");

CREATE UNIQUE INDEX "knowledge_source_refresh_runs_unfinished_unique"
  ON "knowledge_source_refresh_runs"("organizationId", "sourceId")
  WHERE "isDeleted" = false AND "status" IN ('QUEUED', 'PROCESSING');

CREATE TABLE "knowledge_capture_requests" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sourceId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "kind" "KnowledgeSourceKind" NOT NULL,
  "mediaReferenceKey" TEXT,
  "reservationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "error" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knowledge_capture_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_capture_requests_org_idempotency_key" UNIQUE ("organizationId", "idempotencyKey"),
  CONSTRAINT "knowledge_capture_requests_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "knowledge_capture_requests_source_fkey"
    FOREIGN KEY ("sourceId", "organizationId") REFERENCES "knowledge_sources"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "knowledge_capture_requests_scope_idx"
  ON "knowledge_capture_requests"("organizationId", "sourceId", "isDeleted");

-- Backfill stable capture locations from current version payload/provenance. Never invent fingerprints.
UPDATE "knowledge_sources" AS src
SET "referenceUrl" = COALESCE(
  NULLIF(ver.payload->>'referenceUrl', ''),
  NULLIF(ver.provenance->>'url', '')
)
FROM "knowledge_source_versions" AS ver
WHERE ver."sourceId" = src.id
  AND ver."organizationId" = src."organizationId"
  AND ver."isCurrent" = true
  AND ver."isDeleted" = false
  AND src.kind IN ('URL', 'RSS', 'AUDIO', 'VIDEO', 'DOCUMENT')
  AND src."referenceUrl" IS NULL;
