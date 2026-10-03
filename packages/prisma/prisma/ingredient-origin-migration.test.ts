import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(prismaDir, 'migrations/20261003170000_ingredient_origin/migration.sql'),
  'utf8',
);
const ingredientModel = schemaSource.slice(
  schemaSource.indexOf('model Ingredient {'),
  schemaSource.indexOf('model ExternalVoice {'),
);
const originEnum = schemaSource.slice(
  schemaSource.indexOf('enum IngredientOrigin {'),
  schemaSource.indexOf('enum TransformationCategory {'),
);

describe('ingredient origin migration (#6010)', () => {
  it('declares the four origins the contracts enum mirrors', () => {
    const labels = [...originEnum.matchAll(/^\s{2}([A-Z]+)$/gmu)].map(
      (match) => match[1],
    );

    expect(labels).toEqual(['UPLOADED', 'GENERATED', 'IMPORTED', 'UNKNOWN']);
    expect(migrationSource).toContain(
      `CREATE TYPE "IngredientOrigin" AS ENUM ('UPLOADED', 'GENERATED', 'IMPORTED', 'UNKNOWN')`,
    );
  });

  it('stores origin as a required enum that defaults to UNKNOWN, never to a guess', () => {
    expect(ingredientModel).toMatch(
      /origin\s+IngredientOrigin\s+@default\(UNKNOWN\)/u,
    );
    expect(migrationSource).toContain(
      `ADD COLUMN "origin" "IngredientOrigin" NOT NULL DEFAULT 'UNKNOWN'`,
    );
  });

  it('indexes origin with the tenant and recency keys the Library list sorts on', () => {
    expect(ingredientModel).toContain(
      '@@index([organizationId, origin, isDeleted, createdAt(sort: Desc)], map: "ingredients_org_origin_created_at_idx")',
    );
    expect(migrationSource).toContain(
      'CREATE INDEX "ingredients_org_origin_created_at_idx"\n  ON "ingredients" ("organizationId", "origin", "isDeleted", "createdAt" DESC);',
    );
  });

  it('classifies by the first matching rule: imported, generated, uploaded, unknown', () => {
    const imported = migrationSource.indexOf(`SET "origin" = 'IMPORTED'`);
    const generated = migrationSource.indexOf(`SET "origin" = 'GENERATED'`);
    const uploaded = migrationSource.indexOf(`SET "origin" = 'UPLOADED'`);

    expect(imported).toBeGreaterThan(-1);
    expect(generated).toBeGreaterThan(imported);
    expect(uploaded).toBeGreaterThan(generated);
    // Later rules only ever touch rows an earlier rule left unclassified.
    expect(migrationSource.match(/WHERE "origin" = 'UNKNOWN'/gu)).toHaveLength(
      3,
    );
  });

  it('reads only the columns the product rules name', () => {
    for (const column of [
      '"bookmarkId"',
      '"generationPrompt"',
      '"modelUsed"',
      '"generationSource"',
      '"status" = \'UPLOADED\'',
    ]) {
      expect(migrationSource).toContain(column);
    }
  });

  it('reports a count per outcome', () => {
    expect(migrationSource).toContain(
      "RAISE NOTICE 'ingredient origin backfill (#6010): imported=%, generated=%, uploaded=%, unknown=%'",
    );
  });

  it('makes origin immutable in the database, after the backfill wrote it', () => {
    expect(migrationSource).toContain(
      'BEFORE UPDATE OF "origin" ON "ingredients"',
    );
    expect(migrationSource).toContain(
      'IF NEW."origin" IS DISTINCT FROM OLD."origin" THEN',
    );
    expect(migrationSource.indexOf('CREATE TRIGGER')).toBeGreaterThan(
      migrationSource.indexOf('RAISE NOTICE'),
    );
  });

  it('never rewrites a status or deletes rows', () => {
    expect(migrationSource).not.toMatch(/DELETE\s+FROM/iu);
    expect(migrationSource).not.toMatch(/SET\s+"status"/iu);
  });
});
