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
