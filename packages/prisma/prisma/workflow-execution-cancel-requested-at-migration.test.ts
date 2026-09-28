import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260928210000_workflow_execution_cancel_requested_at/migration.sql',
  ),
  'utf8',
);

describe('workflow execution cancel intent (#5450)', () => {
  it('adds a nullable cancelRequestedAt column in schema and migration', () => {
    expect(schema).toMatch(/cancelRequestedAt\s+DateTime\?/);
    expect(migration).toContain(
      'ALTER TABLE "workflow_executions" ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);',
    );
    expect(migration).not.toContain('NOT NULL');
  });
});
