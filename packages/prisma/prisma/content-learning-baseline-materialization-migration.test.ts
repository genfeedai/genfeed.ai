import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PRISMA_MODEL_METADATA } from '@genfeedai/prisma/testing';
import { Pool, type PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

const filename = 'content-learning-baseline-materialization-migration.test.ts';
const configured = process.env.DATABASE_URL;
const explicitlySelected = process.argv.some((value) =>
  value.includes(filename),
);
if (!configured && (process.env.CI === 'true' || explicitlySelected))
  throw new Error('An isolated test DATABASE_URL is required');
function isolatedUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      !['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname) ||
      !/test/i.test(decodeURIComponent(parsed.pathname)) ||
      parsed.search ||
      parsed.hash
    )
      throw new Error();
    return value;
  } catch {
    throw new Error('An isolated local PostgreSQL test URL is required');
  }
}
const databaseUrl = configured ? isolatedUrl(configured) : undefined;
const databaseSuite = databaseUrl ? describe : describe.skip;
const schemaSource = readFileSync(
  new URL('./schema.prisma', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL(
    './migrations/20261001220000_content_learning_baseline_materialization/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const predecessor = readFileSync(
  new URL(
    './migrations/20260930180000_content_learning/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const tableStatements = predecessor.match(
  /^CREATE TABLE "content_learning_baselines" \([\s\S]*?^\);/gm,
);
if (tableStatements?.length !== 1)
  throw new Error('Canonical predecessor table statement must be unique');
const predecessorTable = tableStatements[0];
const model = schemaSource.match(
  /^model ContentLearningBaseline \{([\s\S]*?)^\}/m,
)?.[1];
const metadataFields = [
  'snapshotEvidenceRevision',
  'snapshotEpoch',
  'expiresAt',
] as const;
const constraint = 'learning_baseline_materialization_metadata_check';
const indexName = 'learning_baseline_materialization_lookup_idx';
const clock = '2026-10-01T22:00:00.000Z';
const indexFields = [
  'organizationId',
  'credentialId',
  'scopeKey',
  'snapshotEpoch',
  'snapshotEvidenceRevision',
  'cutoff',
  'id',
];
const scope = {
  organizationId: 'org',
  brandId: 'brand',
  credentialId: 'credential',
  scopeKey: 'scope',
};

async function insert(
  client: PoolClient,
  count: number,
  evidence: number | null,
  epoch: number | null,
  expiry: string | null,
  cutoff = clock,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO content_learning_baselines (id,"updatedAt","organizationId","brandId","credentialId",fingerprint,"scopeKey",cutoff,"configVersion","contributorCheckpointIds","contributorRevisions",count,"medianExposure",samples,validity,"snapshotEvidenceRevision","snapshotEpoch","expiresAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'config-v1',ARRAY['checkpoint'],ARRAY[1],$9,0,'[]'::jsonb,'valid',$10,$11,$12)`,
    [
      id,
      clock,
      scope.organizationId,
      scope.brandId,
      scope.credentialId,
      `fingerprint-${id}`,
      scope.scopeKey,
      cutoff,
      count,
      evidence,
      epoch,
      expiry,
    ],
  );
  return id;
}
async function withMigration(
  run: (
    client: PoolClient,
    schema: string,
    legacyId: string,
    before: Record<string, unknown>,
  ) => Promise<void>,
) {
  if (!databaseUrl) throw new Error('Missing isolated database URL');
  const schema = `learning_baseline_test_${randomUUID().replaceAll('-', '')}`;
  if (!/^learning_baseline_test_[0-9a-f]{32}$/.test(schema))
    throw new Error('Invalid fixture schema');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  let client: PoolClient | undefined;
  let created = false;
  let primary: unknown;
  let failed = false;
  try {
    client = await pool.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await client.query(`SET search_path TO "${schema}", public`);
    await client.query(predecessorTable);
    const legacyId = randomUUID();
    await client.query(
      `INSERT INTO content_learning_baselines (id,"isDeleted","createdAt","updatedAt","organizationId","brandId","credentialId",fingerprint,"scopeKey",cutoff,"configVersion","contributorCheckpointIds","contributorRevisions",count,"medianExposure",samples,validity) VALUES ($1,false,$2,$2,'org','brand','credential','legacy-fingerprint','scope',$2,'config-v1',ARRAY['legacy-checkpoint'],ARRAY[7],2,12.5,'[{"value":7}]'::jsonb,'legacy')`,
      [legacyId, clock],
    );
    const before = (
      await client.query(
        'SELECT * FROM content_learning_baselines WHERE id=$1',
        [legacyId],
      )
    ).rows[0];
    await client.query(migration);
    await run(client, schema, legacyId, before);
  } catch (error) {
    failed = true;
    primary = error;
  } finally {
    let cleanupError: unknown;
    if (client) {
      for (const sql of [
        'ROLLBACK',
        'SET search_path TO public',
        ...(created ? [`DROP SCHEMA "${schema}" CASCADE`] : []),
      ]) {
        try {
          await client.query(sql);
        } catch (error) {
          cleanupError ??= error;
        }
      }
      client.release();
    }
    try {
      await pool.end();
    } catch (error) {
      cleanupError ??= error;
    }
    if (!failed && cleanupError) {
      failed = true;
      primary = cleanupError;
    }
  }
  if (failed) throw primary;
}

describe('baseline materialization additive source contract', () => {
  it('adds only nullable fields and the ordered nonunique lookup index', () => {
    expect(model).toBeDefined();
    for (const [field, type] of [
      ['snapshotEvidenceRevision', 'Int'],
      ['snapshotEpoch', 'Int'],
      ['expiresAt', 'DateTime'],
    ]) {
      expect(
        model?.match(new RegExp(`^\\s*${field}\\s+${type}\\?\\s*$`, 'gm')),
      ).toHaveLength(1);
    }
    expect(model).toContain('@@index([scopeKey, cutoff])');
    expect(model).toContain(
      '@@index([organizationId, brandId, credentialId, isDeleted])',
    );
    expect(model).toContain(
      '@@index([organizationId, credentialId, scopeKey, snapshotEpoch, snapshotEvidenceRevision, cutoff(sort: Desc), id(sort: Desc)], map: "learning_baseline_materialization_lookup_idx")',
    );
    expect(migration.match(/ADD COLUMN/g)).toHaveLength(3);
    expect(migration.match(/ADD CONSTRAINT/g)).toHaveLength(1);
    expect(migration.match(/CREATE INDEX/g)).toHaveLength(1);
    expect(migration).toContain(`ADD CONSTRAINT "${constraint}" CHECK`);
    expect(migration).toContain(
      'ADD COLUMN "snapshotEvidenceRevision" INTEGER',
    );
    expect(migration).toContain('ADD COLUMN "snapshotEpoch" INTEGER');
    expect(migration).toContain('ADD COLUMN "expiresAt" TIMESTAMP(3)');
    expect(migration).toContain(
      '("organizationId", "credentialId", "scopeKey", "snapshotEpoch", "snapshotEvidenceRevision", "cutoff" DESC, "id" DESC)',
    );
    expect(migration).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/);
    expect(migration).not.toMatch(
      /\b(?:UPDATE|INSERT|DELETE|DROP|DEFAULT|UNIQUE|IF NOT EXISTS)\b/i,
    );
    expect(migration).not.toMatch(/ADD COLUMN[^,;]*NOT NULL/i);
    const expectedCheck = `("snapshotEvidenceRevision" IS NULL AND "snapshotEpoch" IS NULL AND "expiresAt" IS NULL) OR ("snapshotEvidenceRevision" IS NOT NULL AND "snapshotEvidenceRevision" >= 0 AND "snapshotEpoch" IS NOT NULL AND "snapshotEpoch" >= 0 AND (("count" = 0 AND "expiresAt" IS NULL) OR ("count" > 0 AND "expiresAt" IS NOT NULL AND "expiresAt" >= "cutoff")))`;
    const actualCheck = migration.match(/CHECK \(\s*([\s\S]*?)\s*\);/)?.[1];
    expect(actualCheck?.replace(/\s+/g, ' ').trim()).toBe(expectedCheck);
    expect(predecessorTable).toMatch(
      /^CREATE TABLE "content_learning_baselines" \([\s\S]*\);$/,
    );
    expect(
      predecessor.match(/^CREATE TABLE "content_learning_baselines"/gm),
    ).toHaveLength(1);
  });
  it('requires actual generated baseline metadata after the separate codegen lease', () => {
    for (const field of metadataFields)
      expect(PRISMA_MODEL_METADATA.ContentLearningBaseline.allFields).toContain(
        field,
      );
  });
});

databaseSuite('baseline materialization actual PostgreSQL migration', () => {
  it('preserves every legacy value and verifies actual nullable column/catalog constraints', async () => {
    await withMigration(async (client, schema, legacyId, before) => {
      const after = (
        await client.query(
          'SELECT * FROM content_learning_baselines WHERE id=$1',
          [legacyId],
        )
      ).rows[0];
      for (const field of metadataFields) {
        expect(after[field]).toBeNull();
        delete after[field];
      }
      expect(after).toEqual(before);
      const columns = await client.query(
        `SELECT column_name,is_nullable,column_default,data_type,datetime_precision FROM information_schema.columns WHERE table_schema=$1 AND table_name='content_learning_baselines' AND column_name=ANY($2::text[])`,
        [schema, metadataFields],
      );
      expect(columns.rows).toHaveLength(3);
      for (const row of columns.rows) {
        expect(row.is_nullable).toBe('YES');
        expect(row.column_default).toBeNull();
        expect(row.data_type).toBe(
          row.column_name === 'expiresAt'
            ? 'timestamp without time zone'
            : 'integer',
        );
        if (row.column_name === 'expiresAt')
          expect(row.datetime_precision).toBe(3);
      }
      const checks = await client.query(
        `SELECT c.convalidated,c.contype FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND t.relname='content_learning_baselines' AND c.conname=$2`,
        [schema, constraint],
      );
      expect(checks.rows).toEqual([{ convalidated: true, contype: 'c' }]);
    });
  }, 60000);
  it('accepts legacy null tuples, empty counters, and nonempty equality or later expiry', async () => {
    await withMigration(async (client) => {
      for (const [count, evidence, epoch, expiry] of [
        [0, null, null, null],
        [2, null, null, null],
        [0, 0, 0, null],
        [1, 0, 0, clock],
        [1, 2, 3, '2026-10-01T22:00:00.001Z'],
      ] as const)
        await insert(client, count, evidence, epoch, expiry);
      expect(
        (
          await client.query(
            'SELECT count(*)::int AS count FROM content_learning_baselines',
          )
        ).rows[0].count,
      ).toBe(6);
    });
  }, 60000);
  it('rejects partial, negative and invalid-expiry tuples independently with the exact check', async () => {
    await withMigration(async (client) => {
      const cases: ReadonlyArray<
        readonly [number, number | null, number | null, string | null]
      > = [
        [0, 0, null, null],
        [0, null, 0, null],
        [1, null, null, clock],
        [1, 0, null, clock],
        [1, null, 0, clock],
        [0, -1, 0, null],
        [0, 0, -1, null],
        [0, 0, 0, clock],
        [1, 0, 0, null],
        [1, 0, 0, '2026-10-01T21:59:59.999Z'],
      ];
      for (const [count, evidence, epoch, expiry] of cases) {
        await client.query('BEGIN');
        let failure: unknown;
        try {
          await insert(client, count, evidence, epoch, expiry);
        } catch (error) {
          failure = error;
        } finally {
          await client.query('ROLLBACK');
        }
        expect(failure).toMatchObject({ code: '23514', constraint });
        expect(
          (
            await client.query(
              'SELECT count(*)::int AS count FROM content_learning_baselines',
            )
          ).rows[0].count,
        ).toBe(1);
      }
    });
  }, 60000);
  it('keeps the seven-column index nonunique with exact scope and descending tail', async () => {
    await withMigration(async (client, schema) => {
      const first = await insert(client, 1, 2, 3, clock);
      const second = await insert(client, 1, 2, 3, clock);
      expect(first).not.toBe(second);
      const index = await client.query(
        `SELECT i.indisunique,n.nspname AS namespace,t.relname AS table_name,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND t.relname='content_learning_baselines' AND x.relname=$2`,
        [schema, indexName],
      );
      expect(index.rows).toHaveLength(1);
      expect(index.rows[0].indisunique).toBe(false);
      expect(index.rows[0].namespace).toBe(schema);
      expect(index.rows[0].table_name).toBe('content_learning_baselines');
      expect(index.rows[0].definition.replaceAll('"', '')).toContain(
        `USING btree (organizationId, credentialId, scopeKey, snapshotEpoch, snapshotEvidenceRevision, cutoff DESC, id DESC)`,
      );
      const ordered = await client.query(
        `SELECT a.attname FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum,position) JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum WHERE n.nspname=$1 AND t.relname='content_learning_baselines' AND x.relname=$2 ORDER BY k.position`,
        [schema, indexName],
      );
      expect(ordered.rows.map((row) => row.attname)).toEqual(indexFields);
    });
  }, 60000);
  it('isolates the illustrative epoch/evidence/cutoff/expiry predicate at the inclusive boundary', async () => {
    await withMigration(async (client) => {
      const valid = await insert(client, 1, 2, 3, clock);
      await insert(client, 1, 2, 4, clock);
      await insert(client, 1, 4, 3, clock);
      await insert(
        client,
        1,
        2,
        3,
        '2026-10-01T22:00:01.000Z',
        '2026-10-01T22:00:01.000Z',
      );
      await insert(
        client,
        1,
        2,
        3,
        '2026-10-01T21:59:59.999Z',
        '2026-10-01T21:59:59.000Z',
      );
      const query = `SELECT id FROM content_learning_baselines WHERE "organizationId"=$1 AND "credentialId"=$2 AND "scopeKey"=$3 AND "snapshotEpoch"=3 AND "snapshotEvidenceRevision"=2 AND cutoff<=$4 AND "expiresAt">=$4 AND count>0 AND "isDeleted"=false ORDER BY id`;
      expect(
        (
          await client.query(query, [
            scope.organizationId,
            scope.credentialId,
            scope.scopeKey,
            clock,
          ])
        ).rows,
      ).toEqual([{ id: valid }]);
      expect(
        (
          await client.query(query, [
            scope.organizationId,
            scope.credentialId,
            scope.scopeKey,
            '2026-10-01T22:00:00.001Z',
          ])
        ).rows,
      ).toEqual([]);
      expect(
        (
          await client.query(query, [
            'other-org',
            scope.credentialId,
            scope.scopeKey,
            clock,
          ])
        ).rows,
      ).toEqual([]);
      expect(
        (
          await client.query(query, [
            scope.organizationId,
            'other-credential',
            scope.scopeKey,
            clock,
          ])
        ).rows,
      ).toEqual([]);
    });
  }, 60000);
});
