-- Durable research collection attempts. The partial-style unique
-- inflightRequestKey is a nullable unique column: Postgres allows many
-- terminal rows with NULL, and a second in-flight claim for the same request
-- key conflicts instead of starting another upstream run.

CREATE TABLE "research_collection_jobs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "inflightRequestKey" TEXT,
  "scope" TEXT NOT NULL DEFAULT 'pending',
  "status" TEXT NOT NULL,
  "upstreamRunId" TEXT,
  "datasetId" TEXT,
  "reservationKey" TEXT,
  "usageKey" TEXT,
  "reservedMicroUsd" INTEGER,
  "actualCostMicroUsd" INTEGER,
  "reconciledAt" TIMESTAMP(3),
  "terminalReason" TEXT,
  "startAttemptedAt" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "research_collection_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "research_collection_jobs_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "research_collection_jobs_inflightRequestKey_key"
  ON "research_collection_jobs"("inflightRequestKey");

CREATE INDEX "research_collection_jobs_organizationId_isDeleted_idx"
  ON "research_collection_jobs"("organizationId", "isDeleted");

CREATE INDEX "research_collection_jobs_organizationId_isDeleted_upstreamRunId_idx"
  ON "research_collection_jobs"("organizationId", "isDeleted", "upstreamRunId");
