import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { PrismaClient } from '../generated/prisma/client/client';

// Run on a development PostgreSQL server:
// AD_MAPPING_VERIFY_ADMIN_URL=postgresql://localhost/postgres bun run scripts/verify-ad-mapping-indexes.ts
// The supplied role needs CREATEDB. Only a newly created database is modified.
const adminUrl = process.env.AD_MAPPING_VERIFY_ADMIN_URL;
assert(
  adminUrl,
  'Set AD_MAPPING_VERIFY_ADMIN_URL to a disposable development server',
);
const database = `ad_mapping_verify_${process.pid}_${Date.now()}`;
const admin = new Client({ connectionString: adminUrl });
await admin.connect();
await admin.query(`CREATE DATABASE "${database}"`);
const url = new URL(adminUrl);
url.pathname = `/${database}`;
const connectionString = url.toString();
const db = new Client({ connectionString });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: [{ emit: 'event', level: 'query' }],
});
const queries: { query: string; params: string }[] = [];
prisma.$on('query', (event) => queries.push(event));
const lookups = [
  ['genfeedContentId', 'content', '20260904130000'],
  ['externalAdId', 'external_ad', '20260904130100'],
  ['adAccountId', 'account', '20260904130200'],
] as const;

async function lookup(key: string, value: string, organizationId = 'org-1') {
  const where = {
    data: { equals: value, path: [key] },
    isDeleted: false,
    organizationId,
  };
  return key === 'externalAdId'
    ? prisma.adCreativeMapping.findFirst({ where })
    : prisma.adCreativeMapping.findMany({ where });
}

async function explain(key: string) {
  queries.length = 0;
  await lookup(key, key === 'adAccountId' ? 'value-42' : 'value-4242');
  const captured = queries.at(-1);
  assert(captured, 'Prisma must emit the executed query');
  const result = await db.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${captured.query}`,
    JSON.parse(captured.params),
  );
  console.log(
    JSON.stringify({ key, sql: captured.query, plan: result.rows[0] }, null, 2),
  );
  return JSON.stringify(result.rows);
}

try {
  await db.connect();
  await db.query(`CREATE TABLE ad_creative_mappings (
    id TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "brandId" TEXT,
    data JSONB NOT NULL DEFAULT '{}', "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
  await db.query(
    'CREATE INDEX baseline_scope ON ad_creative_mappings ("organizationId", "isDeleted")',
  );
  await db.query(`INSERT INTO ad_creative_mappings (id, "organizationId", data)
    SELECT 'row-' || tenant || '-' || n, 'org-' || tenant,
      jsonb_build_object('genfeedContentId', 'value-' || n,
        'externalAdId', 'value-' || n, 'adAccountId', 'value-' || (n % 200))
    FROM generate_series(1, 10) tenant CROSS JOIN generate_series(1, 20000) n`);
  await db.query(`INSERT INTO ad_creative_mappings (id, "organizationId", "isDeleted", data)
    VALUES ('deleted', 'org-1', true, '{"genfeedContentId":"deleted-only","externalAdId":"deleted-only","adAccountId":"deleted-only"}'),
      ('empty', 'org-1', false, '{"genfeedContentId":"","externalAdId":"","adAccountId":""}'),
      ('null', 'org-1', false, '{"genfeedContentId":null,"externalAdId":null,"adAccountId":null}'),
      ('missing', 'org-1', false, '{}')`);
  await db.query('ANALYZE ad_creative_mappings');
  console.log('BEFORE');
  for (const [key] of lookups) await explain(key);
  for (const [, label, timestamp] of lookups) {
    const sql = await readFile(
      new URL(
        `../prisma/migrations/${timestamp}_ad_mapping_${label}_index/migration.sql`,
        import.meta.url,
      ),
      'utf8',
    );
    await db.query(sql);
  }
  await db.query('ANALYZE ad_creative_mappings');
  console.log('AFTER');
  for (const [key, label] of lookups) {
    const plan = await explain(key);
    assert(
      plan.includes(`ad_mappings_org_deleted_${label}_idx`),
      `Expected expression index for ${key}`,
    );
    const expected = key === 'externalAdId' ? null : [];
    assert.deepEqual(await lookup(key, 'absent'), expected);
    assert.deepEqual(await lookup(key, 'deleted-only'), expected);
    assert.deepEqual(await lookup(key, 'value-4242', 'org-absent'), expected);
    const matching = await lookup(
      key,
      key === 'adAccountId' ? 'value-42' : 'value-4242',
    );
    if (key === 'adAccountId') {
      assert(Array.isArray(matching));
      assert.equal(matching.length, 100);
      assert(
        matching.every(
          (row) => row.organizationId === 'org-1' && !row.isDeleted,
        ),
      );
    } else {
      assert.deepEqual(
        Array.isArray(matching)
          ? matching.map((row) => row.id)
          : [matching?.id],
        ['row-1-4242'],
      );
    }
    for (const [value, id] of [['', 'empty']]) {
      const result = await lookup(key, value);
      assert.deepEqual(
        Array.isArray(result) ? result.map((row) => row.id) : [result?.id],
        [id],
      );
    }
  }
  console.log(
    'PASS: all three indexes selected; tenant isolation, soft deletes, missing/null keys, empty identifiers and no-match contracts preserved.',
  );
} finally {
  await prisma.$disconnect();
  await db.end();
  await admin.query(`DROP DATABASE "${database}"`);
  await admin.end();
}
