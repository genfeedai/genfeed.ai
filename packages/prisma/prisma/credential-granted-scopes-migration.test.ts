import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260814013000_credential_granted_scopes/migration.sql',
  ),
  'utf8',
);

const credentialModel = schemaSource.slice(
  schemaSource.indexOf('model Credential {'),
  schemaSource.indexOf('model ApiKey {'),
);

describe('Credential granted OAuth scopes (#2266)', () => {
  it('adds grantedScopes and capturedAt on Credential only', () => {
    expect(credentialModel).toContain(
      'grantedScopes                   String[]           @default([])',
    );
    expect(credentialModel).toContain(
      'grantedScopesCapturedAt         DateTime?',
    );
    expect(schemaSource.match(/^\s+grantedScopes\s+String\[\]/gmu)).toEqual([
      expect.stringContaining('grantedScopes'),
    ]);
  });

  it('creates the columns without backfilling capturedAt', () => {
    expect(migrationSource).toContain(
      'ADD COLUMN IF NOT EXISTS "grantedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]',
    );
    expect(migrationSource).toContain(
      'ADD COLUMN IF NOT EXISTS "grantedScopesCapturedAt" TIMESTAMP(3)',
    );
    expect(migrationSource).not.toContain('UPDATE "credentials"');
  });
});
