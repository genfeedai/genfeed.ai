import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL(
    './migrations/20261022090000_context_embedding_queue/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const schema = readFileSync(
  new URL('./schema.prisma', import.meta.url),
  'utf8',
);

describe('context embedding durable admission migration', () => {
  it('preserves legacy generations before selecting the new-version default', () => {
    const add = sql.indexOf(
      'ADD COLUMN "embeddingGeneration" INTEGER NOT NULL DEFAULT 0',
    );
    const defaultOne = sql.indexOf(
      'ALTER COLUMN "embeddingGeneration" SET DEFAULT 1',
    );
    expect(add).toBeGreaterThan(-1);
    expect(defaultOne).toBeGreaterThan(add);
    expect(sql).toMatch(
      /"embeddingStoredGeneration" INTEGER NOT NULL DEFAULT 0/,
    );
  });
  it('never creates historical intents or rewrites existing vectors and source states', () => {
    expect(sql).not.toMatch(
      /INSERT\s+INTO|UPDATE\s+"(?:context_entries|knowledge_source_versions|models)"/i,
    );
    expect(sql).not.toMatch(
      /DROP\s+(?:TABLE|COLUMN)|ALTER\s+COLUMN\s+"embedding"/i,
    );
    expect(schema).toContain('embeddingClaimedAt');
    expect(schema).toContain('embeddingFailedAt');
  });
  it('fences the exact tenant entry and committed memory source with composite keys', () => {
    expect(sql).toMatch(
      /FOREIGN KEY \("contextEntryId", "organizationId"\) REFERENCES "context_entries"\("id", "organizationId"\)/,
    );
    expect(sql).toMatch(
      /FOREIGN KEY \("sourceMemoryId", "organizationId"\) REFERENCES "agent_memories"\("id", "organizationId"\)/,
    );
    expect(sql).toMatch(
      /FOREIGN KEY \("sourceAgentMemoryId", "organizationId"\) REFERENCES "agent_memories"\("id", "organizationId"\)/,
    );
  });
  it('preserves deferrable cascading tenant keys for transactional organization moves', () => {
    expect(sql).toContain(
      'ALTER TABLE "context_entries" ADD CONSTRAINT "context_entries_embedding_manifest_fkey" FOREIGN KEY ("knowledgeEmbeddingManifestId", "knowledgeSourceVersionId", "knowledgeSourceId", "organizationId") REFERENCES "knowledge_embedding_manifests"("id", "versionId", "sourceId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;',
    );
    expect(sql).toContain(
      'ALTER TABLE "context_entries" ADD CONSTRAINT "context_entries_source_memory_fkey" FOREIGN KEY ("sourceAgentMemoryId", "organizationId") REFERENCES "agent_memories"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;',
    );
    expect(sql).toContain(
      'ALTER TABLE "context_embedding_jobs" ADD CONSTRAINT "context_embedding_jobs_entry_fkey" FOREIGN KEY ("contextEntryId", "organizationId") REFERENCES "context_entries"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;',
    );
    expect(sql).toContain(
      'ALTER TABLE "context_embedding_jobs" ADD CONSTRAINT "context_embedding_jobs_memory_fkey" FOREIGN KEY ("sourceMemoryId", "organizationId") REFERENCES "agent_memories"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;',
    );
    expect(sql).toContain(
      'ALTER TABLE "knowledge_embedding_manifests" ADD CONSTRAINT "knowledge_embedding_manifests_version_fkey" FOREIGN KEY ("versionId", "sourceId", "organizationId") REFERENCES "knowledge_source_versions"("id", "sourceId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;',
    );
    expect(sql.match(/DEFERRABLE INITIALLY IMMEDIATE/g)).toHaveLength(5);
  });
  it('keeps a canonical opaque actor user FK without blocking API-key deletion', () => {
    expect(sql).toMatch(
      /FOREIGN KEY \("actorUserId"\) REFERENCES "users"\("id"\) ON DELETE RESTRICT/,
    );
    expect(sql).not.toMatch(/FOREIGN KEY \("actorApiKeyId"\)/);
    expect(sql).toContain('"context_embedding_jobs_origin_check"');
    expect(sql).toContain('"actorScopes" TEXT[] NOT NULL');
  });
  it('caps attempts and permits a complete lease only while processing', () => {
    expect(sql).toContain('"attempts" BETWEEN 0 AND 3');
    expect(sql).toContain('"dimension" = 1024');
    expect(sql).toContain('"generation" >= 1');
    expect(sql).toContain(
      `"status" = 'PROCESSING' AND "leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL`,
    );
    expect(sql).toContain(
      `"status" <> 'PROCESSING' AND "leaseToken" IS NULL AND "leaseExpiresAt" IS NULL`,
    );
  });
  it('binds chunks to the exact manifest, version, source and tenant', () => {
    expect(sql).toMatch(
      /FOREIGN KEY \("knowledgeEmbeddingManifestId", "knowledgeSourceVersionId", "knowledgeSourceId", "organizationId"\) REFERENCES "knowledge_embedding_manifests"\("id", "versionId", "sourceId", "organizationId"\)/,
    );
    expect(sql).toContain(
      '"knowledgeChunkIndex" IS NOT NULL AND "knowledgeChunkIndex" BETWEEN 0 AND 199',
    );
    expect(sql).toContain('"expectedChunkCount" BETWEEN 0 AND 200');
    expect(sql).toContain(
      '"embeddingStoredGeneration" <= "embeddingGeneration"',
    );
  });
  it('retains execution replay and generation history behind distinct unique constraints', () => {
    expect(sql).toContain('("versionId", "admissionExecutionId")');
    expect(sql).toContain('("versionId", "generation")');
    expect(sql).toContain('("contextEntryId", "generation")');
  });
  it('makes sealed manifest identity immutable while leaving terminal settlement possible', () => {
    expect(sql).toContain('BEFORE UPDATE ON "knowledge_embedding_manifests"');
    const body = sql.slice(
      sql.indexOf('CREATE FUNCTION "knowledge_embedding_manifest_immutable"'),
    );
    for (const field of [
      'generation',
      'expectedChunkCount',
      'orderedChunksHash',
      'modelIdentifier',
      'observedValidators',
      'initiatingActor',
      'admissionExecutionId',
      'sealedAt',
    ]) {
      expect(body).toContain('NEW."' + field + '"');
      expect(body).toContain('OLD."' + field + '"');
    }
    expect(body).not.toContain('NEW."finalizedAt"');
    expect(body).not.toContain('NEW."failedAt"');
  });
  it('preserves every original immutable-evidence clause verbatim before the narrow promotion exception', () => {
    const legacy = readFileSync(
      new URL(
        './migrations/20260904230000_knowledge_source_space_contracts/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const start = legacy.indexOf(
      '  IF ROW(NEW."id"',
      legacy.indexOf('CREATE FUNCTION knowledge_preserve_version'),
    );
    const end = legacy.indexOf('  IF NOT OLD."isCurrent"');
    expect(sql).toContain(legacy.slice(start, end));
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION knowledge_preserve_version()',
    );
    expect(sql).toContain(
      "RAISE EXCEPTION 'Historical Knowledge versions cannot become current'",
    );
  });

  it('requires a bound transaction/actor witness plus independent whole-candidate vector and predecessor proof', () => {
    const guard = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION knowledge_preserve_version()'),
    );
    for (const text of [
      "current_setting('genfeed.knowledge_candidate_promotion', true)",
      'txid_current()::text',
      "'actor', manifest.",
      "'expectedCurrentVersionId'",
      "'orderedChunksHash'",
      "current_setting('genfeed.knowledge_predecessor_retirement', true)",
      "PERFORM set_config('genfeed.knowledge_predecessor_retirement'",
      "'predecessorVersionId', OLD.",
      "'predecessorVersionId', refresh_run.",
      'previous."supersededByVersionId" = OLD."id"',
      'total_chunks <> manifest."expectedChunkCount"',
      'entry."knowledgeEmbeddingManifestId" IS DISTINCT FROM manifest."id"',
      'entry."knowledgeChunkIndex" >= total_chunks',
      'vector_dims(entry."embedding") = 1024',
      'job."status" =',
      'job."contentHash" = encode(sha256',
      'job."actorUserId" =',
      'to_jsonb(job."actorScopes")',
      'OLD."supersededByVersionId" IS NOT NULL',
    ])
      expect(guard).toContain(text);
    expect(guard).not.toContain('xmin');
    expect(guard).not.toContain('4294967296');
    expect(guard).not.toContain('workflow_stable_json');
    expect(guard).not.toContain('skill_stable_json');
  });
});
