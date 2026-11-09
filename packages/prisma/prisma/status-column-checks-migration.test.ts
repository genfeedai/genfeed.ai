import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const read = (folder: string) =>
  readFileSync(
    new URL(`./migrations/${folder}/migration.sql`, import.meta.url),
    'utf8',
  );
const checksMigration = read('20261110090000_status_column_checks');
const validateMigration = read('20261110090100_status_column_checks_validate');
const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

// Every value of ContentCampaignStatus, TargetValidationState and
// ContentRunStatus.
const ACCEPTED = [
  ['campaigns', 'status', 'draft'],
  ['campaigns', 'status', 'scheduled'],
  ['campaigns', 'status', 'active'],
  ['campaigns', 'status', 'paused'],
  ['campaigns', 'status', 'completed'],
  ['campaigns', 'status', 'archived'],
  ['posts', 'targetValidationState', 'pending'],
  ['posts', 'targetValidationState', 'valid'],
  ['posts', 'targetValidationState', 'warning'],
  ['posts', 'targetValidationState', 'invalid'],
  ['content_runs', 'status', 'pending'],
  ['content_runs', 'status', 'running'],
  ['content_runs', 'status', 'completed'],
  ['content_runs', 'status', 'failed'],
  ['content_runs', 'status', null],
] as const;

// Values an older writer could plausibly have produced.
const REFUSED = [
  ['campaigns', 'status', 'ACTIVE', 'campaigns_status_check'],
  ['campaigns', 'status', 'running', 'campaigns_status_check'],
  [
    'posts',
    'targetValidationState',
    'VALID',
    'posts_targetValidationState_check',
  ],
  ['content_runs', 'status', 'complete', 'content_runs_status_check'],
  ['content_runs', 'status', 'interrupted', 'content_runs_status_check'],
] as const;

describePostgres('status column checks migration', () => {
  let pool: Pool;
  let client: PoolClient;
  const schema = `status_checks_${randomUUID().replaceAll('-', '')}`;

  const valueOf = async (table: string, column: string, id: string) => {
    const { rows } = await client.query(
      `SELECT "${column}" AS "value" FROM "${table}" WHERE "id" = $1`,
      [id],
    );
    return rows[0]?.value;
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, max: 1 });
    client = await pool.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE "campaigns" (
        "id" text PRIMARY KEY,
        "status" text NOT NULL DEFAULT 'draft'
      );
      CREATE TABLE "posts" (
        "id" text PRIMARY KEY,
        "targetValidationState" text NOT NULL DEFAULT 'pending'
      );
      CREATE TABLE "content_runs" (
        "id" text PRIMARY KEY,
        "status" text
      );
      -- Rows written before the checks existed, outside the closed sets.
      INSERT INTO "content_runs" ("id", "status") VALUES
        ('legacy-complete', 'complete'),
        ('legacy-interrupted', 'interrupted'),
        ('legacy-unknown', 'queued'),
        ('legacy-null', NULL),
        ('current', 'running');
      INSERT INTO "posts" ("id", "targetValidationState") VALUES
        ('legacy', 'VALID'),
        ('current', 'warning');
      INSERT INTO "campaigns" ("id", "status") VALUES
        ('legacy', 'live'),
        ('current', 'active');
    `);
    await client.query(checksMigration);
  });

  afterAll(async () => {
    await client?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client?.release();
    await pool?.end();
  });

  it.each([
    ['content_runs', 'status', 'legacy-complete', 'completed'],
    ['content_runs', 'status', 'legacy-interrupted', 'failed'],
    ['content_runs', 'status', 'legacy-unknown', 'failed'],
    ['content_runs', 'status', 'legacy-null', null],
    ['content_runs', 'status', 'current', 'running'],
    ['posts', 'targetValidationState', 'legacy', 'pending'],
    ['posts', 'targetValidationState', 'current', 'warning'],
    ['campaigns', 'status', 'legacy', 'paused'],
    ['campaigns', 'status', 'current', 'active'],
  ])('repairs %s.%s row %s to %s', async (table, column, id, expected) => {
    expect(await valueOf(table, column, id)).toBe(expected);
  });

  it.each(ACCEPTED)('accepts %s.%s = %s', async (table, column, value) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO "${table}" ("id", "${column}") VALUES ($1, $2)`,
      [id, value],
    );
    expect(await valueOf(table, column, id)).toBe(value);
  });

  it.each(REFUSED)(
    'refuses %s.%s = %s',
    async (table, column, value, constraint) => {
      await expect(
        client.query(
          `INSERT INTO "${table}" ("id", "${column}") VALUES ($1, $2)`,
          [randomUUID(), value],
        ),
      ).rejects.toThrow(constraint);
    },
  );

  it('validates every check over the repaired rows', async () => {
    await client.query(validateMigration);

    const { rows } = await client.query(
      `SELECT "conname", "convalidated" FROM "pg_constraint"
       WHERE "connamespace" = $1::regnamespace AND "contype" = 'c'
       ORDER BY "conname" COLLATE "C"`,
      [schema],
    );
    expect(rows).toEqual([
      { conname: 'campaigns_status_check', convalidated: true },
      { conname: 'content_runs_status_check', convalidated: true },
      { conname: 'posts_targetValidationState_check', convalidated: true },
    ]);
  });
});
