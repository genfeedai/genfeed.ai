import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

// Run against a disposable PostgreSQL server:
// INGREDIENT_ORIGIN_TEST_DATABASE_URL=postgresql://localhost/scratch bun run vitest run prisma/ingredient-origin-migration.integration.test.ts
// Everything happens inside a throwaway schema that is dropped at the end.
const databaseUrl = process.env.INGREDIENT_ORIGIN_TEST_DATABASE_URL;
const migration = readFileSync(
  new URL(
    './migrations/20261003180000_ingredient_origin/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

type Origin = 'UPLOADED' | 'GENERATED' | 'IMPORTED' | 'UNKNOWN';

interface LegacyRow {
  bookmarkId?: string;
  expected: Origin;
  generationPrompt?: string;
  generationSource?: string;
  id: string;
  isDeleted?: boolean;
  modelUsed?: string;
  providerData?: Record<string, unknown>;
  sourceActionId?: string;
  status: string;
}

/** One legacy row per classification rule, plus the edges between them. */
const LEGACY_ROWS: readonly LegacyRow[] = [
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
    expected: 'IMPORTED',
    id: 'imported-source-media',
    sourceActionId: 'imported-source-media:v1:abc',
    status: 'PROCESSING',
  },
  {
    expected: 'IMPORTED',
    id: 'imported-source-media-capture',
    providerData: { sourceCaptureIngest: { revision: 1 } },
    status: 'VALIDATED',
  },
  {
    expected: 'IMPORTED',
    id: 'imported-source-record',
    providerData: { importedSource: { provenance: 'imported' } },
    status: 'DRAFT',
  },
  {
    expected: 'IMPORTED',
    generationPrompt: 'receipt present',
    id: 'imported-agent-source',
    sourceActionId: 'agent-source:digest',
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
  {
    expected: 'UNKNOWN',
    id: 'unrelated-provider-data',
    providerData: { somethingElse: true },
    sourceActionId: 'visual-code.other',
    status: 'DRAFT',
  },
];

describe.skipIf(!databaseUrl)(
  'ingredient origin migration on PostgreSQL',
  () => {
    it('backfills legacy rows, classifies rolling-deploy inserts and locks a known origin', async () => {
      const pool = new Pool({ connectionString: databaseUrl, max: 1 });
      const client = await pool.connect();
      const schema = `ingredient_origin_${process.pid}_${Date.now()}`;
      const notices: string[] = [];
      client.on('notice', (notice) => notices.push(notice.message));
      const origin = async (id: string) =>
        (
          await client.query<{ origin: string }>(
            `SELECT "origin"::text AS "origin" FROM "ingredients" WHERE "id"=$1`,
            [id],
          )
        ).rows[0]?.origin;

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
        "generationSource" TEXT,
        "sourceActionId" TEXT,
        "providerData" JSONB
      )`);

        for (const row of LEGACY_ROWS) {
          await client.query(
            `INSERT INTO "ingredients" ("id","isDeleted","status","bookmarkId","generationPrompt","modelUsed","generationSource","sourceActionId","providerData") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              row.id,
              row.isDeleted ?? false,
              row.status,
              row.bookmarkId ?? null,
              row.generationPrompt ?? null,
              row.modelUsed ?? null,
              row.generationSource ?? null,
              row.sourceActionId ?? null,
              row.providerData ? JSON.stringify(row.providerData) : null,
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
        expect(rows).toHaveLength(LEGACY_ROWS.length);
        expect(notices.find((message) => message.includes('#6010'))).toBe(
          'ingredient origin backfill (#6010): imported=6, generated=4, uploaded=2, unknown=3',
        );

        // Rolling deploy: a task still on the old code inserts with the default
        // after the backfill. The insert trigger classifies it by the same rules
        // instead of leaving a stale Unknown that would then be locked.
        await client.query(
          `INSERT INTO "ingredients" ("id") VALUES ('new-bare')`,
        );
        await client.query(
          `INSERT INTO "ingredients" ("id","generationPrompt","status") VALUES ('new-generated','a prompt','PROCESSING')`,
        );
        await client.query(
          `INSERT INTO "ingredients" ("id","status") VALUES ('new-uploaded','UPLOADED')`,
        );
        await client.query(
          `INSERT INTO "ingredients" ("id","sourceActionId","status") VALUES ('new-import','imported-source-media:v1:z','PROCESSING')`,
        );
        await client.query(
          `INSERT INTO "ingredients" ("id","generationPrompt","origin") VALUES ('new-explicit','a prompt','IMPORTED')`,
        );
        expect(await origin('new-bare')).toBe('UNKNOWN');
        expect(await origin('new-generated')).toBe('GENERATED');
        expect(await origin('new-uploaded')).toBe('UPLOADED');
        expect(await origin('new-import')).toBe('IMPORTED');
        // An origin the writer names is never overridden.
        expect(await origin('new-explicit')).toBe('IMPORTED');

        // Exactly one transition is allowed: out of UNKNOWN.
        await client.query(
          `UPDATE "ingredients" SET "origin" = 'GENERATED' WHERE "id" = 'new-bare'`,
        );
        expect(await origin('new-bare')).toBe('GENERATED');
        await expect(
          client.query(
            `UPDATE "ingredients" SET "origin" = 'IMPORTED' WHERE "id" = 'new-bare'`,
          ),
        ).rejects.toMatchObject({ code: '23514' });

        // A known origin never changes, whoever writes it.
        await expect(
          client.query(
            `UPDATE "ingredients" SET "origin" = 'GENERATED' WHERE "id" = 'uploaded'`,
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          client.query(
            `UPDATE "ingredients" SET "origin" = 'UNKNOWN' WHERE "id" = 'uploaded'`,
          ),
        ).rejects.toMatchObject({ code: '23514' });

        // Writing the same value, or any other column, is fine.
        await client.query(
          `UPDATE "ingredients" SET "origin" = 'UPLOADED' WHERE "id" = 'uploaded'`,
        );
        await client.query(
          `UPDATE "ingredients" SET "status" = 'VALIDATED' WHERE "id" = 'uploaded'`,
        );
        expect(await origin('uploaded')).toBe('UPLOADED');

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
