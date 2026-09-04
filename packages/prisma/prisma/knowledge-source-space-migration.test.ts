import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    './migrations/20260904230000_knowledge_source_space_contracts/migration.sql',
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
  const schema = `knowledge_contract_${process.pid}_${Date.now()}`;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    await client.query(`
      CREATE TABLE organizations (id text PRIMARY KEY, "isDeleted" boolean DEFAULT false);
      CREATE TABLE users (id text PRIMARY KEY);
      CREATE TABLE brands (id text PRIMARY KEY, "organizationId" text NOT NULL REFERENCES organizations(id), "isDeleted" boolean DEFAULT false, UNIQUE(id, "organizationId"));
      INSERT INTO organizations(id) VALUES ('org-a'), ('org-b');
      INSERT INTO users(id) VALUES ('opaqueUserA'), ('opaqueUserB');
      INSERT INTO brands(id, "organizationId") VALUES ('brand-a', 'org-a'), ('brand-b', 'org-a'), ('brand-c', 'org-b');
    `);
    await client.query(migration);
    await run(client);
  } finally {
    await client.query('ROLLBACK');
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
}

async function source(
  client: PoolClient,
  id = 'source-a',
  scope = 'brand',
  brand: string | null = 'brand-a',
) {
  await client.query(
    `INSERT INTO knowledge_sources (id, "organizationId", "brandId", "userId", scope, title, kind, purpose, "updatedAt") VALUES ($1, 'org-a', $2, 'opaqueUserA', $3, 'Evidence', 'TEXT', 'RESEARCH', now())`,
    [id, brand, scope],
  );
}

async function space(
  client: PoolClient,
  id: string,
  scope: string,
  brand: string | null,
  inbox = false,
  user = 'opaqueUserA',
) {
  await client.query(
    `INSERT INTO knowledge_spaces (id, "organizationId", "brandId", "userId", scope, title, "isInbox", "updatedAt") VALUES ($1, 'org-a', $2, $5, $3, 'Space', $4, now())`,
    [id, brand, scope, inbox, user],
  );
}

async function version(client: PoolClient) {
  await source(client);
  await client.query(
    `INSERT INTO knowledge_source_versions (id, "organizationId", "sourceId", version, "contentHash", provenance, payload, "observedAt", "updatedAt") VALUES ('version-a', 'org-a', 'source-a', 1, 'sha256:receipt', '{"url":"private-origin"}', '{"text":"private-payload"}', now(), now())`,
  );
}

