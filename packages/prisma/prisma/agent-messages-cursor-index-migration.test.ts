import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260811170000_agent_messages_cursor_index_id_desc/migration.sql',
  ),
  'utf8',
);

/**
 * #1626: nightly E2E failed with P3018 because `DROP INDEX CONCURRENTLY`
 * cannot run inside Prisma's migration transaction. Prisma only unwraps
 * bare `CREATE INDEX CONCURRENTLY` migrations — not DROP CONCURRENTLY.
 */
describe('agent_messages cursor index migration (#1626 / #2791)', () => {
  it('does not use DROP INDEX CONCURRENTLY (breaks migrate deploy in CI)', () => {
    expect(migrationSource).not.toMatch(/DROP\s+INDEX\s+CONCURRENTLY/i);
  });

  it('still rebuilds the composite index with id DESC for keyset pagination', () => {
    expect(migrationSource).toContain(
      'DROP INDEX IF EXISTS "agent_messages_organizationId_threadId_isDeleted_createdAt_id_idx"',
    );
    expect(migrationSource).toMatch(
      /CREATE INDEX(?:\s+IF NOT EXISTS)?\s+"agent_messages_organizationId_threadId_isDeleted_createdAt_id_idx"/,
    );
    expect(migrationSource).toContain('"id" DESC');
  });
});
