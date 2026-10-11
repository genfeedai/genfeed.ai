import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20261011120000_workflow_platform_seed_key/migration.sql',
  ),
  'utf8',
);

describe('workflow platform seed key (#6689)', () => {
  it('adds a nullable platformSeedKey column in schema and migration', () => {
    expect(schema).toMatch(/platformSeedKey\s+String\?/);
    expect(migration).toContain(
      'ALTER TABLE "workflows" ADD COLUMN "platformSeedKey" TEXT;',
    );
  });

  it('does not backfill the marker from forgeable metadata', () => {
    expect(migration).not.toMatch(/UPDATE\s+"workflows"/i);
    expect(migration).not.toMatch(/sourceTemplateId|metadata/);
  });

  it('allows at most one live marked row per organization and template', () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "workflows_platform_seed_key_org_uidx"',
    );
    expect(migration).toContain('("organizationId", "platformSeedKey")');
    expect(migration).toContain('"platformSeedKey" IS NOT NULL');
    expect(migration).toContain('"isDeleted" = false');
  });
});
