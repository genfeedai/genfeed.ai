// One-shot prod credential smoke test: AWS S3 + MongoDB + Postgres.
// Creds are read from env (the companion check-prod-creds.sh pulls them from
// SSM via substitution, so no secret value is ever printed or stored on disk).
// READ-ONLY: ListBuckets / Mongo ping / SELECT 1. Prints a PASS/FAIL matrix only.
//
// Usage:  bash scripts/check-prod-creds.sh
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MongoClient } from 'mongodb';
import { ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';

// pg is bun-isolated (not hoisted) — resolve it from node_modules/.bun directly.
async function loadPg() {
  try {
    const bun = join(process.cwd(), 'node_modules/.bun');
    const dir = readdirSync(bun).find((d) => d.startsWith('pg@'));
    if (!dir) return null;
    const mod = await import(join(bun, dir, 'node_modules/pg/lib/index.js'));
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

const out = [];

try {
  const creds = process.env.__AWS_ID
    ? {
        accessKeyId: process.env.__AWS_ID,
        secretAccessKey: process.env.__AWS_SECRET,
      }
    : undefined;
  const s3 = new S3Client({
    region: process.env.AWS_REGION || 'us-west-1',
    credentials: creds,
  });
  const r = await s3.send(new ListBucketsCommand({}));
  out.push(['AWS S3', true, `${(r.Buckets ?? []).length} buckets visible`]);
} catch (e) {
  out.push(['AWS S3', false, e?.name || e?.message]);
}

try {
  if (!process.env.__MONGO) throw new Error('no MONGODB_URL');
  const m = new MongoClient(process.env.__MONGO, {
    serverSelectionTimeoutMS: 10000,
  });
  await m.connect();
  await m.db().command({ ping: 1 });
  const db = m.db().databaseName;
  await m.close();
  out.push(['MongoDB', true, `ping ok, db=${db}`]);
} catch (e) {
  out.push(['MongoDB', false, e?.codeName || e?.message]);
}

try {
  if (!process.env.__PG) throw new Error('no DATABASE_URL');
  const pg = await loadPg();
  if (!pg) throw new Error('pg module not found under node_modules/.bun');
  const u = new URL(process.env.__PG);
  const sm = u.searchParams.get('sslmode');
  if (sm && sm !== 'disable' && sm !== 'no-verify')
    u.searchParams.set('sslmode', 'no-verify');
  const c = new pg.Client({
    connectionString: u.toString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  await c.connect();
  await c.query('select 1 as ok');
  await c.end();
  out.push(['Postgres', true, 'connect + select 1 ok']);
} catch (e) {
  out.push(['Postgres', false, e?.message]);
}

console.log(
  '\n=== PROD CREDENTIAL SMOKE TEST (from SSM — no secrets printed) ===',
);
for (const [sys, ok, info] of out)
  console.log(
    `  ${ok ? '✅' : '❌'} ${sys.padEnd(9)} ${(ok ? 'PASS' : 'FAIL').padEnd(5)} ${info}`,
  );
const all = out.every((r) => r[1]);
console.log(all ? '\nALL CREDS GOOD ✅\n' : '\nSOME FAILED ❌\n');
process.exit(all ? 0 : 1);
