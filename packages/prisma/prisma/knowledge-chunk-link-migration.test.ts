import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

const contractsMigration = readFileSync(
  new URL(
    './migrations/20260904230000_knowledge_source_space_contracts/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const chunkLinkMigration = readFileSync(
  new URL(
    './migrations/20260906210000_knowledge_chunks_link_versions/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const describePostgres = process.env.KNOWLEDGE_TEST_DATABASE_URL
  ? describe
  : describe.skip;

async function fixture(run: (client: PoolClient) => Promise<void>) {
  const pool = new Pool({
    connectionString: process.env.KNOWLEDGE_TEST_DATABASE_URL,
    max: 1,
  });
  const client = await pool.connect();
  const schema = `knowledge_chunk_link_${process.pid}_${Date.now()}`;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    await client.query(`
      CREATE TABLE organizations (id text PRIMARY KEY, "isDeleted" boolean DEFAULT false);
      CREATE TABLE users (id text PRIMARY KEY);
      CREATE TABLE brands (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id), "isDeleted" boolean DEFAULT false, UNIQUE(id, "organizationId"));
      CREATE TABLE context_bases (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id), data jsonb NOT NULL DEFAULT '{}', "isDeleted" boolean DEFAULT false);
      CREATE TABLE context_entries (id text PRIMARY KEY, "contextBaseId" text NOT NULL REFERENCES context_bases(id), "organizationId" text NOT NULL REFERENCES organizations(id), data jsonb NOT NULL DEFAULT '{}', "isDeleted" boolean DEFAULT false);
      INSERT INTO organizations(id) VALUES ('org-a'), ('org-b');
      INSERT INTO users(id) VALUES ('opaqueUserA');
      INSERT INTO brands(id, "organizationId") VALUES ('brand-a', 'org-a'), ('brand-c', 'org-b');
      INSERT INTO context_bases(id, "organizationId") VALUES ('base-a', 'org-a'), ('base-b', 'org-b');
    `);
    await client.query(contractsMigration);
    await client.query(chunkLinkMigration);
    await client.query(`
      INSERT INTO knowledge_sources (id, "organizationId", "brandId", "userId", scope, title, kind, purpose, "updatedAt")
        VALUES ('source-a', 'org-a', 'brand-a', 'opaqueUserA', 'brand', 'Pricing', 'URL', 'BRAND_TRUTH', now()),
               ('source-b', 'org-b', 'brand-c', 'opaqueUserA', 'brand', 'Other tenant', 'URL', 'BRAND_TRUTH', now());
      INSERT INTO knowledge_source_versions (id, "organizationId", "sourceId", version, "contentHash", provenance, payload, "observedAt", "updatedAt")
        VALUES ('version-a', 'org-a', 'source-a', 1, 'sha256:a', '{}', '{}', now(), now()),
               ('version-b', 'org-b', 'source-b', 1, 'sha256:b', '{}', '{}', now(), now());
    `);
    await run(client);
  } finally {
    await client.query('ROLLBACK');
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
}

function chunk(
  client: PoolClient,
  id: string,
  organizationId: string,
  base: string,
  sourceId: string | null,
  versionId: string | null,
) {
  return client.query(
    `INSERT INTO context_entries (id, "contextBaseId", "organizationId", "knowledgeSourceId", "knowledgeSourceVersionId") VALUES ($1, $2, $3, $4, $5)`,
    [id, base, organizationId, sourceId, versionId],
  );
}

describePostgres('Knowledge chunk link migration on PostgreSQL', () => {
  it('links a chunk to one version of one source inside its own organization', () =>
    fixture(async (client) => {
      await chunk(client, 'legacy', 'org-a', 'base-a', null, null);
      await chunk(client, 'linked', 'org-a', 'base-a', 'source-a', 'version-a');
      await expect(
        chunk(client, 'half', 'org-a', 'base-a', 'source-a', null),
      ).rejects.toThrow(/context_entries_knowledge_link_check/);
      await expect(
        chunk(client, 'foreign', 'org-b', 'base-b', 'source-a', 'version-a'),
      ).rejects.toThrow(/context_entries_knowledge_version_fkey/);
      await expect(
        chunk(client, 'mismatch', 'org-a', 'base-a', 'source-b', 'version-a'),
      ).rejects.toThrow(/context_entries_knowledge_version_fkey/);
      await expect(
        client.query(
          `DELETE FROM knowledge_source_versions WHERE id = 'version-a'`,
        ),
      ).rejects.toThrow(/context_entries_knowledge_version_fkey/);
    }));

  it('keeps a processing error only while the version is failed', () =>
    fixture(async (client) => {
      await expect(
        client.query(
          `UPDATE knowledge_source_versions SET "processingError" = 'boom' WHERE id = 'version-a'`,
        ),
      ).rejects.toThrow(/knowledge_source_versions_processing_error_check/);
      await client.query(
        `UPDATE knowledge_source_versions SET "processingState" = 'PROCESSING' WHERE id = 'version-a'`,
      );
      await client.query(
        `UPDATE knowledge_source_versions SET "processingState" = 'FAILED', "processingError" = 'Source did not contain extractable text' WHERE id = 'version-a'`,
      );
      await expect(
        client.query(
          `UPDATE knowledge_source_versions SET "processingState" = 'QUEUED' WHERE id = 'version-a'`,
        ),
      ).rejects.toThrow(/knowledge_source_versions_processing_error_check/);
      await client.query(
        `UPDATE knowledge_source_versions SET "processingState" = 'QUEUED', "processingError" = NULL WHERE id = 'version-a'`,
      );
      const { rows } = await client.query(
        `SELECT "processingState", "processingError" FROM knowledge_source_versions WHERE id = 'version-a'`,
      );
      expect(rows[0]).toEqual({
        processingState: 'QUEUED',
        processingError: null,
      });
    }));
});
