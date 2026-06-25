import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260624120000_replace_superadmin_flag_with_platform_role/migration.sql',
  ),
  'utf8',
);

describe('platform role migration', () => {
  it('stores platform authorization as a role instead of a boolean flag', () => {
    expect(schemaSource).toContain('enum PlatformRole');
    expect(schemaSource).toContain('platformRole             PlatformRole');
    expect(schemaSource).not.toContain('isSuperAdmin             Boolean');
  });

  it('backfills legacy superadmins and assigns the initial production admin', () => {
    expect(migrationSource).toContain(
      "CREATE TYPE \"PlatformRole\" AS ENUM ('USER', 'SUPERADMIN')",
    );
    expect(migrationSource).toContain('WHERE "isSuperAdmin" = true');
    expect(migrationSource).toContain("lower('vincent@genfeed.ai')");
    expect(migrationSource).toContain('bootstrap_match_count <> 1');
    expect(migrationSource).toContain('Expected exactly one bootstrap');
    expect(migrationSource).toContain('DROP COLUMN "isSuperAdmin"');
  });
});
