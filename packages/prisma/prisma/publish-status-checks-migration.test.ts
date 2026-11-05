import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const read = (folder: string) =>
  readFileSync(
    new URL(`./migrations/${folder}/migration.sql`, import.meta.url),
    'utf8',
  );
const checksMigration = read('20261105210000_publish_status_checks');
const validateMigration = read('20261105210100_publish_status_checks_validate');
const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

// Every value of TargetExecutionState, ReleaseStatus,
// PostProviderPublishReceiptStatus and NotificationDeliveryStatus.
const ACCEPTED = [
  ['posts', 'targetExecutionState', 'draft'],
  ['posts', 'targetExecutionState', 'scheduled'],
  ['posts', 'targetExecutionState', 'paused'],
  ['posts', 'targetExecutionState', 'cancelled'],
  ['posts', 'targetExecutionState', 'publishing'],
  ['posts', 'targetExecutionState', 'published'],
  ['posts', 'targetExecutionState', 'failed'],
  ['posts', 'targetExecutionState', 'skipped'],
  ['post_groups', 'status', 'draft'],
  ['post_groups', 'status', 'scheduled'],
  ['post_groups', 'status', 'paused'],
  ['post_groups', 'status', 'cancelled'],
  ['post_groups', 'status', 'publishing'],
  ['post_groups', 'status', 'published'],
  ['post_groups', 'status', 'failed'],
  ['post_groups', 'status', 'partially-published'],
  ['post_provider_publish_receipts', 'status', 'attempting'],
  ['post_provider_publish_receipts', 'status', 'accepted'],
  ['post_provider_publish_receipts', 'status', 'uncertain'],
  ['post_provider_publish_receipts', 'status', 'released'],
  ['notification_deliveries', 'status', 'pending'],
  ['notification_deliveries', 'status', 'processing'],
  ['notification_deliveries', 'status', 'retry_pending'],
  ['notification_deliveries', 'status', 'delivered'],
  ['notification_deliveries', 'status', 'skipped'],
  ['notification_deliveries', 'status', 'failed'],
] as const;

// Values an older writer could plausibly have produced.
const REFUSED = [
  [
    'posts',
    'targetExecutionState',
    'processing',
    'posts_targetExecutionState_check',
  ],
  [
    'posts',
    'targetExecutionState',
    'PUBLISHED',
    'posts_targetExecutionState_check',
  ],
  ['post_groups', 'status', 'public', 'post_groups_status_check'],
  [
    'post_provider_publish_receipts',
    'status',
    'pending',
    'post_provider_publish_receipts_status_check',
  ],
  [
    'notification_deliveries',
    'status',
    'sent',
    'notification_deliveries_status_check',
  ],
] as const;

describePostgres('publish status checks migration', () => {
  let pool: Pool;
  let client: PoolClient;
  const schema = `publish_status_${randomUUID().replaceAll('-', '')}`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, max: 1 });
    client = await pool.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE "posts" (
        "id" text PRIMARY KEY,
        "label" text,
        "targetExecutionState" text NOT NULL DEFAULT 'draft'
      );
      CREATE TABLE "post_groups" (
        "id" text PRIMARY KEY,
        "status" text NOT NULL DEFAULT 'draft'
      );
      CREATE TABLE "post_provider_publish_receipts" (
        "id" text PRIMARY KEY,
        "status" text NOT NULL
      );
      CREATE TABLE "notification_deliveries" (
        "id" text PRIMARY KEY,
        "status" text NOT NULL DEFAULT 'pending'
      );
      -- A row written before the checks existed, outside the closed set.
      INSERT INTO "posts" ("id", "label", "targetExecutionState")
      VALUES ('legacy', 'old', 'processing');
    `);
    await client.query(checksMigration);
  });

  afterAll(async () => {
    await client?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client?.release();
    await pool?.end();
  });

  it.each(ACCEPTED)('accepts %s.%s = %s', async (table, column, value) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO "${table}" ("id", "${column}") VALUES ($1, $2)`,
      [id, value],
    );
    const { rows } = await client.query(
      `SELECT "${column}" AS "value" FROM "${table}" WHERE "id" = $1`,
      [id],
    );
    expect(rows).toEqual([{ value }]);
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

  it('refuses any update of an existing out-of-set row until its state is repaired', async () => {
    await expect(
      client.query(`UPDATE "posts" SET "label" = 'new' WHERE "id" = 'legacy'`),
    ).rejects.toThrow('posts_targetExecutionState_check');
    await expect(client.query(validateMigration)).rejects.toThrow(
      'posts_targetExecutionState_check',
    );

    await client.query(
      `UPDATE "posts" SET "targetExecutionState" = 'publishing' WHERE "id" = 'legacy'`,
    );
    await client.query(validateMigration);

    const { rows } = await client.query(
      `SELECT "conname", "convalidated" FROM "pg_constraint"
       WHERE "connamespace" = $1::regnamespace AND "contype" = 'c'
       ORDER BY "conname" COLLATE "C"`,
      [schema],
    );
    expect(rows).toEqual([
      { conname: 'notification_deliveries_status_check', convalidated: true },
      { conname: 'post_groups_status_check', convalidated: true },
      {
        conname: 'post_provider_publish_receipts_status_check',
        convalidated: true,
      },
      { conname: 'posts_targetExecutionState_check', convalidated: true },
    ]);
  });
});
