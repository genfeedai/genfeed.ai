import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260819104000_add_better_auth_activity_tracking/migration.sql',
  ),
  'utf8',
);
const userModel = schemaSource.slice(
  schemaSource.indexOf('model User {'),
  schemaSource.indexOf('model Organization {'),
);

describe('Better Auth activity tracking migration', () => {
  it('stores the optional dashboard activity timestamp on User', () => {
    expect(userModel).toContain('lastActiveAt');
    expect(userModel).toMatch(/lastActiveAt\s+DateTime\?/u);
  });

  it('adds the nullable column without inventing historical activity', () => {
    expect(migrationSource).toContain(
      'ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3)',
    );
    expect(migrationSource).not.toContain('NOT NULL');
    expect(migrationSource).not.toContain('DEFAULT');
    expect(migrationSource).not.toContain('UPDATE "users"');
  });
});
