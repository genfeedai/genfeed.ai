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
ALTER TABLE "context_entries" ADD CONSTRAINT "context_entries_embedding_manifest_fkey" FOREIGN KEY ("knowledgeEmbeddingManifestId", "knowledgeSourceVersionId", "knowledgeSourceId", "organizationId") REFERENCES "knowledge_embedding_manifests"("id", "versionId", "sourceId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

-- AddForeignKey
ALTER TABLE "context_entries" ADD CONSTRAINT "context_entries_source_memory_fkey" FOREIGN KEY ("sourceAgentMemoryId", "organizationId") REFERENCES "agent_memories"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

-- AddForeignKey
ALTER TABLE "context_embedding_jobs" ADD CONSTRAINT "context_embedding_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_embedding_jobs" ADD CONSTRAINT "context_embedding_jobs_entry_fkey" FOREIGN KEY ("contextEntryId", "organizationId") REFERENCES "context_entries"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

-- AddForeignKey
ALTER TABLE "context_embedding_jobs" ADD CONSTRAINT "context_embedding_jobs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_embedding_jobs" ADD CONSTRAINT "context_embedding_jobs_memory_fkey" FOREIGN KEY ("sourceMemoryId", "organizationId") REFERENCES "agent_memories"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

-- AddForeignKey
ALTER TABLE "knowledge_embedding_manifests" ADD CONSTRAINT "knowledge_embedding_manifests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_embedding_manifests" ADD CONSTRAINT "knowledge_embedding_manifests_version_fkey" FOREIGN KEY ("versionId", "sourceId", "organizationId") REFERENCES "knowledge_source_versions"("id", "sourceId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

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

-- Only a live, fully indexed candidate admitted by this transaction may replace its predecessor.
CREATE OR REPLACE FUNCTION knowledge_preserve_version() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE
  witness JSONB;
  manifest knowledge_embedding_manifests%ROWTYPE;
  refresh_run knowledge_source_refresh_runs%ROWTYPE;
  total_chunks INTEGER;
  valid_chunks INTEGER;
BEGIN
  IF ROW(NEW."id", NEW."organizationId", NEW."sourceId", NEW."version", NEW."contentHash", NEW."observedAt", NEW."createdAt") IS DISTINCT FROM
     ROW(OLD."id", OLD."organizationId", OLD."sourceId", OLD."version", OLD."contentHash", OLD."observedAt", OLD."createdAt") THEN
    RAISE EXCEPTION 'Knowledge receipt identity is immutable';
  END IF;
  IF OLD."retentionState" = 'POLICY_ERASED' AND NEW."retentionState" <> 'POLICY_ERASED' THEN
    RAISE EXCEPTION 'Knowledge policy erasure is terminal';
  END IF;
  IF OLD."retentionState" IN ('PAYLOAD_PURGED', 'POLICY_ERASED') AND NEW."retentionState" NOT IN ('PAYLOAD_PURGED', 'POLICY_ERASED') THEN
    RAISE EXCEPTION 'Knowledge payload purge is irreversible';
  END IF;
  IF (NEW."payload" IS DISTINCT FROM OLD."payload" OR NEW."provenance" IS DISTINCT FROM OLD."provenance") AND
     NOT (NEW."retentionState" IN ('PAYLOAD_PURGED', 'POLICY_ERASED') AND NEW."payload" IS NULL AND NEW."provenance" IS NULL) THEN
    RAISE EXCEPTION 'Knowledge evidence is immutable except payload purge';
  END IF;
  IF OLD."isCurrent" AND NOT NEW."isCurrent"
     AND NEW."retrievalState" = 'SUPERSEDED' AND NEW."supersededByVersionId" IS NOT NULL THEN
    PERFORM set_config('genfeed.knowledge_predecessor_retirement', jsonb_build_object(
      'transactionId', txid_current()::text,
      'organizationId', OLD."organizationId", 'sourceId', OLD."sourceId",
      'predecessorVersionId', OLD."id", 'candidateVersionId', NEW."supersededByVersionId"
    )::text, true);
  END IF;
  IF NOT OLD."isCurrent" AND NEW."isCurrent" THEN
    witness := NULLIF(current_setting('genfeed.knowledge_candidate_promotion', true), '')::jsonb;
    IF OLD."isDeleted" OR NEW."isDeleted"
       OR OLD."retentionState" <> 'RETAINED' OR NEW."retentionState" <> 'RETAINED'
       OR OLD."retrievalState" <> 'ACTIVE' OR NEW."retrievalState" <> 'ACTIVE'
       OR OLD."supersededByVersionId" IS NOT NULL OR NEW."supersededByVersionId" IS NOT NULL
       OR OLD."processingState" <> 'PROCESSING' OR NEW."processingState" <> 'READY'
       OR OLD."embeddingGeneration" < 1 OR NEW."embeddingGeneration" IS DISTINCT FROM OLD."embeddingGeneration"
       OR (OLD."expiresAt" IS NOT NULL AND OLD."expiresAt" <= clock_timestamp())
       OR (NEW."expiresAt" IS NOT NULL AND NEW."expiresAt" <= clock_timestamp()) THEN
      RAISE EXCEPTION 'Historical Knowledge versions cannot become current';
    END IF;
    SELECT * INTO manifest FROM knowledge_embedding_manifests m
      WHERE m."organizationId" = OLD."organizationId" AND m."sourceId" = OLD."sourceId"
        AND m."versionId" = OLD."id" AND m."generation" = OLD."embeddingGeneration"
        AND NOT m."isDeleted" AND m."sealedAt" IS NOT NULL
        AND m."failedAt" IS NULL AND m."finalizedAt" IS NULL;
    SELECT * INTO refresh_run FROM knowledge_source_refresh_runs run
      WHERE run."organizationId" = OLD."organizationId" AND run."sourceId" = OLD."sourceId"
        AND run."candidateVersionId" = OLD."id" AND NOT run."isDeleted"
        AND run."status" IN ('QUEUED', 'PROCESSING');
    IF manifest."id" IS NULL OR refresh_run."id" IS NULL
       OR witness IS DISTINCT FROM jsonb_build_object(
         'transactionId', txid_current()::text,
         'organizationId', OLD."organizationId", 'sourceId', OLD."sourceId",
         'candidateVersionId', OLD."id", 'generation', OLD."embeddingGeneration",
         'manifestId', manifest."id", 'orderedChunksHash', manifest."orderedChunksHash",
         'modelIdentifier', manifest."modelIdentifier", 'runId', refresh_run."id",
         'expectedCurrentVersionId', refresh_run."expectedCurrentVersionId",
         'actor', manifest."initiatingActor"
       )
       OR NULLIF(current_setting('genfeed.knowledge_predecessor_retirement', true), '')::jsonb
          IS DISTINCT FROM jsonb_build_object(
            'transactionId', txid_current()::text,
            'organizationId', OLD."organizationId", 'sourceId', OLD."sourceId",
            'predecessorVersionId', refresh_run."expectedCurrentVersionId",
            'candidateVersionId', OLD."id"
          )
       OR jsonb_typeof(manifest."initiatingActor") IS DISTINCT FROM 'object'
       OR manifest."initiatingActor"->>'organizationId' IS DISTINCT FROM OLD."organizationId"
       OR jsonb_typeof(manifest."initiatingActor"->'isApiKey') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(manifest."initiatingActor"->'scopes') IS DISTINCT FROM 'array'
       OR NOT EXISTS (
         SELECT 1 FROM knowledge_source_versions previous
         WHERE previous."id" = refresh_run."expectedCurrentVersionId"
           AND previous."id" <> OLD."id" AND previous."sourceId" = OLD."sourceId"
           AND previous."organizationId" = OLD."organizationId" AND NOT previous."isDeleted"
           AND NOT previous."isCurrent" AND previous."retrievalState" = 'SUPERSEDED'
           AND previous."supersededByVersionId" = OLD."id"
       )
       OR NOT EXISTS (
         SELECT 1 FROM knowledge_sources source
         JOIN organizations org ON org."id" = source."organizationId" AND NOT org."isDeleted"
         JOIN users actor ON actor."id" = manifest."initiatingActor"->>'userId' AND NOT actor."isDeleted"
         WHERE source."id" = OLD."sourceId" AND source."organizationId" = OLD."organizationId"
           AND NOT source."isDeleted" AND source."isVisible"
           AND source."staleAt" IS NULL AND source."syncState" IS DISTINCT FROM 'STALE'
           AND (source."scope" <> 'personal' OR source."userId" = actor."id")
           AND (source."brandId" IS NULL OR EXISTS (
             SELECT 1 FROM brands brand WHERE brand."id" = source."brandId"
               AND brand."organizationId" = source."organizationId" AND NOT brand."isDeleted"
           ))
       ) THEN
      RAISE EXCEPTION 'Historical Knowledge versions cannot become current';
    END IF;
    -- Check the whole live candidate, including stray rows outside this manifest/generation.
    SELECT count(*)::int INTO total_chunks FROM context_entries entry
      WHERE entry."organizationId" = OLD."organizationId" AND entry."knowledgeSourceId" = OLD."sourceId"
        AND entry."knowledgeSourceVersionId" = OLD."id" AND NOT entry."isDeleted";
    IF total_chunks <> manifest."expectedChunkCount" OR EXISTS (
      SELECT 1 FROM context_entries entry
      WHERE entry."organizationId" = OLD."organizationId" AND entry."knowledgeSourceId" = OLD."sourceId"
        AND entry."knowledgeSourceVersionId" = OLD."id" AND NOT entry."isDeleted"
        AND (entry."knowledgeEmbeddingManifestId" IS DISTINCT FROM manifest."id"
          OR entry."embeddingGeneration" <> manifest."generation"
          OR entry."embeddingStoredGeneration" <> manifest."generation"
          OR entry."knowledgeChunkIndex" IS NULL
          OR entry."knowledgeChunkIndex" < 0 OR entry."knowledgeChunkIndex" >= total_chunks)
    ) THEN
      RAISE EXCEPTION 'Historical Knowledge versions cannot become current';
    END IF;
    IF total_chunks > 0 THEN
      SELECT count(*)::int INTO valid_chunks FROM context_entries entry
        JOIN context_bases base ON base."id" = entry."contextBaseId"
          AND base."organizationId" = entry."organizationId" AND NOT base."isDeleted"
        JOIN context_embedding_jobs job ON job."contextEntryId" = entry."id"
          AND job."organizationId" = entry."organizationId" AND NOT job."isDeleted"
          AND job."generation" = manifest."generation" AND job."status" = 'SUCCEEDED'
        WHERE entry."organizationId" = OLD."organizationId" AND entry."knowledgeSourceId" = OLD."sourceId"
          AND entry."knowledgeSourceVersionId" = OLD."id" AND NOT entry."isDeleted"
          AND entry."embedding" IS NOT NULL AND vector_dims(entry."embedding") = 1024
          AND jsonb_typeof(entry."data"->'content') = 'string'
          AND job."contentHash" = encode(sha256(convert_to(entry."data"->>'content', 'UTF8')), 'hex')
          AND job."modelIdentifier" = manifest."modelIdentifier" AND job."dimension" = 1024
          AND job."origin" = 'ACTOR'
          AND job."actorUserId" = manifest."initiatingActor"->>'userId'
          AND job."actorIsApiKey" = (manifest."initiatingActor"->>'isApiKey')::boolean
          AND job."actorApiKeyId" IS NOT DISTINCT FROM manifest."initiatingActor"->>'apiKeyId'
          AND to_jsonb(job."actorScopes") = manifest."initiatingActor"->'scopes';
      IF valid_chunks <> total_chunks THEN
        RAISE EXCEPTION 'Historical Knowledge versions cannot become current';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
