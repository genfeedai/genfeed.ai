import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(prismaDir, 'migrations/20260829090000_drop_legacy_runs/migration.sql'),
  'utf8',
);

describe('legacy runs hard cut migration', () => {
  it('drops the standalone runs table without retaining a projection', () => {
    expect(migration).toContain('DROP TABLE IF EXISTS "runs"');
    expect(schema).not.toMatch(/model Run\s*\{/);
    expect(schema).not.toContain('@@map("runs")');
  });
});
