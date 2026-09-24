import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    './migrations/20260924180000_skill_version_capture/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

const databaseUrl = process.env.SKILLS_TEST_DATABASE_URL;
const isExplicitGate = process.argv.some((argument) =>
  argument.includes('skill-version-capture'),
);

function assertLoopbackDatabaseUrl(url: string): void {
  const parsed = new URL(url);
  for (const parameter of ['host', 'hostaddr', 'service']) {
    if (parsed.searchParams.has(parameter)) {
      throw new Error(`SKILLS_TEST_DATABASE_URL must not set ${parameter}`);
    }
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (
    hostname !== 'localhost' &&
    hostname !== '127.0.0.1' &&
    hostname !== '::1'
  ) {
    throw new Error('SKILLS_TEST_DATABASE_URL must use a loopback host');
  }
}

if (databaseUrl) {
  assertLoopbackDatabaseUrl(databaseUrl);
} else if (isExplicitGate) {
  throw new Error(
    'SKILLS_TEST_DATABASE_URL is required for the skill version capture gate',
  );
}

const describePostgres = databaseUrl ? describe : describe.skip;

async function withDatabase(
  run: (client: PoolClient, schema: string) => Promise<void>,
): Promise<void> {
  const schema = `skill_capture_${process.pid}_${Date.now()}`;
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 3,
  });
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    await client.query(`
      CREATE TABLE organizations (
        id text PRIMARY KEY,
        "isDeleted" boolean NOT NULL DEFAULT false
      );
      CREATE TABLE users (id text PRIMARY KEY);
      CREATE TABLE brands (
        id text PRIMARY KEY,
        "organizationId" text NOT NULL REFERENCES organizations(id),
        UNIQUE (id, "organizationId")
      );
      CREATE TABLE skills (
        id text PRIMARY KEY,
        "organizationId" text REFERENCES organizations(id),
        label text,
        config jsonb NOT NULL DEFAULT '{}'::jsonb,
        "isDeleted" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO organizations (id) VALUES ('org-a');
      INSERT INTO users (id) VALUES ('user-owner'), ('user-other');
      INSERT INTO brands (id, "organizationId") VALUES ('brand-a', 'org-a');
    `);
    await client.query(migration);
    await run(client, schema);
  } finally {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
}

describe('skill version capture migration source', () => {
  it('hashes with core sha256 and does not install pgcrypto', () => {
    expect(migration).toContain('pg_catalog.sha256');
    expect(migration).not.toContain('pgcrypto');
    expect(migration).not.toContain('digest(');
    expect(migration).toContain('genfeed.skill.legacy-snapshot.v1');
    expect(migration).toContain('genfeed.skill.invalid-legacy-snapshot.v1');
  });
});

