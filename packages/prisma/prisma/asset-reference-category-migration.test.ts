import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260826170000_add_asset_reference_category/migration.sql',
  ),
  'utf8',
);
const indexMigrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260826170100_add_asset_reference_category_index/migration.sql',
  ),
  'utf8',
);

describe('asset reference category migration (#3539)', () => {
  it('adds the typed reference category column to Asset', () => {
    expect(schemaSource).toContain('enum ReferenceImageCategory');
    expect(schemaSource).toContain(
      'referenceCategory  ReferenceImageCategory?',
    );
    expect(migrationSource).toContain(
      'ADD COLUMN "referenceCategory" "ReferenceImageCategory";',
    );
  });

  it('backfills legacy display names once and defaults unknown references to STYLE', () => {
    expect(migrationSource).toContain('lower(COALESCE("displayName", \'\'))');
    expect(migrationSource).toContain(
      'ELSE \'STYLE\'::"ReferenceImageCategory"',
    );
    expect(migrationSource).toContain(
      'WHERE "category" = \'REFERENCE\'::"AssetCategory"',
    );
  });

  it('indexes live tenant and brand category lookups', () => {
    expect(indexMigrationSource).toContain(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "assets_brand_reference_category_idx"',
    );
    expect(indexMigrationSource).toContain(
      '"parentOrgId",\n    "parentBrandId",\n    "referenceCategory"',
    );
    expect(indexMigrationSource).toContain('WHERE "isDeleted" = false');
    expect(indexMigrationSource).toContain(
      'AND "parentType" = \'BRAND\'::"AssetParent"',
    );
    expect(migrationSource).not.toContain('CREATE INDEX CONCURRENTLY');
  });
});