describePostgres('Knowledge source and space migration on PostgreSQL', () => {
  it('enforces scope, tenant and brand ownership at persistence boundaries', async () =>
    fixture(async (client) => {
      await source(client);
      await expect(
        source(client, 'bad-brand', 'brand', 'brand-c'),
      ).rejects.toThrow(/foreign key/);
      await expect(
        source(client, 'missing-brand', 'brand', null),
      ).rejects.toThrow(/scope_check/);
      await expect(
        source(client, 'org-with-brand', 'org', 'brand-a'),
      ).rejects.toThrow(/scope_check/);
      await expect(
        source(client, 'invented-scope', 'global', null),
      ).rejects.toThrow(/scope_check/);
      await expect(
        client.query(
          `UPDATE knowledge_sources SET "brandId" = 'brand-b' WHERE id = 'source-a'`,
        ),
      ).rejects.toThrow(/immutable/);
      await expect(
        client.query(
          `UPDATE knowledge_sources SET "userId" = 'opaqueUserB' WHERE id = 'source-a'`,
        ),
      ).rejects.toThrow(/immutable/);
    }));

  it('keeps one Inbox per scope and prevents deletion or identity changes', async () =>
    fixture(async (client) => {
      await space(client, 'inbox-a', 'brand', 'brand-a', true);
      await expect(
        space(
          client,
          'inbox-duplicate',
          'brand',
          'brand-a',
          true,
          'opaqueUserB',
        ),
      ).rejects.toThrow(/inbox_scope_key/);
      await space(client, 'inbox-other-brand', 'brand', 'brand-b', true);
      await space(client, 'inbox-personal-a', 'personal', null, true);
      await space(
        client,
        'inbox-personal-b',
        'personal',
        null,
        true,
        'opaqueUserB',
      );
      await expect(
        client.query(
          `UPDATE knowledge_spaces SET "isDeleted" = true WHERE id = 'inbox-a'`,
        ),
      ).rejects.toThrow(/Inbox/);
      await expect(
        client.query(
          `UPDATE knowledge_spaces SET "isInbox" = false WHERE id = 'inbox-a'`,
        ),
      ).rejects.toThrow(/Inbox/);
    }));

  it('requires live membership endpoints with identical scope', async () =>
    fixture(async (client) => {
      await source(client);
      await space(client, 'space-a', 'brand', 'brand-a');
      await space(client, 'space-b', 'brand', 'brand-b');
      await space(client, 'space-org', 'org', null);
      const add = (id: string, spaceId: string) =>
        client.query(
          `INSERT INTO knowledge_space_memberships (id, "organizationId", "sourceId", "spaceId", "updatedAt") VALUES ($1, 'org-a', 'source-a', $2, now())`,
          [id, spaceId],
        );
      await add('member-a', 'space-a');
      await expect(add('member-b', 'space-b')).rejects.toThrow(
        /identical ownership scope/,
      );
      await expect(add('member-org', 'space-org')).rejects.toThrow(
        /identical ownership scope/,
      );
      await client.query(
        `UPDATE knowledge_space_memberships SET "isDeleted" = true WHERE id = 'member-a'`,
      );
      await client.query(
        `UPDATE knowledge_sources SET "isDeleted" = true WHERE id = 'source-a'`,
      );
      await expect(
        client.query(
          `UPDATE knowledge_space_memberships SET "isDeleted" = false WHERE id = 'member-a'`,
        ),
      ).rejects.toThrow(/live sources/);
    }));

  it('separates processing from eligibility and retention while preserving receipt identity on purge', async () =>
    fixture(async (client) => {
      await version(client);
      await client.query(
        `UPDATE knowledge_source_versions SET "processingState" = 'READY', "retrievalState" = 'STALE' WHERE id = 'version-a'`,
      );
      await client.query(
        `UPDATE knowledge_source_versions SET "retentionState" = 'SCHEDULED_FOR_PURGE', "purgeScheduledAt" = now() WHERE id = 'version-a'`,
      );
      await client.query(
        `UPDATE knowledge_source_versions SET "retentionState" = 'PAYLOAD_PURGED', payload = NULL, provenance = NULL, "purgedAt" = now() WHERE id = 'version-a'`,
      );
      const { rows } = await client.query(
        `SELECT id, "sourceId", version, "contentHash", "processingState", "retrievalState", "retentionState", payload, provenance FROM knowledge_source_versions`,
      );
      expect(rows).toEqual([
        {
          id: 'version-a',
          sourceId: 'source-a',
          version: 1,
          contentHash: 'sha256:receipt',
          processingState: 'READY',
          retrievalState: 'STALE',
          retentionState: 'PAYLOAD_PURGED',
          payload: null,
          provenance: null,
        },
      ]);
      await expect(
        client.query(
          `UPDATE knowledge_source_versions SET "contentHash" = 'changed' WHERE id = 'version-a'`,
        ),
      ).rejects.toThrow(/receipt identity/);
      await expect(
        client.query(
          `UPDATE knowledge_source_versions SET "retentionState" = 'RETAINED', provenance = '{}' WHERE id = 'version-a'`,
        ),
      ).rejects.toThrow(/irreversible/);
    }));

  it('rejects evidence edits, incomplete purges and invalid expiry policies', async () =>
    fixture(async (client) => {
      await version(client);
      await expect(
        client.query(
          `UPDATE knowledge_source_versions SET payload = '{}' WHERE id = 'version-a'`,
        ),
      ).rejects.toThrow(/evidence is immutable/);
      await expect(
        client.query(
          `UPDATE knowledge_source_versions SET provenance = '{}' WHERE id = 'version-a'`,
        ),
      ).rejects.toThrow(/evidence is immutable/);
      await expect(
        client.query(
          `UPDATE knowledge_source_versions SET "retentionState" = 'PAYLOAD_PURGED', "purgedAt" = now() WHERE id = 'version-a'`,
        ),
      ).rejects.toThrow(/retention_check/);
      await expect(
        client.query(
          `UPDATE knowledge_source_versions SET "retentionPolicy" = 'UNTIL_EXPIRY' WHERE id = 'version-a'`,
        ),
      ).rejects.toThrow(/expiry_check/);
      await expect(
        client.query(
          `UPDATE knowledge_source_versions SET "retentionState" = 'SCHEDULED_FOR_PURGE' WHERE id = 'version-a'`,
        ),
      ).rejects.toThrow(/purge_schedule_check/);
    }));

  it('pins supersession within the same source and keeps exactly one current version', async () =>
    fixture(async (client) => {
      await version(client);
      await client.query('BEGIN');
      await client.query(
        `UPDATE knowledge_source_versions SET "isCurrent" = false, "retrievalState" = 'SUPERSEDED', "supersededByVersionId" = 'version-b' WHERE id = 'version-a'`,
      );
      await client.query(
        `INSERT INTO knowledge_source_versions (id, "organizationId", "sourceId", version, "contentHash", provenance, "observedAt", "updatedAt") VALUES ('version-b', 'org-a', 'source-a', 2, 'sha256:next', '{}', now(), now())`,
      );
      await client.query('COMMIT');
      const { rows } = await client.query(
        `SELECT id, "isCurrent", "supersededByVersionId" FROM knowledge_source_versions ORDER BY version`,
      );
      expect(rows).toEqual([
        {
          id: 'version-a',
          isCurrent: false,
          supersededByVersionId: 'version-b',
        },
        { id: 'version-b', isCurrent: true, supersededByVersionId: null },
      ]);
      await expect(
        client.query(
          `UPDATE knowledge_source_versions SET "isCurrent" = true WHERE id = 'version-a'`,
        ),
      ).rejects.toThrow(/cannot become current/);
      await expect(
        client.query(
          `UPDATE knowledge_source_versions SET "supersededByVersionId" = 'version-b' WHERE id = 'version-b'`,
        ),
      ).rejects.toThrow(/supersession_check/);
    }));
});
