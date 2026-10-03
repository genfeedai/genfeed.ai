import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20261004120000_character_sharing_gaps/migration.sql',
  ),
  'utf8',
);

describe('character owner move audit migration (#6040)', () => {
  it('adds nullable previous and new owning brand columns', () => {
    expect(migrationSource).toContain('ADD COLUMN "previousOwningBrand" TEXT');
    expect(migrationSource).toContain('ADD COLUMN "newOwningBrand" TEXT');
    expect(migrationSource).not.toMatch(/NOT NULL/);
    expect(schemaSource).toMatch(/previousOwningBrand\s+String\?/);
    expect(schemaSource).toMatch(/newOwningBrand\s+String\?/);
  });

  it('leaves existing audit and character rows untouched', () => {
    expect(migrationSource).not.toMatch(/DELETE FROM|UPDATE "/);
  });
});
