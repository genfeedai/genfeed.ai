import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createDecipheriv, createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import {
  CREDENTIAL_BACKFILL_VERSION,
  runCredentialEncryptionBackfill,
} from '../../../apps/server/api/scripts/credential-encryption-backfill';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const release = process.argv.find((arg) => arg.startsWith('--from='))?.slice(7);
assert(
  release && (release === 'HEAD' || /^v\d+\.\d+\.\d+$/.test(release)),
  'Pass --from=vX.Y.Z for the previous published stable release, or --from=HEAD for repeated-release verification',
);
const adminUrl = process.env.UPGRADE_VERIFY_ADMIN_URL;
assert(
  adminUrl,
  'Set UPGRADE_VERIFY_ADMIN_URL to a disposable PostgreSQL server',
);
const parsedAdmin = new URL(adminUrl);
assert(
  ['localhost', '127.0.0.1', '[::1]'].includes(parsedAdmin.hostname),
  'Upgrade verification only accepts a local disposable database server',
);
const baselineSha = execFileSync(
  'git',
  [
    'rev-parse',
    '--verify',
    release === 'HEAD' ? 'HEAD^{commit}' : `refs/tags/${release}^{commit}`,
  ],
  { cwd: root, encoding: 'utf8' },
).trim();
const artifactsRoot = join(homedir(), '.codex/artifacts');
await mkdir(artifactsRoot, { recursive: true });
const artifact = await mkdtemp(join(artifactsRoot, 'release-upgrade-'));
const database = `release_upgrade_${process.pid}_${Date.now()}`;
const connectionUrl = new URL(adminUrl);
connectionUrl.pathname = `/${database}`;
const connectionString = connectionUrl.toString();
const admin = new Client({ connectionString: adminUrl });
const db = new Client({ connectionString });
const other = new Client({ connectionString });
const secret = 'synthetic-upgrade-fixture-key';
const args = { dryRun: false, batchSize: 1 };
const migrate = (config: string) =>
  execFileSync(
    process.execPath,
    [
      join(root, 'packages/prisma/node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
      '--config',
      config,
    ],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: connectionString },
      stdio: 'inherit',
    },
  );
