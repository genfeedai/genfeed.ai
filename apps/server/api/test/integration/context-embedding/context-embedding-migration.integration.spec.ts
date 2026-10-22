import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  acceptanceEnvironment,
  assertRealMigrationLedger,
  connectDedicated,
  deployRealMigrations,
  verifyPgvector,
} from '@api-test/integration/context-embedding/context-embedding-migration.fixture';
import { describe, expect, it } from 'vitest';

describe('actual predecessor migration upgrade', () => {
  it('deploys the complete real predecessor history, preserves legacy vector bytes and citations, and adds no historical jobs', async () => {
    const environment = await acceptanceEnvironment();
    await deployRealMigrations('upgrade', false);
    const client = await connectDedicated('upgrade');
    try {
      const predecessor = await assertRealMigrationLedger(client, false);
      const pgvectorVersion = await verifyPgvector(client);
      const user = 'legacy-user-' + randomUUID();
      const org = randomUUID();
      const base = randomUUID();
      const source = randomUUID();
      const version = randomUUID();
      const entry = randomUUID();
      const missing = randomUUID();
      await client.query(
        `INSERT INTO users (id,handle,"updatedAt") VALUES ($1,$1,clock_timestamp())`,
        [user],
      );
      await client.query(
        `INSERT INTO organizations (id,"userId",label,slug,"updatedAt") VALUES ($1,$2,$1,$1,clock_timestamp())`,
        [org, user],
      );
      await client.query(
        `INSERT INTO context_bases (id,"organizationId","createdById",data,"updatedAt") VALUES ($1,$2,$3,$4,clock_timestamp())`,
        [
          base,
          org,
          user,
          JSON.stringify({
            purpose: 'knowledge-base',
            knowledgeScope: 'org',
            entryCount: 2,
          }),
        ],
      );
      await client.query(
        `INSERT INTO knowledge_sources (id,"organizationId","userId",scope,title,kind,purpose,"updatedAt") VALUES ($1,$2,$3,'org','Legacy cited source','TEXT','BRAND_TRUTH',clock_timestamp())`,
        [source, org, user],
      );
      await client.query(
        `INSERT INTO knowledge_source_versions (id,"organizationId","sourceId",version,"contentHash","processingState","observedAt","updatedAt") VALUES ($1,$2,$3,1,'legacy-content','READY',clock_timestamp(),clock_timestamp())`,
        [version, org, source],
      );
      const embedding =
        '[' +
        Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0)).join(',') +
        ']';
      const data = {
        content: 'legacy searchable citation',
        metadata: { sourceId: source, versionId: version, chunkIndex: 0 },
      };
      await client.query(
        `INSERT INTO context_entries (id,"contextBaseId","organizationId",data,embedding,"knowledgeSourceId","knowledgeSourceVersionId","updatedAt") VALUES ($1,$2,$3,$4,$5::vector,$6,$7,clock_timestamp())`,
        [entry, base, org, JSON.stringify(data), embedding, source, version],
      );
      await client.query(
        `INSERT INTO context_entries (id,"contextBaseId","organizationId",data,"updatedAt") VALUES ($1,$2,$3,$4,clock_timestamp())`,
        [missing, base, org, JSON.stringify({ content: 'legacy null vector' })],
      );
      const before = await client.query<{ bytes: string }>(
        `SELECT encode(vector_send(embedding),'hex') AS bytes FROM context_entries WHERE id=$1 AND "organizationId"=$2`,
        [entry, org],
      );
      await deployRealMigrations('upgrade');
      const inventory = await assertRealMigrationLedger(client);
      expect(inventory.length).toBe(predecessor.length + 1);
      const after = await client.query<{
        bytes: string;
        embeddingGeneration: number;
        embeddingStoredGeneration: number;
        sourceSnapshotHash: string | null;
      }>(
        `SELECT encode(vector_send(embedding),'hex') AS bytes,"embeddingGeneration","embeddingStoredGeneration","sourceSnapshotHash" FROM context_entries WHERE id=$1 AND "organizationId"=$2`,
        [entry, org],
      );
      expect(after.rows[0]).toEqual({
        bytes: before.rows[0].bytes,
        embeddingGeneration: 0,
        embeddingStoredGeneration: 0,
        sourceSnapshotHash: null,
      });
      const hits = await client.query<{
        id: string;
        sourceId: string;
        versionId: string;
      }>(
        `SELECT e.id,e."knowledgeSourceId" AS "sourceId",e."knowledgeSourceVersionId" AS "versionId" FROM context_entries e JOIN knowledge_source_versions v ON v.id=e."knowledgeSourceVersionId" AND v."organizationId"=e."organizationId" JOIN knowledge_sources s ON s.id=v."sourceId" AND s."organizationId"=e."organizationId" WHERE e."organizationId"=$1 AND e."isDeleted"=false AND s."isDeleted"=false AND s."isVisible"=true AND v."processingState"='READY' AND v."retrievalState"='ACTIVE' AND v."retentionState"='RETAINED' AND e.embedding IS NOT NULL ORDER BY e.embedding <=> $2::vector`,
        [org, embedding],
      );
      expect(hits.rows).toEqual([
        { id: entry, sourceId: source, versionId: version },
      ]);
      expect(
        (await client.query(`SELECT * FROM context_embedding_jobs`)).rowCount,
      ).toBe(0);
      expect(
        (await client.query(`SELECT * FROM knowledge_embedding_manifests`))
          .rowCount,
      ).toBe(0);
      expect(
        (
          await client.query(
            `SELECT "embeddingGeneration",embedding FROM context_entries WHERE id=$1 AND "organizationId"=$2`,
            [missing, org],
          )
        ).rows,
      ).toEqual([{ embeddingGeneration: 0, embedding: null }]);
      expect(
        (
          await client.query(
            `SELECT "embeddingGeneration","processingState" FROM knowledge_source_versions WHERE id=$1 AND "organizationId"=$2`,
            [version, org],
          )
        ).rows,
      ).toEqual([{ embeddingGeneration: 0, processingState: 'READY' }]);
      // Explicit fixture rows exercise the real additive constraints; migration itself admitted none.
      const constraintJob = randomUUID();
      const foreignOrg = randomUUID();
      await client.query(
        'INSERT INTO organizations (id,"userId",label,slug,"updatedAt") VALUES ($1,$2,$1,$1,clock_timestamp())',
        [foreignOrg, user],
      );
      const insertIntent = (
        id: string,
        organizationId: string,
        generation = 1,
      ) =>
        client.query(
          'INSERT INTO context_embedding_jobs (id,"organizationId","contextEntryId",generation,"contentHash","modelIdentifier",origin,"actorUserId","actorIsApiKey","updatedAt") VALUES ($1,$2,$3,$8,$4,$5,$7,$6,false,clock_timestamp())',
          [
            id,
            organizationId,
            missing,
            'a'.repeat(64),
            'fixture-model',
            user,
            'ACTOR',
            generation,
          ],
        );
      await insertIntent(constraintJob, org);
      await expect(insertIntent(randomUUID(), org)).rejects.toMatchObject({
        code: '23505',
      });
      await expect(
        insertIntent(randomUUID(), foreignOrg, 2),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        client.query(
          'UPDATE context_embedding_jobs SET dimension=3 WHERE id=$1 AND "organizationId"=$2',
          [constraintJob, org],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await client.query(
        'DELETE FROM context_embedding_jobs WHERE id=$1 AND "organizationId"=$2',
        [constraintJob, org],
      );
      const newVersion = randomUUID();
      await client.query(
        `INSERT INTO knowledge_source_versions (id,"organizationId","sourceId",version,"contentHash","observedAt","updatedAt","isCurrent") VALUES ($1,$2,$3,2,'new-content',clock_timestamp(),clock_timestamp(),false)`,
        [newVersion, org, source],
      );
      expect(
        (
          await client.query(
            `SELECT "embeddingGeneration" FROM knowledge_source_versions WHERE id=$1 AND "organizationId"=$2`,
            [newVersion, org],
          )
        ).rows,
      ).toEqual([{ embeddingGeneration: 1 }]);
      const constraints = await client.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint WHERE conrelid IN ('context_entries'::regclass,'context_embedding_jobs'::regclass) AND contype='c'`,
      );
      expect(
        constraints.rows.some((row) => row.conname.includes('source_snapshot')),
      ).toBe(true);
      const directory = resolve('test-results/context-embedding');
      await mkdir(directory, { recursive: true });
      await writeFile(
        resolve(directory, 'upgrade-receipt.json'),
        JSON.stringify(
          {
            ...environment,
            pgvectorVersion,
            predecessorCount: predecessor.length,
            predecessorInventory: predecessor,
            migrationInventory: inventory,
            migrationCount: inventory.length,
            legacyVectorBytesPreserved: true,
            legacyGeneration: 0,
            historicalJobs: 0,
          },
          null,
          2,
        ),
      );
    } finally {
      await client.end();
    }
  }, 600000);
});
