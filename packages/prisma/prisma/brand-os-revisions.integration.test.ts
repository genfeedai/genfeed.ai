import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    './migrations/20260914150000_brand_os_revisions/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const reviewMigration = readFileSync(
  new URL(
    './migrations/20261002043000_brand_os_generation_rules_review/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
function resolveDatabaseUrl(
  environment: NodeJS.ProcessEnv,
): string | undefined {
  const isCi = environment.CI === 'true';
  const isRequired = isCi || environment.BRAND_OS_REQUIRE_POSTGRES === '1';
  const explicit = environment.BRAND_OS_TEST_DATABASE_URL;
  const isFallback = explicit === undefined && isCi;
  const selected = isFallback
    ? environment.KNOWLEDGE_TEST_DATABASE_URL
    : explicit;
  if (selected === undefined) {
    if (isRequired)
      throw new Error(
        'Brand OS PostgreSQL verification requires an isolated database URL',
      );
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(selected);
  } catch {
    throw new Error(
      'Brand OS PostgreSQL verification requires a valid loopback PostgreSQL URL',
    );
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !['localhost', '127.0.0.1', '::1'].includes(hostname) ||
    ['host', 'hostaddr', 'service', 'servicefile', 'options'].some((key) =>
      parsed.searchParams.has(key),
    ) ||
    (isFallback &&
      (parsed.pathname !== '/test' ||
        parsed.search !== '' ||
        parsed.hash !== ''))
  )
    throw new Error(
      'Brand OS PostgreSQL verification refused an unsafe database URL',
    );
  return selected;
}

// Fail required CI/direct gates before suite registration. Never use DATABASE_URL.
const databaseUrl = resolveDatabaseUrl(process.env);

// Named direct proof: BRAND_OS_REQUIRE_POSTGRES=1 bunx vitest run --config vitest.config.ts
// prisma/brand-os-revisions.integration.test.ts --passWithNoTests=false
// Supply BRAND_OS_TEST_DATABASE_URL separately; CI uses its existing disposable /test database.
describe('Brand OS PostgreSQL database guard', () => {
  const explicit = 'postgresql://localhost/brand_os_owned';
  const fallback = 'postgresql://127.0.0.1/test';

  it('prefers a supplied brand database over the CI fallback', () => {
    expect(
      resolveDatabaseUrl({
        CI: 'true',
        BRAND_OS_TEST_DATABASE_URL: explicit,
        KNOWLEDGE_TEST_DATABASE_URL: fallback,
      }),
    ).toBe(explicit);
  });

  it.each(['postgresql://localhost/test', fallback, 'postgres://[::1]/test'])(
    'admits only CI disposable fallback: %s',
    (url) => {
      expect(
        resolveDatabaseUrl({ CI: 'true', KNOWLEDGE_TEST_DATABASE_URL: url }),
      ).toBe(url);
      expect(
        resolveDatabaseUrl({ KNOWLEDGE_TEST_DATABASE_URL: url }),
      ).toBeUndefined();
    },
  );

  it.each([
    { CI: 'true' },
    { BRAND_OS_REQUIRE_POSTGRES: '1' },
    { BRAND_OS_REQUIRE_POSTGRES: '1', KNOWLEDGE_TEST_DATABASE_URL: fallback },
  ])('rejects a required gate without an admitted URL: %j', (environment) => {
    expect(() => resolveDatabaseUrl(environment)).toThrow(
      'requires an isolated database URL',
    );
  });

  it.each([
    '',
    'invalid',
    'https://localhost/test',
    'postgresql://remote.example/test',
    'postgresql://localhost/test?host=remote.example',
    'postgresql://localhost/test?hostaddr=127.0.0.2',
    'postgresql://localhost/test?service=production',
    'postgresql://localhost/test?options=-csearch_path=public',
  ])('rejects a supplied invalid URL without falling back: %s', (url) => {
    expect(() =>
      resolveDatabaseUrl({ BRAND_OS_TEST_DATABASE_URL: url }),
    ).toThrow();
    expect(() =>
      resolveDatabaseUrl({
        CI: 'true',
        BRAND_OS_TEST_DATABASE_URL: url,
        KNOWLEDGE_TEST_DATABASE_URL: fallback,
      }),
    ).toThrow();
  });

  it.each([
    '',
    'invalid',
    'https://localhost/test',
    'postgresql://remote.example/test',
    'postgresql://localhost/other',
    'postgresql://localhost/test?sslmode=disable',
    'postgresql://localhost/test#fragment',
  ])('rejects unsafe or non-disposable CI fallback: %s', (url) => {
    expect(() =>
      resolveDatabaseUrl({ CI: 'true', KNOWLEDGE_TEST_DATABASE_URL: url }),
    ).toThrow();
  });

  it('never inherits the application DATABASE_URL', () => {
    const application = {
      DATABASE_URL: 'postgresql://remote.example/production',
    };
    expect(resolveDatabaseUrl(application)).toBeUndefined();
    expect(() => resolveDatabaseUrl({ ...application, CI: 'true' })).toThrow();
    expect(() =>
      resolveDatabaseUrl({ ...application, BRAND_OS_REQUIRE_POSTGRES: '1' }),
    ).toThrow();
    expect(
      resolveDatabaseUrl({
        ...application,
        BRAND_OS_TEST_DATABASE_URL: explicit,
      }),
    ).toBe(explicit);
  });
});

const hash = `sha256:${'a'.repeat(64)}`;
const otherHash = `sha256:${'b'.repeat(64)}`;

// An explicit isolated database is required; never inherit the application database.
describe.skipIf(!databaseUrl)('Brand OS PostgreSQL migration', () => {
  it('preserves legacy rows through the nullable review migration and rejects malformed stored digests', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schema = `brand_os_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query(
        `CREATE TABLE organizations (id TEXT PRIMARY KEY); CREATE TABLE users (id TEXT PRIMARY KEY); CREATE TABLE brands (id TEXT PRIMARY KEY); INSERT INTO organizations VALUES ('org'); INSERT INTO users VALUES ('owner'); INSERT INTO brands VALUES ('brand');`,
      );
      await client.query(migration);
      await client.query(
        `INSERT INTO brand_os_revisions (id,"organizationId","brandId",version,content,"updatedAt",status,"approvedById","approvedAt") VALUES ('legacy-approved','org','brand',1,'{}',NOW(),'APPROVED','owner',NOW()), ('legacy-superseded','org','brand',2,'{}',NOW(),'SUPERSEDED','owner',NOW()), ('legacy-draft','org','brand',3,'{}',NOW(),'DRAFT',NULL,NULL)`,
      );
      const before = (
        await client.query(`SELECT * FROM brand_os_revisions ORDER BY id`)
      ).rows;
      await client.query(reviewMigration);
      expect(
        (await client.query(`SELECT * FROM brand_os_revisions ORDER BY id`))
          .rows,
      ).toEqual(
        before.map((row) => ({ ...row, generationRulesReviewHash: null })),
      );
      await client.query(
        `UPDATE brand_os_revisions SET "generationRulesReviewHash"=$1 WHERE id='legacy-draft'`,
        [hash],
      );
      expect(
        (
          await client.query(
            `SELECT "generationRulesReviewHash" FROM brand_os_revisions WHERE id='legacy-draft'`,
          )
        ).rows,
      ).toEqual([{ generationRulesReviewHash: hash }]);
      for (const invalid of [
        '',
        'sha256:bad',
        'a'.repeat(64),
        `sha256:${'A'.repeat(64)}`,
        ` ${hash}`,
        `${hash} `,
        `${hash}\n`,
      ]) {
        await expect(
          client.query(
            `UPDATE brand_os_revisions SET "generationRulesReviewHash"=$1 WHERE id='legacy-draft'`,
            [invalid],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      }
      await client.query(
        `UPDATE brand_os_revisions SET "generationRulesReviewHash"=NULL WHERE id='legacy-draft'`,
      );
      expect(
        (
          await client.query(
            `SELECT "generationRulesReviewHash" FROM brand_os_revisions WHERE id='legacy-draft'`,
          )
        ).rows,
      ).toEqual([{ generationRulesReviewHash: null }]);
    } finally {
      await client.query('ROLLBACK');
      await client.query('RESET search_path');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  }, 20_000);

  it('enforces approval metadata, unique versions, rollback of approval digests and competing digest-bearing approvals', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 3 });
    const client = await pool.connect();
    const second = await pool.connect();
    const schema = `brand_os_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await second.query(`SET search_path TO "${schema}"`);
      await client.query(`
        CREATE TABLE organizations (id TEXT PRIMARY KEY);
        CREATE TABLE users (id TEXT PRIMARY KEY);
        CREATE TABLE brands (id TEXT PRIMARY KEY);
        INSERT INTO organizations VALUES ('org');
        INSERT INTO users VALUES ('owner');
        INSERT INTO brands VALUES ('brand');
      `);
      await client.query(migration);
      await client.query(reviewMigration);
      const insert = `INSERT INTO brand_os_revisions (id,"organizationId","brandId",version,content,"updatedAt") VALUES ($1,'org','brand',$2,'{}',NOW())`;
      await client.query(insert, ['one', 1]);
      await client.query(insert, ['two', 2]);
      await client.query(insert, ['three', 3]);
      await expect(
        client.query(insert, ['duplicate', 1]),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        client.query(
          `UPDATE brand_os_revisions SET status='APPROVED' WHERE id='one'`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      const approve = `UPDATE brand_os_revisions SET status='APPROVED',"approvedById"='owner',"approvedAt"=NOW(),"generationRulesReviewHash"=$2 WHERE id=$1`;
      await client.query(approve, ['one', hash]);
      const beforeRollback = (
        await client.query(`SELECT * FROM brand_os_revisions ORDER BY id`)
      ).rows;
      await client.query('BEGIN');
      await client.query(
        `UPDATE brand_os_revisions SET status='SUPERSEDED' WHERE id='one'`,
      );
      await client.query(approve, ['two', otherHash]);
      await client.query('ROLLBACK');
      expect(
        (await client.query(`SELECT * FROM brand_os_revisions ORDER BY id`))
          .rows,
      ).toEqual(beforeRollback);
      expect(
        (
          await client.query(
            `SELECT id FROM brand_os_revisions WHERE status='APPROVED'`,
          )
        ).rows,
      ).toEqual([{ id: 'one' }]);
      await client.query(
        `UPDATE brand_os_revisions SET status='SUPERSEDED' WHERE id='one'`,
      );
      await client.query('BEGIN');
      await client.query(approve, ['two', otherHash]);
      const competing = second.query(approve, ['three', hash]);
      const competingResult = expect(competing).rejects.toMatchObject({
        code: '23505',
      });
      await client.query('COMMIT');
      await competingResult;
      expect(
        (
          await client.query(
            `SELECT id FROM brand_os_revisions WHERE status='APPROVED'`,
          )
        ).rows,
      ).toEqual([{ id: 'two' }]);
      expect(
        (
          await client.query(
            `SELECT id, "generationRulesReviewHash" FROM brand_os_revisions ORDER BY id`,
          )
        ).rows,
      ).toEqual([
        { id: 'one', generationRulesReviewHash: hash },
        { id: 'three', generationRulesReviewHash: null },
        { id: 'two', generationRulesReviewHash: otherHash },
      ]);
      await expect(
        client.query(`DELETE FROM users WHERE id='owner'`),
      ).rejects.toMatchObject({ code: '23503' });
      await client.query(
        `INSERT INTO brand_os_publications (id,"organizationId","brandId","revisionId","publishedById","updatedAt") VALUES ('public','org','brand','two','owner',NOW())`,
      );
      await expect(
        client.query(
          `INSERT INTO brand_os_publications (id,"organizationId","brandId","revisionId","publishedById","updatedAt") VALUES ('duplicate','org','brand','two','owner',NOW())`,
        ),
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      await client.query('ROLLBACK');
      await client.query('RESET search_path');
      await second.query('RESET search_path');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      second.release();
      await pool.end();
    }
  }, 20_000);
});