function decrypt(envelope: string): string {
  const [iv, ciphertext, tag] = envelope.split(':');
  assert(iv && ciphertext && tag);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    createHash('sha256').update(secret).digest(),
    Buffer.from(iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
let created = false;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  const files = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', baselineSha, 'packages/prisma/prisma'],
    { cwd: root, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(
      (path) => path.endsWith('schema.prisma') || path.includes('/migrations/'),
    );
  for (const path of files) {
    const destination = join(artifact, path);
    await mkdir(resolve(destination, '..'), { recursive: true });
    await writeFile(
      destination,
      execFileSync('git', ['show', `${baselineSha}:${path}`], { cwd: root }),
    );
  }
  const config = join(artifact, 'prisma.config.mjs');
  await writeFile(
    config,
    `export default ${JSON.stringify({
      schema: join(artifact, 'packages/prisma/prisma/schema.prisma'),
      migrations: { path: join(artifact, 'packages/prisma/prisma/migrations') },
      datasource: { url: connectionString },
    })}`,
  );
  migrate(config);
  await db.connect();
  await other.connect();
  await db.query(`INSERT INTO users (id, handle, email, "updatedAt")
    VALUES ('upgrade-user', 'upgrade-user', 'upgrade@example.invalid', NOW());
    INSERT INTO organizations (id, "userId", label, slug, "updatedAt")
    VALUES ('upgrade-org', 'upgrade-user', 'Upgrade', 'upgrade-org', NOW());
    INSERT INTO brands (id, "organizationId", "userId", slug, label, "isSelected", "updatedAt")
    VALUES ('upgrade-brand', 'upgrade-org', 'upgrade-user', 'upgrade-brand', 'Upgrade', true, NOW());
    INSERT INTO credentials (id, "organizationId", "brandId", "userId", platform, "accessToken", "refreshToken", "updatedAt")
    VALUES ('upgrade-credential', 'upgrade-org', 'upgrade-brand', 'upgrade-user', 'YOUTUBE', 'synthetic-access', 'synthetic-refresh', NOW());
    INSERT INTO credentials (id, platform, "accessToken", "isDeleted", "updatedAt")
    VALUES ('upgrade-deleted', 'YOUTUBE', 'synthetic-deleted', true, NOW())`);
  await assert.rejects(
    runCredentialEncryptionBackfill(db, args, ''),
    /TOKEN_ENCRYPTION_KEY/,
  );
  const baselineLedger = await db.query(
    "SELECT to_regclass('data_backfills') AS ledger",
  );
  if (!baselineLedger.rows[0].ledger) {
    await assert.rejects(
      runCredentialEncryptionBackfill(db, args, secret),
      /data_backfills/,
    );
  }
  migrate(join(root, 'packages/prisma/prisma.config.mjs'));

  // Exercise missing-ledger failure even once the preceding release already
  // contains this schema. Rename only within this disposable fixture database.
  await db.query(
    'ALTER TABLE data_backfills RENAME TO fixture_hidden_backfills',
  );
  try {
    await assert.rejects(
      runCredentialEncryptionBackfill(db, args, secret),
      /data_backfills/,
    );
  } finally {
    await db.query(
      'ALTER TABLE fixture_hidden_backfills RENAME TO data_backfills',
    );
  }
  assert.equal(
    (
      await db.query('SELECT "userId" FROM organizations WHERE id = $1', [
        'upgrade-org',
      ])
    ).rows[0].userId,
    'upgrade-user',
  );
  assert.equal(
    (
      await db.query('SELECT "organizationId" FROM brands WHERE id = $1', [
        'upgrade-brand',
      ])
    ).rows[0].organizationId,
    'upgrade-org',
  );
  await runCredentialEncryptionBackfill(db, { ...args, dryRun: true }, secret);
  assert.equal(
    (await db.query('SELECT count(*) FROM data_backfills')).rows[0].count,
    '0',
  );
  assert.equal(
    (
      await db.query('SELECT "accessToken" FROM credentials WHERE id = $1', [
        'upgrade-credential',
      ])
    ).rows[0].accessToken,
    'synthetic-access',
  );

  // Force a real database failure after one row was updated: neither partial
  // encryption nor the completion marker may survive.
  await db.query(`CREATE FUNCTION reject_backfill_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.id = 'upgrade-deleted' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_backfill_fixture BEFORE UPDATE ON credentials FOR EACH ROW EXECUTE FUNCTION reject_backfill_fixture()`);
  await assert.rejects(
    runCredentialEncryptionBackfill(db, args, secret),
    /synthetic failure/,
  );
  assert.equal(
    (await db.query('SELECT count(*) FROM data_backfills')).rows[0].count,
    '0',
  );
  assert.equal(
    (
      await db.query('SELECT "accessToken" FROM credentials WHERE id = $1', [
        'upgrade-credential',
      ])
    ).rows[0].accessToken,
    'synthetic-access',
  );
  await db.query(
    'DROP TRIGGER reject_backfill_fixture ON credentials; DROP FUNCTION reject_backfill_fixture()',
  );

  await other.query('BEGIN');
  await other.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    CREDENTIAL_BACKFILL_VERSION,
  ]);
  await assert.rejects(
    runCredentialEncryptionBackfill(db, args, secret),
    /already running/,
  );
  await other.query('ROLLBACK');

  // A refresh committed while the backfill waits for the row lock is the value
  // that gets encrypted, never the stale token read before the refresh.
  await other.query('BEGIN');
  await other.query('UPDATE credentials SET "accessToken" = $1 WHERE id = $2', [
    'synthetic-refreshed',
    'upgrade-credential',
  ]);
  const first = runCredentialEncryptionBackfill(db, args, secret);
  await new Promise((done) => setTimeout(done, 100));
  await other.query('COMMIT');
  const report = await first;
  assert.equal(report.rowsUpdated, 2);
  await assert.rejects(
    runCredentialEncryptionBackfill(db, { ...args, batchSize: 0 }, secret),
    /batchSize/,
  );
  const credentials = await db.query('SELECT * FROM credentials ORDER BY id');
  assert.equal(decrypt(credentials.rows[0].accessToken), 'synthetic-refreshed');
  assert.equal(decrypt(credentials.rows[0].refreshToken), 'synthetic-refresh');
  assert.equal(credentials.rows[0].organizationId, 'upgrade-org');
  assert.equal(decrypt(credentials.rows[1].accessToken), 'synthetic-deleted');
  assert.equal(credentials.rows[1].isDeleted, true);
  assert.equal(
    (await db.query('SELECT count(*) FROM data_backfills')).rows[0].count,
    '1',
  );
  assert.equal(
    (await runCredentialEncryptionBackfill(db, args, secret)).skipped,
    true,
  );
  assert.deepEqual(
    (await db.query('SELECT * FROM credentials ORDER BY id')).rows,
    credentials.rows,
  );
  migrate(join(root, 'packages/prisma/prisma.config.mjs'));
  const evidence = {
    baselineRelease: release,
    baselineSha,
    candidateSha: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    report,
    passed: [
      'released-schema-upgrade',
      'ownership-preservation',
      'dry-run',
      'failure-rollback-and-retry',
      'concurrent-run-exclusion',
      'concurrent-token-refresh',
      'deleted-credential-encryption',
      'durable-completion-skip',
      'migration-rerun',
    ],
  };
  await writeFile(
    join(artifact, 'evidence.json'),
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    `PASS: release upgrade verified. Evidence: ${join(artifact, 'evidence.json')}`,
  );
} finally {
  await db.end();
  await other.end();
  if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  await admin.end();
  // Config includes only local synthetic credentials; remove it regardless.
  await rm(join(artifact, 'prisma.config.mjs'), { force: true });
}