describePostgres('skill version capture on PostgreSQL', () => {
  it('classifies legacy rows and captures an organization write once', async () => {
    await withDatabase(async (client) => {
      await client.query(
        `INSERT INTO skills (id, "organizationId", label, config)
         VALUES ('legacy-org', 'org-a', 'Legacy', '{"z":1,"a":"keep","systemPromptTemplate":"Hello"}'::jsonb)`,
      );
      // The row was inserted before the trigger only if we insert prior to
      // migration. This insert is after migration, so capture runs immediately.
      const classified = await client.query<{
        audience: string;
        ownerKind: string;
        versionNumber: number;
        contentHash: string;
      }>(
        `SELECT skill."audience", skill."ownerKind", version."versionNumber", version."contentHash"
         FROM skills skill
         JOIN skill_versions version ON version.id = skill."currentVersionId"
         WHERE skill.id = 'legacy-org'`,
      );
      expect(classified.rows[0]).toMatchObject({
        audience: 'organization',
        ownerKind: 'organization',
        versionNumber: 1,
      });
      const hash = classified.rows[0]?.contentHash ?? '';
      expect(hash.startsWith('sha256:skill-v1:')).toBe(true);

      await client.query(
        `UPDATE skills
         SET config = '{"a":"keep","z":1,"systemPromptTemplate":"Hello"}'::jsonb
         WHERE id = 'legacy-org'`,
      );
      const versions = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM skill_versions WHERE "skillId" = 'legacy-org'`,
      );
      expect(versions.rows[0]?.count).toBe('1');
    });
  });

  it('preserves a whitespace-only system template as unusable', async () => {
    await withDatabase(async (client) => {
      await client.query(
        `INSERT INTO skills (id, "organizationId", label, config)
         VALUES ('spaced', 'org-a', 'Spaced', '{"systemPromptTemplate":"   ","defaultInstructions":"fallback"}'::jsonb)`,
      );
      const version = await client.query<{
        instructionText: string;
        instructionUsable: boolean;
        sourceField: string;
      }>(
        `SELECT "instructionText", "instructionUsable", "instructionSourceField" AS "sourceField"
         FROM skill_versions WHERE "skillId" = 'spaced'`,
      );
      expect(version.rows[0]).toEqual({
        instructionText: '   ',
        instructionUsable: false,
        sourceField: 'systemPromptTemplate',
      });
    });
  });

  it('quarantines an untrusted null-organization row and an invalid config', async () => {
    await withDatabase(async (client) => {
      await client.query(
        `INSERT INTO skills (id, label, config)
         VALUES ('stray', 'Stray', '{"source":"custom","slug":"stray"}'::jsonb)`,
      );
      const stray = await client.query<{
        isQuarantined: boolean;
        ownerKind: string | null;
      }>(`SELECT "isQuarantined", "ownerKind" FROM skills WHERE id = 'stray'`);
      expect(stray.rows[0]).toEqual({
        isQuarantined: true,
        ownerKind: null,
      });

      await expect(
        client.query(
          `INSERT INTO skills (id, "organizationId", label, config)
           VALUES ('broken', 'org-a', 'Broken', '[]'::jsonb)`,
        ),
      ).resolves.toBeDefined();
      const broken = await client.query<{
        format: string;
        isQuarantined: boolean;
      }>(
        `SELECT version.format, skill."isQuarantined"
         FROM skills skill
         JOIN skill_versions version ON version.id = skill."currentVersionId"
         WHERE skill.id = 'broken'`,
      );
      expect(broken.rows[0]).toEqual({
        format: 'genfeed.skill.invalid-legacy-snapshot.v1',
        isQuarantined: true,
      });
    });
  });

  it('rejects forged system ownership and direct version writes', async () => {
    await withDatabase(async (client) => {
      await expect(
        client.query(
          `INSERT INTO skills (id, label, config, "ownerKind")
           VALUES ('forged', 'Forged', '{"isBuiltIn":true,"source":"built_in","slug":"content-writing"}'::jsonb, 'system')`,
        ),
      ).rejects.toThrow(/server provisioning/);

      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('genfeed.skill_write_origin', 'provisioning', true)`,
      );
      await client.query(
        `INSERT INTO skills (id, label, config)
         VALUES (
           'cskillbuiltincontentwrite',
           'Writing',
           '{"isBuiltIn":true,"source":"built_in","slug":"content-writing","systemPromptTemplate":"Write"}'::jsonb
         )`,
      );
      await client.query('COMMIT');
      const system = await client.query<{ ownerKind: string }>(
        `SELECT "ownerKind" FROM skills WHERE id = 'cskillbuiltincontentwrite'`,
      );
      expect(system.rows[0]?.ownerKind).toBe('system');

      await expect(
        client.query(
          `INSERT INTO skill_versions (
             id, "skillId", "versionNumber", format, payload, "contentHash", "instructionHash"
           ) VALUES (
             'forged-version', 'cskillbuiltincontentwrite', 9, 'genfeed.skill.authored.v1',
             '{}'::jsonb, 'sha256:skill-v1:00', 'sha256:skill-instruction-v1:00'
           )`,
        ),
      ).rejects.toThrow(/append-only/);

      await expect(
        client.query(
          `UPDATE skill_versions SET "instructionText" = 'changed'
           WHERE "skillId" = 'cskillbuiltincontentwrite'`,
        ),
      ).rejects.toThrow(/immutable/);
    });
  });

  it('appends a new version without rewriting the previous payload', async () => {
    await withDatabase(async (client) => {
      await client.query(
        `INSERT INTO skills (id, "organizationId", label, config)
         VALUES ('edit', 'org-a', 'Edit', '{"systemPromptTemplate":"one"}'::jsonb)`,
      );
      await client.query(
        `UPDATE skills SET config = '{"systemPromptTemplate":"two"}'::jsonb WHERE id = 'edit'`,
      );
      const versions = await client.query<{
        instructionText: string;
        versionNumber: number;
      }>(
        `SELECT "instructionText", "versionNumber"
         FROM skill_versions WHERE "skillId" = 'edit' ORDER BY "versionNumber"`,
      );
      expect(versions.rows).toEqual([
        { instructionText: 'one', versionNumber: 1 },
        { instructionText: 'two', versionNumber: 2 },
      ]);
    });
  });

  it('advances revision for a lifecycle change and rolls back to the prior version', async () => {
    await withDatabase(async (client) => {
      await client.query(
        `INSERT INTO skills (id, "organizationId", label, config)
         VALUES ('life', 'org-a', 'Life', '{"systemPromptTemplate":"one","isEnabled":true}'::jsonb)`,
      );
      await client.query(
        `UPDATE skills SET config = '{"systemPromptTemplate":"one","isEnabled":false}'::jsonb WHERE id = 'life'`,
      );
      const afterLifecycle = await client.query<{
        revision: number;
        versions: string;
      }>(
        `SELECT skill.revision, count(version.id)::text AS versions
         FROM skills skill
         JOIN skill_versions version ON version."skillId" = skill.id
         WHERE skill.id = 'life'
         GROUP BY skill.revision`,
      );
      expect(afterLifecycle.rows[0]).toEqual({ revision: 2, versions: '1' });

      await client.query(
        `UPDATE skills SET config = '{"systemPromptTemplate":"two","isEnabled":false}'::jsonb WHERE id = 'life'`,
      );
      const firstId = await client.query<{ id: string }>(
        `SELECT id FROM skill_versions WHERE "skillId" = 'life' AND "versionNumber" = 1`,
      );
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('genfeed.skill_activate_version_id', $1, true)`,
        [firstId.rows[0]?.id],
      );
      await client.query(
        `UPDATE skills
         SET config = '{"systemPromptTemplate":"one","isEnabled":false}'::jsonb
         WHERE id = 'life'`,
      );
      await client.query('COMMIT');
      const rolled = await client.query<{
        currentVersionId: string;
        latestVersionNumber: number;
      }>(
        `SELECT "currentVersionId", "latestVersionNumber" FROM skills WHERE id = 'life'`,
      );
      expect(rolled.rows[0]).toEqual({
        currentVersionId: firstId.rows[0]?.id,
        latestVersionNumber: 2,
      });
    });
  });

  it('records the transaction actor and clears it on the next transaction', async () => {
    await withDatabase(async (client) => {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('genfeed.skill_actor_id', 'user-owner', true)`,
      );
      await client.query(
        `INSERT INTO skills (id, "ownerUserId", label, config)
         VALUES ('personal', 'user-owner', 'Personal', '{"systemPromptTemplate":"mine"}'::jsonb)`,
      );
      await client.query('COMMIT');

      const created = await client.query<{
        createdById: string | null;
        ownerKind: string;
      }>(
        `SELECT version."createdById", skill."ownerKind"
         FROM skills skill
         JOIN skill_versions version ON version.id = skill."currentVersionId"
         WHERE skill.id = 'personal'`,
      );
      expect(created.rows[0]).toEqual({
        createdById: 'user-owner',
        ownerKind: 'user',
      });

      await client.query(
        `UPDATE skills SET label = 'Personal renamed' WHERE id = 'personal'`,
      );
      const next = await client.query<{ createdById: string | null }>(
        `SELECT "createdById" FROM skill_versions
         WHERE "skillId" = 'personal' AND "versionNumber" = 2`,
      );
      expect(next.rows[0]?.createdById).toBeNull();
    });
  });

  it('rejects a pointer at another skill version', async () => {
    await withDatabase(async (client) => {
      await client.query(
        `INSERT INTO skills (id, "organizationId", label, config)
         VALUES
           ('left', 'org-a', 'Left', '{"systemPromptTemplate":"left"}'::jsonb),
           ('right', 'org-a', 'Right', '{"systemPromptTemplate":"right"}'::jsonb)`,
      );
      const versions = await client.query<{
        currentVersionId: string;
        id: string;
      }>(`SELECT id, "currentVersionId" FROM skills ORDER BY id`);
      const left = versions.rows.find((row) => row.id === 'left');
      const right = versions.rows.find((row) => row.id === 'right');
      await client.query(
        `UPDATE skills SET "currentVersionId" = $1 WHERE id = 'left'`,
        [right?.currentVersionId],
      );
      const kept = await client.query<{ currentVersionId: string }>(
        `SELECT "currentVersionId" FROM skills WHERE id = 'left'`,
      );
      expect(kept.rows[0]?.currentVersionId).toBe(left?.currentVersionId);

      await client.query(
        `ALTER TABLE skills DISABLE TRIGGER skill_capture_version`,
      );
      await expect(
        client.query(
          `UPDATE skills SET "currentVersionId" = $1 WHERE id = 'left'`,
          [right?.currentVersionId],
        ),
      ).rejects.toThrow();
    });
  });

  it('backfills an uncaptured row without taking a row locked by another transaction', async () => {
    await withDatabase(async (client, schema) => {
      await client.query(
        `ALTER TABLE skills DISABLE TRIGGER skill_capture_version`,
      );
      await client.query(
        `INSERT INTO skills (
           id, "organizationId", label, config, "ownerKind", audience, "isQuarantined"
         ) VALUES (
           'pending', 'org-a', 'Pending', '{"systemPromptTemplate":"pending"}'::jsonb,
           'organization', 'organization', false
         )`,
      );
      await client.query(
        `ALTER TABLE skills ENABLE TRIGGER skill_capture_version`,
      );

      const locker = new Pool({ connectionString: databaseUrl, max: 1 });
      const locking = await locker.connect();
      await locking.query(`SET search_path TO "${schema}", public`);
      await locking.query('BEGIN');
      await locking.query(
        `SELECT id FROM skills WHERE id = 'pending' FOR UPDATE`,
      );

      const skipped = await client.query<{ skill_backfill_capture: number }>(
        `SELECT skill_backfill_capture(10)`,
      );
      expect(skipped.rows[0]?.skill_backfill_capture).toBe(0);

      await locking.query('ROLLBACK');
      locking.release();
      await locker.end();

      const captured = await client.query<{ skill_backfill_capture: number }>(
        `SELECT skill_backfill_capture(10)`,
      );
      expect(captured.rows[0]?.skill_backfill_capture).toBe(1);
      const version = await client.query<{ instructionText: string }>(
        `SELECT "instructionText" FROM skill_versions WHERE "skillId" = 'pending'`,
      );
      expect(version.rows[0]?.instructionText).toBe('pending');
    });
  });
});
