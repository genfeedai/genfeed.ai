import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

// Run against a disposable PostgreSQL server:
// INGREDIENT_ORIGIN_TEST_DATABASE_URL=postgresql://localhost/scratch bun run vitest run prisma/ingredient-origin-migration.integration.test.ts
// Everything happens inside a throwaway schema that is dropped at the end.
const databaseUrl = process.env.INGREDIENT_ORIGIN_TEST_DATABASE_URL;
const migration = readFileSync(
  new URL(
    './migrations/20261003170000_ingredient_origin/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

/** One legacy row per classification rule, plus the edges between them. */
const LEGACY_ROWS: ReadonlyArray<{
  bookmarkId?: string;
  expected: 'UPLOADED' | 'GENERATED' | 'IMPORTED' | 'UNKNOWN';
  generationPrompt?: string;
  generationSource?: string;
  id: string;
  isDeleted?: boolean;
  modelUsed?: string;
  status: string;
}> = [
  {
    bookmarkId: 'bookmark-1',
    expected: 'IMPORTED',
    id: 'imported',
    status: 'DRAFT',
  },
  {
    bookmarkId: 'bookmark-2',
    expected: 'IMPORTED',
    generationPrompt: 'receipt present',
    id: 'imported-with-receipt',
    modelUsed: 'flux',
    status: 'VALIDATED',
  },
  {
    expected: 'GENERATED',
    generationPrompt: 'a hero shot',
    id: 'generated-prompt',
    status: 'VALIDATED',
  },
  {
    expected: 'GENERATED',
    id: 'generated-model',
    modelUsed: 'flux',
    status: 'GENERATED',
  },
  {
    expected: 'GENERATED',
    generationSource: 'studio',
    id: 'generated-source-uploaded-status',
    status: 'UPLOADED',
  },
  {
    expected: 'GENERATED',
    generationPrompt: 'trashed still counts',
    id: 'generated-trashed',
    isDeleted: true,
    status: 'ARCHIVED',
  },
  { expected: 'UPLOADED', id: 'uploaded', status: 'UPLOADED' },
  {
    bookmarkId: '  ',
    expected: 'UPLOADED',
    generationPrompt: '',
    generationSource: ' ',
    id: 'uploaded-blank-receipt',
    modelUsed: '',
    status: 'UPLOADED',
  },
  { expected: 'UNKNOWN', id: 'unknown-validated', status: 'VALIDATED' },
  { expected: 'UNKNOWN', id: 'unknown-draft', status: 'DRAFT' },
];

describe.skipIf(!databaseUrl)(
  'ingredient origin backfill on PostgreSQL',
  () => {
    it('classifies every legacy row by the product rules, reports counts and makes origin immutable', async () => {
      const pool = new Pool({ connectionString: databaseUrl, max: 1 });
      const client = await pool.connect();
      const schema = `ingredient_origin_${process.pid}_${Date.now()}`;
      const notices: string[] = [];
      client.on('notice', (notice) => notices.push(notice.message));

      try {
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET search_path TO "${schema}"`);
        await client.query(
          `CREATE TYPE "IngredientStatus" AS ENUM ('DRAFT','PROCESSING','UPLOADED','GENERATED','VALIDATED','FAILED','ARCHIVED','REJECTED')`,
        );
        await client.query(`CREATE TABLE "ingredients" (
        "id" TEXT PRIMARY KEY,
        "organizationId" TEXT NOT NULL DEFAULT 'org-1',
        "isDeleted" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "status" "IngredientStatus" NOT NULL DEFAULT 'DRAFT',
        "bookmarkId" TEXT,
        "generationPrompt" TEXT,
        "modelUsed" TEXT,
        "generationSource" TEXT
      )`);

        for (const row of LEGACY_ROWS) {
          await client.query(
            `INSERT INTO "ingredients" ("id","isDeleted","status","bookmarkId","generationPrompt","modelUsed","generationSource") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              row.id,
              row.isDeleted ?? false,
              row.status,
              row.bookmarkId ?? null,
              row.generationPrompt ?? null,
              row.modelUsed ?? null,
              row.generationSource ?? null,
            ],
          );
        }

        await client.query(migration);

        const { rows } = await client.query<{ id: string; origin: string }>(
          `SELECT "id", "origin"::text AS "origin" FROM "ingredients"`,
        );
        const byId = new Map(rows.map((row) => [row.id, row.origin]));
        for (const row of LEGACY_ROWS) {
          expect(byId.get(row.id), row.id).toBe(row.expected);
        }
        // Every row is classified: none is left without an origin.
        expect(rows).toHaveLength(LEGACY_ROWS.length);

        expect(notices.find((message) => message.includes('#6010'))).toBe(
          'ingredient origin backfill (#6010): imported=2, generated=4, uploaded=2, unknown=2',
        );

        // A row created after the migration that nobody classified is visibly
        // Unknown, not silently mislabelled.
        await client.query(
          `INSERT INTO "ingredients" ("id") VALUES ('new-row')`,
        );
        expect(
          (
            await client.query(
              `SELECT "origin"::text AS "origin" FROM "ingredients" WHERE "id"='new-row'`,
            )
          ).rows[0],
        ).toEqual({ origin: 'UNKNOWN' });

        // Immutable: no UPDATE may change it, whoever writes it.
        await expect(
          client.query(
            `UPDATE "ingredients" SET "origin" = 'GENERATED' WHERE "id" = 'uploaded'`,
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          client.query(
            `UPDATE "ingredients" SET "origin" = 'IMPORTED' WHERE "id" = 'unknown-draft'`,
          ),
        ).rejects.toMatchObject({ code: '23514' });

        // Writing the same value, or any other column, is fine.
        await client.query(
          `UPDATE "ingredients" SET "origin" = 'UPLOADED' WHERE "id" = 'uploaded'`,
        );
        await client.query(
          `UPDATE "ingredients" SET "status" = 'VALIDATED' WHERE "id" = 'uploaded'`,
        );
        expect(
          (
            await client.query(
              `SELECT "origin"::text AS "origin", "status"::text AS "status" FROM "ingredients" WHERE "id"='uploaded'`,
            )
          ).rows[0],
        ).toEqual({ origin: 'UPLOADED', status: 'VALIDATED' });

        expect(
          (
            await client.query(
              `SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = 'ingredients_org_origin_created_at_idx'`,
              [schema],
            )
          ).rowCount,
        ).toBe(1);
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        client.release();
        await pool.end();
      }
    });
  },
);
