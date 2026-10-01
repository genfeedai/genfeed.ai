import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { assertIsolatedDatabaseUrl } from '../../../apps/server/api/scripts/assert-isolated-db-url';

const migration = readFileSync(
  new URL(
    './migrations/20261001170000_branded_generation_receipts/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const configured = process.env.BRANDED_GENERATION_TEST_DATABASE_URL;
const explicit = process.argv.some((arg) =>
  arg.includes('branded-generation-receipt-migration'),
);
if (!configured && explicit)
  throw new Error('BRANDED_GENERATION_TEST_DATABASE_URL is required');
const databaseUrl = configured
  ? assertIsolatedDatabaseUrl(configured)
  : undefined;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  for (const key of ['host', 'hostaddr', 'service'])
    if (parsed.searchParams.has(key))
      throw new Error('Database host overrides are forbidden');
}
const databaseSuite = databaseUrl ? describe : describe.skip;
const hash = `sha256:${'a'.repeat(64)}`;
const clock = '2026-10-01T17:00:00.000Z';
function projection(revision = 0, isDeleted = false) {
  return {
    id: 'receipt',
    organizationId: 'org',
    brandId: 'brand',
    actorId: 'user',
    requestKey: 'request',
    candidateIndex: 0,
    requestHash: hash,
    revision,
    state: 'created',
    mode: 'raw',
    surface: 'api',
    isDeleted,
    createdAt: clock,
    updatedAt: clock,
    execution: null,
  };
}
async function withSchema(run: (client: PoolClient) => Promise<void>) {
  const schema = `brand_receipt_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    await client.query(`CREATE TABLE organizations(id text PRIMARY KEY); CREATE TABLE users(id text PRIMARY KEY); CREATE TABLE brands(id text PRIMARY KEY,"organizationId" text NOT NULL,UNIQUE(id,"organizationId"));
    CREATE TABLE generation_prompt_snapshots(id text PRIMARY KEY,"organizationId" text NOT NULL,"brandId" text,"userId" text NOT NULL,format text NOT NULL,"contentHash" text NOT NULL,ciphertext text NOT NULL,"retentionState" text NOT NULL DEFAULT 'retained',"isDeleted" boolean NOT NULL DEFAULT false,
    CONSTRAINT generation_prompt_snapshots_ciphertext_check CHECK(ciphertext ~ '^[0-9a-fA-F]{32}:[0-9a-fA-F]+:[0-9a-fA-F]{32}$' AND "retentionState" IN ('retained','purged')));
    INSERT INTO organizations VALUES('org'); INSERT INTO users VALUES('user'); INSERT INTO brands VALUES('brand','org');`);
    await client.query(migration);
    await run(client);
  } finally {
    await client.query('ROLLBACK');
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
}
async function insertReceipt(client: PoolClient) {
  await client.query(
    `INSERT INTO branded_generation_receipts(id,"organizationId","brandId","actorId","requestKey","candidateIndex","requestHash",state,mode,surface,projection,"createdAt","updatedAt") VALUES('receipt','org','brand','user','request',0,$1,'created','raw','api',$2,$3,$3)`,
    [hash, projection(), clock],
  );
}
async function insertEvent(
  client: PoolClient,
  revision = 0,
  isDeleted = false,
) {
  await client.query(
    `INSERT INTO branded_generation_receipt_events(id,"receiptId","organizationId","brandId","actorId","operationKey","operationHash",revision,type,projection,"isDeleted") VALUES($1,'receipt','org','brand','user',$2,$3,$4,$5,$6,$7)`,
    [
      `event${revision}`,
      revision === 0 ? 'create' : 'delete',
      hash,
      revision,
      revision === 0 ? 'create' : 'delete',
      projection(revision, isDeleted),
      isDeleted,
    ],
  );
}
async function create(client: PoolClient) {
  await client.query('BEGIN');
  await insertReceipt(client);
  await insertEvent(client);
  await client.query('COMMIT');
}
databaseSuite('branded receipt constraints on isolated PostgreSQL', () => {
  it('requires an atomic initial event and rolls back the aggregate', async () =>
    withSchema(async (client) => {
      await client.query('BEGIN');
      await insertReceipt(client);
      await expect(client.query('COMMIT')).rejects.toThrow(
        'receipt_event_required',
      );
      expect(
        (await client.query('SELECT * FROM branded_generation_receipts'))
          .rowCount,
      ).toBe(0);
    }));
  it('rejects physical deletion and immutable request mutation', async () =>
    withSchema(async (client) => {
      await create(client);
      await expect(
        client.query(`DELETE FROM branded_generation_receipts`),
      ).rejects.toThrow('receipt_immutable');
      await expect(
        client.query(
          `UPDATE branded_generation_receipts SET "requestKey"='other'`,
        ),
      ).rejects.toThrow('receipt_immutable');
      await expect(
        client.query(`DELETE FROM branded_generation_receipt_events`),
      ).rejects.toThrow('receipt_event_immutable');
    }));
  it('rejects revision gaps and events without an aggregate operation', async () =>
    withSchema(async (client) => {
      await create(client);
      await client.query('BEGIN');
      await insertEvent(client, 1);
      await expect(client.query('COMMIT')).rejects.toThrow(
        'receipt_event_without_mutation',
      );
      await expect(
        client.query(`UPDATE branded_generation_receipts SET revision=2`),
      ).rejects.toThrow('receipt_immutable');
    }));
  it('retains unique tombstones and Restrict ownership while erasing only prompt payload', async () =>
    withSchema(async (client) => {
      await create(client);
      const envelope = `${'a'.repeat(32)}:aa:${'b'.repeat(32)}`;
      await client.query(
        `INSERT INTO generation_prompt_snapshots(id,"organizationId","brandId","userId",format,"contentHash",ciphertext,"brandedGenerationReceiptId","brandedGenerationReceiptRevision","brandedGenerationReceiptStage") VALUES('prompt','org','brand','user','genfeed.branded-generation-prompt.v1',$1,$2,'receipt',0,'original')`,
        [hash, envelope],
      );
      await expect(
        client.query(`UPDATE generation_prompt_snapshots SET ciphertext='bad'`),
      ).rejects.toThrow();
      await client.query('BEGIN');
      await client.query(
        `UPDATE branded_generation_receipts SET revision=1,"isDeleted"=true,projection=$1`,
        [projection(1, true)],
      );
      await client.query(
        `UPDATE generation_prompt_snapshots SET ciphertext='',"retentionState"='purged',"isDeleted"=true`,
      );
      await insertEvent(client, 1, true);
      await client.query(
        `UPDATE branded_generation_receipt_events SET "isDeleted"=true WHERE NOT "isDeleted"`,
      );
      await client.query('COMMIT');
      expect(
        (
          await client.query(
            'SELECT ciphertext FROM generation_prompt_snapshots',
          )
        ).rows[0].ciphertext,
      ).toBe('');
      await expect(
        client.query(`UPDATE brands SET "organizationId"='other'`),
      ).rejects.toThrow();
      await expect(
        client.query(`DELETE FROM generation_prompt_snapshots`),
      ).rejects.toThrow('receipt_prompt_immutable');
      await client.query('BEGIN');
      await expect(insertReceipt(client)).rejects.toThrow();
    }));
  it('rejects forged aggregate projection scope with no persisted row', async () =>
    withSchema(async (client) => {
      await client.query('BEGIN');
      await expect(
        client.query(
          `INSERT INTO branded_generation_receipts(id,"organizationId","brandId","actorId","requestKey","candidateIndex","requestHash",state,mode,surface,projection,"createdAt","updatedAt") VALUES('receipt','org','brand','user','request',0,$1,'created','raw','api',$2,$3,$3)`,
          [hash, { ...projection(), brandId: 'foreign' }, clock],
        ),
      ).rejects.toThrow();
      await client.query('ROLLBACK');
      expect(
        (await client.query('SELECT * FROM branded_generation_receipts'))
          .rowCount,
      ).toBe(0);
    }));
  it.each(['organizationId', 'brandId'] as const)(
    'rejects foreign event %s and preserves receipt/event history',
    async (field) =>
      withSchema(async (client) => {
        await create(client);
        const before = (
          await client.query(
            'SELECT projection FROM branded_generation_receipts',
          )
        ).rows;
        await client.query('BEGIN');
        await expect(
          client.query(
            `INSERT INTO branded_generation_receipt_events(id,"receiptId","organizationId","brandId","actorId","operationKey","operationHash",revision,type,projection) VALUES('attack','receipt',$1,$2,'user','attack',$3,1,'delete',$4)`,
            [
              field === 'organizationId' ? 'foreign' : 'org',
              field === 'brandId' ? 'foreign' : 'brand',
              hash,
              projection(1),
            ],
          ),
        ).rejects.toThrow();
        await client.query('ROLLBACK');
        expect(
          (
            await client.query(
              'SELECT projection FROM branded_generation_receipts',
            )
          ).rows,
        ).toEqual(before);
        expect(
          (
            await client.query(
              'SELECT * FROM branded_generation_receipt_events',
            )
          ).rowCount,
        ).toBe(1);
      }),
  );
  it('rejects event projection mismatch after a valid aggregate mutation and rolls both back', async () =>
    withSchema(async (client) => {
      await create(client);
      const before = (
        await client.query('SELECT projection FROM branded_generation_receipts')
      ).rows;
      await client.query('BEGIN');
      await client.query(
        'UPDATE branded_generation_receipts SET revision=1,projection=$1',
        [projection(1)],
      );
      await client.query(
        `INSERT INTO branded_generation_receipt_events(id,"receiptId","organizationId","brandId","actorId","operationKey","operationHash",revision,type,projection) VALUES('attack','receipt','org','brand','user','attack',$1,1,'cancel',$2)`,
        [hash, { ...projection(1), state: 'cancelled' }],
      );
      await expect(client.query('COMMIT')).rejects.toThrow();
      expect(
        (
          await client.query(
            'SELECT projection FROM branded_generation_receipts',
          )
        ).rows,
      ).toEqual(before);
      expect(
        (await client.query('SELECT * FROM branded_generation_receipt_events'))
          .rowCount,
      ).toBe(1);
    }));
});
