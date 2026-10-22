-- Additive admission ledger only: preserve every existing vector and create no historical work.
-- CreateEnum
CREATE TYPE "ContextEmbeddingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRYABLE', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContextEmbeddingOrigin" AS ENUM ('ACTOR', 'CODE_OWNED_WORKFLOW', 'DERIVED_MEMORY');

-- CreateEnum
CREATE TYPE "ContextEmbeddingAdmissionOperation" AS ENUM ('ENTRY_WRITE', 'HISTORICAL_BACKFILL');

-- AlterTable
ALTER TABLE "context_entries" ADD COLUMN "sourceSnapshotHash" TEXT,
ADD COLUMN     "embeddingGeneration" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "embeddingStoredGeneration" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "knowledgeChunkIndex" INTEGER,
ADD COLUMN     "knowledgeEmbeddingManifestId" TEXT,
ADD COLUMN     "sourceAgentMemoryId" TEXT;

-- AlterTable
ALTER TABLE "knowledge_source_versions" ADD COLUMN "embeddingGeneration" INTEGER NOT NULL DEFAULT 0;
-- Existing versions remain generation zero. Only subsequently inserted versions start at one.
ALTER TABLE "knowledge_source_versions" ALTER COLUMN "embeddingGeneration" SET DEFAULT 1;

