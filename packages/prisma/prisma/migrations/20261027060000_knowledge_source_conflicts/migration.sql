-- Judged pairs of current Knowledge versions, and the ledger of which versions
-- were scanned for them. Additive only: a new enum and new tables, nothing
-- existing is altered.

CREATE TYPE "KnowledgeConflictStatus" AS ENUM ('OPEN', 'DISMISSED', 'RESOLVED', 'CLEARED');

CREATE TABLE "knowledge_source_conflicts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "versionAId" TEXT NOT NULL,
  "sourceAId" TEXT NOT NULL,
  "versionBId" TEXT NOT NULL,
  "sourceBId" TEXT NOT NULL,
  "contentHashA" TEXT NOT NULL,
  "contentHashB" TEXT NOT NULL,
  "status" "KnowledgeConflictStatus" NOT NULL DEFAULT 'OPEN',
  "summary" TEXT,
  "excerptA" TEXT,
  "excerptB" TEXT,
  "judgeModel" TEXT NOT NULL,
  "judgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "decidedByUserId" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knowledge_source_conflicts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_source_conflicts_pair_order_check" CHECK ("versionAId" < "versionBId"),
  CONSTRAINT "knowledge_source_conflicts_open_has_summary_check"
    CHECK ("status" <> 'OPEN' OR ("summary" IS NOT NULL AND "excerptA" IS NOT NULL AND "excerptB" IS NOT NULL)),
  CONSTRAINT "knowledge_source_conflicts_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "knowledge_source_conflicts_versionAId_sourceAId_organizati_fkey"
    FOREIGN KEY ("versionAId", "sourceAId", "organizationId") REFERENCES "knowledge_source_versions"("id", "sourceId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "knowledge_source_conflicts_versionBId_sourceBId_organizati_fkey"
    FOREIGN KEY ("versionBId", "sourceBId", "organizationId") REFERENCES "knowledge_source_versions"("id", "sourceId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "knowledge_source_conflicts_organizationId_versionAId_versio_key"
  ON "knowledge_source_conflicts"("organizationId", "versionAId", "versionBId");

CREATE INDEX "knowledge_source_conflicts_organizationId_status_isDeleted_idx"
  ON "knowledge_source_conflicts"("organizationId", "status", "isDeleted");

CREATE INDEX "knowledge_source_conflicts_organizationId_versionBId_status_idx"
  ON "knowledge_source_conflicts"("organizationId", "versionBId", "status", "isDeleted");

CREATE TABLE "knowledge_conflict_scans" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "candidateCount" INTEGER NOT NULL DEFAULT 0,
  "isComplete" BOOLEAN NOT NULL DEFAULT false,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knowledge_conflict_scans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_conflict_scans_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "knowledge_conflict_scans_versionId_sourceId_organizationId_fkey"
    FOREIGN KEY ("versionId", "sourceId", "organizationId") REFERENCES "knowledge_source_versions"("id", "sourceId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "knowledge_conflict_scans_organizationId_versionId_key"
  ON "knowledge_conflict_scans"("organizationId", "versionId");

CREATE INDEX "knowledge_conflict_scans_organizationId_isComplete_isDelete_idx"
  ON "knowledge_conflict_scans"("organizationId", "isComplete", "isDeleted");
