import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

// Run against a disposable PostgreSQL server:
// INGREDIENT_ORIGIN_TEST_DATABASE_URL=postgresql://localhost/scratch bun run vitest run prisma/ingredient-origin-reclassify-migration.integration.test.ts
// Everything happens inside a throwaway schema that is dropped at the end.
const databaseUrl = process.env.INGREDIENT_ORIGIN_TEST_DATABASE_URL;
const read = (folder: string) =>
  readFileSync(
    new URL(`./migrations/${folder}/migration.sql`, import.meta.url),
    'utf8',
  );
const originMigration = read('20261003180000_ingredient_origin');
const reclassifyMigration = read('20261003190000_ingredient_origin_reclassify');

describe.skipIf(!databaseUrl)(
  'ingredient origin reclassify on PostgreSQL',
  () => {
    it('turns rolling-deploy UNKNOWN rows into known origins once they are classifiable', async () => {
      const pool = new Pool({ connectionString: databaseUrl, max: 1 });
      const client = await pool.connect();
      const schema = `ingredient_reclassify_${process.pid}_${Date.now()}`;
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
        "s3Key" TEXT,
        "bookmarkId" TEXT,
        "generationPrompt" TEXT,
        "modelUsed" TEXT,
        "generationSource" TEXT,
        "sourceActionId" TEXT,
        "providerData" JSONB
      )`);
        await client.query(originMigration);

        // Rows an old task wrote after the first migration: PROCESSING, no receipt.
        for (const id of [
          'upload',
          'late-receipt',
          'late-import',
          'never-classifiable',
          'abandoned',
        ]) {
          await client.query(
            `INSERT INTO "ingredients" ("id","status") VALUES ($1,'PROCESSING')`,
            [id],
          );
          expect(await origin(id), id).toBe('UNKNOWN');
        }
        // A row that completed before this migration ran, so no trigger saw it.
        await client.query(
          `INSERT INTO "ingredients" ("id","status") VALUES ('already-completed','PROCESSING')`,
        );
        await client.query(
          `ALTER TABLE "ingredients" DISABLE TRIGGER "ingredients_origin_on_insert"`,
        );
        await client.query(
          `INSERT INTO "ingredients" ("id","status") VALUES ('completed-upload','UPLOADED')`,
        );
        await client.query(
          `ALTER TABLE "ingredients" ENABLE TRIGGER "ingredients_origin_on_insert"`,
        );
        expect(await origin('completed-upload')).toBe('UNKNOWN');

        await client.query(reclassifyMigration);

        // The re-run backfill picked up the already completed row.
        expect(await origin('completed-upload')).toBe('UPLOADED');
        expect(
          notices.find((message) => message.includes('reclassify (#6010)')),
        ).toBe(
          'ingredient origin reclassify (#6010): imported=0, generated=0, uploaded=1, unknown=6',
        );

        // Completion of a direct or presigned upload: only storage fields and
        // status change, and nothing writes `origin`.
        await client.query(
          `UPDATE "ingredients" SET "s3Key"='k', "status"='UPLOADED' WHERE "id"='upload'`,
        );
        expect(await origin('upload')).toBe('UPLOADED');

        // A generation receipt that arrives on update.
        await client.query(
          `UPDATE "ingredients" SET "generationPrompt"='a hero shot', "modelUsed"='flux', "status"='GENERATED' WHERE "id"='late-receipt'`,
        );
        expect(await origin('late-receipt')).toBe('GENERATED');

        // An import link that arrives on update.
        await client.query(
          `UPDATE "ingredients" SET "sourceActionId"='imported-source-media:v1:q' WHERE "id"='late-import'`,
        );
        expect(await origin('late-import')).toBe('IMPORTED');

        // An update that still leaves the row unclassifiable keeps it UNKNOWN
        // and does not fail; a later update can still classify it.
        await client.query(
          `UPDATE "ingredients" SET "s3Key"='k2' WHERE "id"='never-classifiable'`,
        );
        expect(await origin('never-classifiable')).toBe('UNKNOWN');
        await client.query(
          `UPDATE "ingredients" SET "status"='UPLOADED' WHERE "id"='never-classifiable'`,
        );
        expect(await origin('never-classifiable')).toBe('UPLOADED');

        // A known origin is never reclassified and never changes.
        await client.query(
          `UPDATE "ingredients" SET "generationPrompt"='now with a prompt' WHERE "id"='upload'`,
        );
        expect(await origin('upload')).toBe('UPLOADED');
        await expect(
          client.query(
            `UPDATE "ingredients" SET "origin"='GENERATED' WHERE "id"='upload'`,
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          client.query(
            `UPDATE "ingredients" SET "origin"='UNKNOWN' WHERE "id"='late-receipt'`,
          ),
        ).rejects.toMatchObject({ code: '23514' });

        // Idempotent: running the migration again changes nothing and fails nothing.
        const before = await client.query(
          `SELECT "id","origin"::text AS "origin" FROM "ingredients" ORDER BY "id"`,
        );
        notices.length = 0;
        await client.query(
          reclassifyMigration
            .replace(/CREATE FUNCTION/u, 'CREATE OR REPLACE FUNCTION')
            .replace(/CREATE TRIGGER[\s\S]*?;\n\nDO/u, 'DO'),
        );
        const after = await client.query(
          `SELECT "id","origin"::text AS "origin" FROM "ingredients" ORDER BY "id"`,
        );
        expect(after.rows).toEqual(before.rows);
        expect(
          notices.find((message) => message.includes('reclassify (#6010)')),
        ).toBe(
          'ingredient origin reclassify (#6010): imported=0, generated=0, uploaded=0, unknown=2',
        );
        expect(await origin('abandoned')).toBe('UNKNOWN');
        expect(await origin('already-completed')).toBe('UNKNOWN');
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        client.release();
        await pool.end();
      }
    });
  },
);