-- CreateTable
CREATE TABLE "context_embedding_jobs" (
    "sourceSnapshotHash" TEXT,
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contextEntryId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "modelIdentifier" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL DEFAULT 1024,
    "status" "ContextEmbeddingJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "safeFailureCode" TEXT,
    "origin" "ContextEmbeddingOrigin" NOT NULL,
    "actorUserId" TEXT,
    "actorIsApiKey" BOOLEAN,
    "actorApiKeyId" TEXT,
    "actorScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "admissionOperation" "ContextEmbeddingAdmissionOperation" NOT NULL DEFAULT 'ENTRY_WRITE',
    "workflowProvenance" JSONB,
    "sourceMemoryId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_embedding_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_embedding_manifests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "expectedChunkCount" INTEGER NOT NULL,
    "orderedChunksHash" TEXT NOT NULL,
    "modelIdentifier" TEXT NOT NULL,
    "observedValidators" JSONB NOT NULL,
    "initiatingActor" JSONB,
    "admissionExecutionId" TEXT NOT NULL,
    "sealedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "safeFailureCode" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_embedding_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "context_embedding_jobs_due_idx" ON "context_embedding_jobs"("status", "nextAttemptAt", "isDeleted");

-- CreateIndex
CREATE INDEX "context_embedding_jobs_org_entry_generation_idx" ON "context_embedding_jobs"("organizationId", "contextEntryId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "context_embedding_jobs_entry_generation_key" ON "context_embedding_jobs"("contextEntryId", "generation");

-- CreateIndex
CREATE INDEX "knowledge_embedding_manifests_completion_idx" ON "knowledge_embedding_manifests"("organizationId", "finalizedAt", "failedAt", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_embedding_manifests_version_generation_key" ON "knowledge_embedding_manifests"("versionId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_embedding_manifests_execution_key" ON "knowledge_embedding_manifests"("versionId", "admissionExecutionId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_embedding_manifests_identity_key" ON "knowledge_embedding_manifests"("id", "versionId", "sourceId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_memories_id_organizationId_key" ON "agent_memories"("id", "organizationId");

-- CreateIndex
CREATE INDEX "context_entries_source_memory_idx" ON "context_entries"("sourceAgentMemoryId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "context_entries_id_organizationId_key" ON "context_entries"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "context_entries_manifest_chunk_key" ON "context_entries"("knowledgeEmbeddingManifestId", "knowledgeChunkIndex");

-- AddForeignKey
ALTER TABLE "context_entries" ADD CONSTRAINT "context_entries_embedding_manifest_fkey" FOREIGN KEY ("knowledgeEmbeddingManifestId", "knowledgeSourceVersionId", "knowledgeSourceId", "organizationId") REFERENCES "knowledge_embedding_manifests"("id", "versionId", "sourceId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_entries" ADD CONSTRAINT "context_entries_source_memory_fkey" FOREIGN KEY ("sourceAgentMemoryId", "organizationId") REFERENCES "agent_memories"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_embedding_jobs" ADD CONSTRAINT "context_embedding_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_embedding_jobs" ADD CONSTRAINT "context_embedding_jobs_entry_fkey" FOREIGN KEY ("contextEntryId", "organizationId") REFERENCES "context_entries"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_embedding_jobs" ADD CONSTRAINT "context_embedding_jobs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_embedding_jobs" ADD CONSTRAINT "context_embedding_jobs_memory_fkey" FOREIGN KEY ("sourceMemoryId", "organizationId") REFERENCES "agent_memories"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_embedding_manifests" ADD CONSTRAINT "knowledge_embedding_manifests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_embedding_manifests" ADD CONSTRAINT "knowledge_embedding_manifests_version_fkey" FOREIGN KEY ("versionId", "sourceId", "organizationId") REFERENCES "knowledge_source_versions"("id", "sourceId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "context_entries"
  ADD CONSTRAINT "context_entries_embedding_generation_check" CHECK (
    "embeddingGeneration" >= 0 AND "embeddingStoredGeneration" >= 0
    AND "embeddingStoredGeneration" <= "embeddingGeneration"
  ),
  ADD CONSTRAINT "context_entries_embedding_manifest_shape_check" CHECK (
    ("knowledgeEmbeddingManifestId" IS NULL AND "knowledgeChunkIndex" IS NULL)
    OR ("knowledgeEmbeddingManifestId" IS NOT NULL AND "knowledgeChunkIndex" IS NOT NULL AND "knowledgeChunkIndex" BETWEEN 0 AND 199
      AND "knowledgeSourceId" IS NOT NULL AND "knowledgeSourceVersionId" IS NOT NULL)
  );
ALTER TABLE "knowledge_source_versions"
  ADD CONSTRAINT "knowledge_versions_embedding_generation_check" CHECK ("embeddingGeneration" >= 0);
ALTER TABLE "context_embedding_jobs"
  ADD CONSTRAINT "context_embedding_jobs_shape_check" CHECK (
    "generation" >= 1 AND "dimension" = 1024 AND "attempts" BETWEEN 0 AND 3
    AND "contentHash" ~ '^[a-f0-9]{64}$' AND length(btrim("modelIdentifier")) > 0
    AND (
      ("status" = 'PROCESSING' AND "leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
      OR ("status" <> 'PROCESSING' AND "leaseToken" IS NULL AND "leaseExpiresAt" IS NULL)
    )
  ),
  ADD CONSTRAINT "context_embedding_jobs_origin_check" CHECK (
    (
      "origin" = 'ACTOR' AND "actorUserId" IS NOT NULL AND "actorIsApiKey" IS NOT NULL
      AND "workflowProvenance" IS NULL
      AND (("actorIsApiKey" = false AND "actorApiKeyId" IS NULL)
        OR ("actorIsApiKey" = true AND "actorApiKeyId" IS NOT NULL))
    )
    OR (
      "origin" = 'CODE_OWNED_WORKFLOW' AND "workflowProvenance" IS NOT NULL
      AND jsonb_typeof("workflowProvenance") = 'object'
      AND "workflowProvenance" ?& ARRAY['executionId', 'workflowId', 'workflowVersionId', 'userId', 'nodeId', 'actionId']
      AND ("workflowProvenance" - 'executionId' - 'workflowId' - 'workflowVersionId' - 'userId' - 'nodeId' - 'actionId') = '{}'::jsonb
      AND "actorUserId" IS NULL AND "actorIsApiKey" IS NULL AND "actorApiKeyId" IS NULL
      AND cardinality("actorScopes") = 0 AND "sourceMemoryId" IS NULL
    )
    OR (
      "origin" = 'DERIVED_MEMORY' AND "sourceMemoryId" IS NOT NULL
      AND "actorUserId" IS NULL AND "actorIsApiKey" IS NULL AND "actorApiKeyId" IS NULL
      AND cardinality("actorScopes") = 0 AND "workflowProvenance" IS NULL
    )
  );
ALTER TABLE "knowledge_embedding_manifests"
  ADD CONSTRAINT "knowledge_embedding_manifests_shape_check" CHECK (
    "generation" >= 1 AND "expectedChunkCount" BETWEEN 0 AND 200
    AND "orderedChunksHash" ~ '^[a-f0-9]{64}$'
    AND length(btrim("modelIdentifier")) > 0 AND length(btrim("admissionExecutionId")) > 0
    AND jsonb_typeof("observedValidators") = 'object'
    AND ("observedValidators" - 'etag' - 'lastModified') = '{}'::jsonb
  );

CREATE FUNCTION "knowledge_embedding_manifest_immutable"() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW."id", NEW."organizationId", NEW."sourceId", NEW."versionId",
      NEW."generation", NEW."expectedChunkCount", NEW."orderedChunksHash",
      NEW."modelIdentifier", NEW."observedValidators", NEW."initiatingActor",
      NEW."admissionExecutionId", NEW."sealedAt")
    IS DISTINCT FROM
    ROW(OLD."id", OLD."organizationId", OLD."sourceId", OLD."versionId",
      OLD."generation", OLD."expectedChunkCount", OLD."orderedChunksHash",
      OLD."modelIdentifier", OLD."observedValidators", OLD."initiatingActor",
      OLD."admissionExecutionId", OLD."sealedAt") THEN
    RAISE EXCEPTION 'Sealed embedding manifest identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "knowledge_embedding_manifest_immutable"
  BEFORE UPDATE ON "knowledge_embedding_manifests"
  FOR EACH ROW EXECUTE FUNCTION "knowledge_embedding_manifest_immutable"();

ALTER TABLE "context_entries"
  ADD CONSTRAINT "context_entries_source_snapshot_check" CHECK (
    ("sourceAgentMemoryId" IS NULL AND "sourceSnapshotHash" IS NULL)
    OR ("sourceAgentMemoryId" IS NOT NULL AND "sourceSnapshotHash" IS NOT NULL
      AND "sourceSnapshotHash" ~ '^[a-f0-9]{64}$')
  );
ALTER TABLE "context_embedding_jobs"
  ADD CONSTRAINT "context_embedding_jobs_source_snapshot_check" CHECK (
    ("sourceMemoryId" IS NULL AND "sourceSnapshotHash" IS NULL)
    OR ("sourceMemoryId" IS NOT NULL AND "sourceSnapshotHash" IS NOT NULL
      AND "sourceSnapshotHash" ~ '^[a-f0-9]{64}$')
  );
