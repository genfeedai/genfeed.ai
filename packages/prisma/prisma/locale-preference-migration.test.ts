import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260808100000_add_locale_preference/migration.sql',
  ),
  'utf8',
);

describe('locale preference migration', () => {
  it('defaults both columns so existing rows resolve to English', () => {
    // NOT NULL without a default would abort on any populated table; the
    // default is what makes this deployable against production.
    expect(migrationSource).toContain(
      'ALTER TABLE "settings"\nADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT \'en\';',
    );
    expect(migrationSource).toContain(
      'ALTER TABLE "organization_settings"\nADD COLUMN IF NOT EXISTS "defaultLocale" TEXT NOT NULL DEFAULT \'en\';',
    );
  });
});
