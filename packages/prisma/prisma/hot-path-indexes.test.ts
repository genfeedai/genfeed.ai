import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260618130000_add_app_shell_hot_path_indexes/migration.sql',
  ),
  'utf8',
);

const hotPathIndexes = [
  'members_org_user_deleted_idx',
  'brands_org_deleted_label_idx',
  'posts_org_deleted_status_created_at_idx',
  'posts_brand_deleted_status_created_at_idx',
  'posts_brand_credential_deleted_created_at_idx',
  'posts_brand_platform_deleted_created_at_idx',
  'agent_runs_org_deleted_status_completed_at_idx',
  'content_runs_org_brand_deleted_created_at_idx',
  'content_runs_org_brand_deleted_status_created_at_idx',
  'activities_deleted_created_at_idx',
  'activities_org_deleted_created_at_idx',
  'activities_brand_deleted_created_at_idx',
  'activities_user_deleted_created_at_idx',
  'batches_org_deleted_created_at_idx',
  'batches_org_brand_deleted_created_at_idx',
  'batches_org_deleted_status_created_at_idx',
] as const;

describe('app shell hot-path Prisma indexes', () => {
  it.each(
    hotPathIndexes,
  )('keeps %s in schema and migration source', (indexName) => {
    expect(schemaSource).toContain(`map: "${indexName}"`);
    // Built CONCURRENTLY so the deploy never ACCESS EXCLUSIVE-locks these hot
    // tables. Guardrail: a plain `CREATE INDEX` regression must fail CI.
    expect(migrationSource).toContain(
      `CREATE INDEX CONCURRENTLY "${indexName}"`,
    );
  });
});

// UNIQUE indexes added in #1194 (#1185) on hot, continuously-written tables
// (post_analytics ingestion, Stripe billing). These MUST build CONCURRENTLY too:
// a plain `CREATE UNIQUE INDEX` takes an ACCESS EXCLUSIVE lock for the whole
// build and would stall live Stripe webhooks / analytics ingestion on prod. The
// original #1194 migrations shipped the plain form — this guard exists so that
// regression fails CI. Partial (Stripe) indexes are raw-SQL-only and the
// post_analytics one is Prisma's default `@@unique` name, so we assert against
// the migration SQL rather than schema.prisma.
const dedupePreflightMigration =
  'migrations/20260703120050_preflight_hot_table_unique_dedupe/migration.sql';

// Strip `--` comment lines so structural checks inspect executable SQL only —
// the migration comments legitimately mention `DO $$` and `CONCURRENTLY`.
const stripSqlComments = (sql: string): string =>
  sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

const concurrentUniqueIndexMigrations = [
  {
    file: 'migrations/20260703120100_add_post_analytics_daily_unique/migration.sql',
    indexes: ['post_analytics_postId_platform_date_key'],
  },
  {
    file: 'migrations/20260703120200_add_billing_stripe_live_uniques/migration.sql',
    indexes: [
      'customers_stripeCustomerId_live_key',
      'subscriptions_stripeSubscriptionId_live_key',
    ],
  },
] as const;

describe('hot-path unique indexes build CONCURRENTLY (#1185/#1194)', () => {
  for (const { file, indexes } of concurrentUniqueIndexMigrations) {
    const source = readFileSync(join(prismaDir, file), 'utf8');

    describe(file, () => {
      it.each(indexes)('builds %s CONCURRENTLY', (indexName) => {
        // The create MUST be CONCURRENTLY (IF NOT EXISTS is optional after it).
        expect(source).toMatch(
          new RegExp(
            `CREATE UNIQUE INDEX CONCURRENTLY (IF NOT EXISTS )?"${indexName}"`,
          ),
        );
        // Regression guard: no plain, non-CONCURRENTLY create of this index.
        // (In the CONCURRENTLY form "CONCURRENTLY" sits between INDEX and the
        // name, so this pattern only matches the write-blocking plain form.)
        expect(source).not.toMatch(
          new RegExp(`CREATE UNIQUE INDEX (IF NOT EXISTS )?"${indexName}"`),
        );
      });

      // A CONCURRENTLY build cannot share a file with a `DO $$ … $$` block:
      // Prisma wraps a mixed-statement migration in a transaction and
      // CONCURRENTLY cannot run inside one. Guard against reintroducing it.
      it('carries no in-file transaction block that would break CONCURRENTLY', () => {
        expect(stripSqlComments(source)).not.toContain('DO $$');
      });
    });
  }

  // The pre-existing-duplicate safety is NOT weakened — it lives in a dedicated,
  // transaction-safe preflight migration that runs before the index builds.
  it('keeps the dedup preflight guard in its own migration', () => {
    const preflight = readFileSync(
      join(prismaDir, dedupePreflightMigration),
      'utf8',
    );
    const preflightSql = stripSqlComments(preflight);
    // Preflight must be transaction-safe (no CONCURRENTLY) and cover all three
    // hot tables with an aborting duplicate check.
    expect(preflightSql).not.toContain('CONCURRENTLY');
    for (const table of ['post_analytics', 'customers', 'subscriptions']) {
      expect(preflightSql).toContain(`FROM "${table}"`);
    }
    expect(
      (preflightSql.match(/RAISE EXCEPTION/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });
});
