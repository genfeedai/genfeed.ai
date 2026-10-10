import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const migrationSource = readFileSync(
  fileURLToPath(
    new URL(
      './migrations/20261010083000_reconcile_music_catalog_default/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('music catalog default migration on PostgreSQL', () => {
  it.each([false, true])(
    'preserves an unrelated operator default: %s',
    async (hasOperatorDefault) => {
      const pool = new Pool({ connectionString: databaseUrl, max: 1 });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`
        CREATE TEMP TABLE "models" (
          "key" text PRIMARY KEY, "category" text DEFAULT 'MUSIC',
          "organizationId" text, "isDeleted" boolean DEFAULT false,
          "isActive" boolean, "isDefault" boolean,
          "isDiscovered" boolean DEFAULT false, "reviewStatus" text,
          "lifecycle" text DEFAULT 'AVAILABLE', "succeededBy" text,
          "updatedAt" timestamp DEFAULT now()
        ) ON COMMIT DROP;
        CREATE TYPE pg_temp."ModelLifecycle" AS ENUM ('RECOMMENDED', 'AVAILABLE', 'LEGACY', 'RETIRED');
        SET LOCAL search_path TO pg_temp, public;
        INSERT INTO "models" ("key", "isActive", "isDefault") VALUES
          ('meta/musicgen', true, false),
          ('fal-ai/lyria3/pro', false, false),
          ('operator/model', true, false);
      `);
        await client.query(
          'UPDATE "models" SET "isDefault" = true WHERE "key" = $1',
          [hasOperatorDefault ? 'operator/model' : 'meta/musicgen'],
        );
        await client.query(migrationSource);
        const first = await client.query(
          'SELECT "key", "isActive", "isDefault", "lifecycle", "succeededBy" FROM "models" ORDER BY "key"',
        );
        expect(first.rows).toEqual([
          {
            key: 'fal-ai/lyria3/pro',
            isActive: true,
            isDefault: !hasOperatorDefault,
            lifecycle: 'RECOMMENDED',
            succeededBy: null,
          },
          {
            key: 'meta/musicgen',
            isActive: false,
            isDefault: false,
            lifecycle: 'LEGACY',
            succeededBy: 'fal-ai/lyria3/pro',
          },
          {
            key: 'operator/model',
            isActive: true,
            isDefault: hasOperatorDefault,
            lifecycle: 'AVAILABLE',
            succeededBy: null,
          },
        ]);
        await client.query(migrationSource);
        expect(
          (
            await client.query(
              'SELECT "key", "isActive", "isDefault", "lifecycle", "succeededBy" FROM "models" ORDER BY "key"',
            )
          ).rows,
        ).toEqual(first.rows);
        await client.query(
          `UPDATE "models" SET "isActive" = false, "isDefault" = false, "isDiscovered" = true, "reviewStatus" = 'pending' WHERE "key" = 'fal-ai/lyria3/pro'`,
        );
        await client.query(migrationSource);
        expect(
          (
            await client.query(
              `SELECT "isActive" FROM "models" WHERE "key" = 'fal-ai/lyria3/pro'`,
            )
          ).rows,
        ).toEqual([{ isActive: false }]);
        await client.query(
          `UPDATE "models" SET "isActive" = true, "isDefault" = true, "organizationId" = 'tenant' WHERE "key" = 'meta/musicgen'`,
        );
        await client.query(
          `UPDATE "models" SET "isDeleted" = true, "isDiscovered" = false WHERE "key" = 'fal-ai/lyria3/pro'`,
        );
        await client.query(migrationSource);
        expect(
          (
            await client.query(
              `SELECT "isActive", "isDefault" FROM "models" WHERE "key" = 'meta/musicgen'`,
            )
          ).rows,
        ).toEqual([{ isActive: true, isDefault: true }]);
        expect(
          (
            await client.query(
              `SELECT "isActive" FROM "models" WHERE "key" = 'fal-ai/lyria3/pro'`,
            )
          ).rows,
        ).toEqual([{ isActive: false }]);
      } finally {
        await client.query('ROLLBACK');
        client.release();
        await pool.end();
      }
    },
  );
});
