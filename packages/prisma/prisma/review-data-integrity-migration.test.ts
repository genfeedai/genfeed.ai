import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const dataMigration = '20260830210000_fix_review_data_integrity';
const indexMigration =
  '20260830210100_fix_review_data_integrity_online_indexes';
const dataMigrationSource = readFileSync(
  join(prismaDir, `migrations/${dataMigration}/migration.sql`),
  'utf8',
);
const indexMigrationSource = readFileSync(
  join(prismaDir, `migrations/${indexMigration}/migration.sql`),
  'utf8',
);

const stripSqlComments = (sql: string): string =>
  sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

describe('review data integrity migrations (#4162)', () => {
  it('keeps index construction outside the transactional data migration', () => {
    expect(stripSqlComments(dataMigrationSource)).not.toMatch(
      /CREATE\s+(?:UNIQUE\s+)?INDEX/i,
    );
    expect(indexMigration > dataMigration).toBe(true);
  });

  it('builds every reviewed index concurrently in an isolated migration', () => {
    const indexSql = stripSqlComments(indexMigrationSource);

    expect(
      indexSql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/gi),
    ).toHaveLength(3);
    expect(indexSql).toContain(
      'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "subscription_attributions_org_stripe_subscription_key"',
    );
    expect(indexSql).toContain(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "posts_org_credential_status_scheduled_idx"',
    );
    expect(indexSql).toContain(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "posts_org_credential_status_published_idx"',
    );
    expect(indexSql).not.toMatch(/\b(?:ALTER|BEGIN|COMMIT|DROP|UPDATE)\b/i);
  });
});
