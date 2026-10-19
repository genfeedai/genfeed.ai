import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20261019080000_workflow_execution_review_gate_index/migration.sql',
  ),
  'utf8',
);

const indexName = 'workflow_executions_org_status_deleted_created_idx';

const stripSqlComments = (sql: string): string =>
  sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

describe('workflow_executions review gate index migration', () => {
  it('builds the status-leading index concurrently as the only statement', () => {
    const sql = stripSqlComments(migrationSource);

    expect(sql.match(/CREATE INDEX/g)).toHaveLength(1);
    expect(sql).toContain(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexName}"`,
    );
    expect(sql).toContain(
      'ON "workflow_executions" ("organizationId", "status", "isDeleted", "createdAt")',
    );
    expect(sql).not.toMatch(/DROP\s+INDEX/i);
  });

  it('maps the Prisma index to the migration index name', () => {
    expect(schemaSource).toContain(
      `@@index([organizationId, status, isDeleted, createdAt], map: "${indexName}")`,
    );
  });
});
