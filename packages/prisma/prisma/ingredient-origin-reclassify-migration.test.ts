import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20261003190000_ingredient_origin_reclassify/migration.sql',
  ),
  'utf8',
);

describe('ingredient origin reclassify migration (#6010)', () => {
  it('reclassifies a row that stays UNKNOWN across an update, with the shared rules', () => {
    expect(migrationSource).toContain(
      `IF OLD."origin" = 'UNKNOWN' AND NEW."origin" = 'UNKNOWN' THEN`,
    );
    expect(migrationSource).toContain('"ingredients_classify_origin"(');
    expect(migrationSource).toContain('BEFORE UPDATE ON "ingredients"');
    expect(migrationSource).toContain(`WHEN (OLD."origin" = 'UNKNOWN')`);
  });

  it('leaves the immutability rule alone', () => {
    expect(migrationSource).not.toContain('ingredients_origin_immutable');
    expect(migrationSource).not.toMatch(/DROP\s+(TRIGGER|FUNCTION)/iu);
  });

  it('re-runs the idempotent backfill and reports counts', () => {
    expect(
      migrationSource.match(/WHERE i\."origin" = 'UNKNOWN'/gu),
    ).toHaveLength(3);
    expect(migrationSource).toContain(
      "RAISE NOTICE 'ingredient origin reclassify (#6010)",
    );
  });
});
