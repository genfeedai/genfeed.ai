import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260824120000_persona_handle_brand_unique/migration.sql',
  ),
  'utf8',
);

describe('persona handle brand unique migration (#3440)', () => {
  it('creates a partial unique index on live non-null handles', () => {
    expect(migrationSource).toContain(
      'CREATE UNIQUE INDEX "personas_org_brand_handle_live_key"',
    );
    expect(migrationSource).toMatch(
      /CREATE UNIQUE INDEX "personas_org_brand_handle_live_key"\nON "personas" \("organizationId", "brandId", "handle"\)\nWHERE "handle" IS NOT NULL AND "isDeleted" = false;/,
    );
  });

  it('nulls empty and duplicate live handles instead of failing', () => {
    expect(migrationSource).toContain('SET "handle" = NULL');
    expect(migrationSource).toContain('AND btrim("handle") = \'\'');
    expect(migrationSource).toContain(
      'PARTITION BY p."organizationId", p."brandId", lower(p."handle")',
    );
    expect(migrationSource).not.toMatch(/DELETE FROM "personas"/);
  });

  it('lowercases leftover mixed-case handles', () => {
    expect(migrationSource).toContain('SET "handle" = lower("handle")');
  });

  it('documents the mention suggestion index in schema.prisma', () => {
    expect(schemaSource).toContain('personas_mention_suggest_idx');
    expect(schemaSource).toContain(
      '20260824120000_persona_handle_brand_unique',
    );
  });
});

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('persona handle unique index on PostgreSQL', () => {
  it('rejects duplicate handles in the same brand and allows them across brands', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schemaName = `persona_handle_${process.pid}_${Date.now()}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
      await client.query(`
        CREATE TABLE "personas" (
          "id" text PRIMARY KEY,
          "organizationId" text NOT NULL,
          "brandId" text,
          "handle" text,
          "isDeleted" boolean NOT NULL DEFAULT false,
          "status" text NOT NULL DEFAULT 'ACTIVE',
          "createdAt" timestamp NOT NULL DEFAULT now(),
          "updatedAt" timestamp NOT NULL DEFAULT now()
        );

        INSERT INTO "personas"
          ("id", "organizationId", "brandId", "handle", "createdAt")
        VALUES
          ('p_keep', 'org_1', 'brand_a', 'anna', '2026-01-01'),
          ('p_dup', 'org_1', 'brand_a', 'anna', '2026-01-02'),
          ('p_empty', 'org_1', 'brand_a', '  ', '2026-01-03'),
          ('p_other_brand', 'org_1', 'brand_b', 'anna', '2026-01-01'),
          ('p_deleted', 'org_1', 'brand_a', 'anna', '2026-01-01');
        UPDATE "personas" SET "isDeleted" = true WHERE "id" = 'p_deleted';
      `);

      await client.query(migrationSource);

      const rows = await client.query<{
        handle: string | null;
        id: string;
        isDeleted: boolean;
      }>(`
        SELECT "id", "handle", "isDeleted"
        FROM "personas"
        ORDER BY "id"
      `);

      expect(rows.rows).toEqual([
        { handle: null, id: 'p_dup', isDeleted: false },
        { handle: null, id: 'p_empty', isDeleted: false },
        { handle: 'anna', id: 'p_keep', isDeleted: false },
        { handle: 'anna', id: 'p_other_brand', isDeleted: false },
        { handle: 'anna', id: 'p_deleted', isDeleted: true },
      ]);

      await client.query('SAVEPOINT before_conflict');
      await expect(
        client.query(`
          INSERT INTO "personas" ("id", "organizationId", "brandId", "handle")
          VALUES ('p_conflict', 'org_1', 'brand_a', 'anna')
        `),
      ).rejects.toThrow(/personas_org_brand_handle_live_key/);
      await client.query('ROLLBACK TO SAVEPOINT before_conflict');

      await client.query(`
        INSERT INTO "personas" ("id", "organizationId", "brandId", "handle")
        VALUES ('p_cross', 'org_1', 'brand_c', 'anna')
      `);

      await client.query('COMMIT');
    } finally {
      await client.query('ROLLBACK');
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
      await pool.end();
    }
  });
});
