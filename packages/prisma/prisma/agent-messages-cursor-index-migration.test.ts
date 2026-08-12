import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const buildMigrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260811170000_agent_messages_cursor_index_id_desc/migration.sql',
  ),
  'utf8',
);
const cleanupMigrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260811170100_drop_replaced_agent_message_cursor_index/migration.sql',
  ),
  'utf8',
);

const replacementIndexName = 'agent_messages_org_thread_created_id_desc_idx';
const replacedIndexName =
  'agent_messages_organizationId_threadId_isDeleted_createdAt_id_idx';

const stripSqlComments = (sql: string): string =>
  sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

describe('agent_messages cursor index migrations (#2822)', () => {
  it('builds the id-DESC replacement concurrently in an isolated migration', () => {
    const buildSql = stripSqlComments(buildMigrationSource);

    expect(buildSql.match(/CREATE INDEX/g)).toHaveLength(1);
    expect(buildSql).toContain(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${replacementIndexName}"`,
    );
    expect(buildSql).toContain(
      'ON "agent_messages" ("organizationId", "threadId", "isDeleted", "createdAt" DESC, "id" DESC)',
    );
    expect(buildSql).not.toMatch(/DROP\s+INDEX/i);
  });

  it('drops the replaced id-ASC index only after the concurrent build', () => {
    const cleanupSql = stripSqlComments(cleanupMigrationSource);

    expect(cleanupSql).toContain(`DROP INDEX IF EXISTS "${replacedIndexName}"`);
    expect(cleanupSql).not.toContain('CONCURRENTLY');
    expect(cleanupSql).not.toMatch(/CREATE\s+INDEX/i);
  });

  it('maps the Prisma index to the replacement database name', () => {
    expect(schemaSource).toContain(
      `@@index([organizationId, threadId, isDeleted, createdAt(sort: Desc), id(sort: Desc)], map: "${replacementIndexName}")`,
    );
  });
});
