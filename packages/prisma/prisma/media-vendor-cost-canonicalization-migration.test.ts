import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260827140000_canonicalize_media_vendor_costs/migration.sql',
  ),
  'utf8',
);

describe('media vendor-cost canonicalization migration (#3863)', () => {
  it('soft-deletes later active rows for the same organization and ingredient', () => {
    expect(migrationSource).toContain(
      'PARTITION BY "organizationId", "ingredientId"',
    );
    expect(migrationSource).toContain('AND "isDeleted" = false');
    expect(migrationSource).toContain('SET\n  "isDeleted" = true');
    expect(migrationSource).toContain('AND ranked.row_number > 1');
    expect(migrationSource).not.toMatch(/DELETE FROM/);
  });
});

// Framework-agnostic Prisma integration tests read the CI-provided database
// URL directly because Nest ConfigService is not available in this package.
const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('media vendor-cost canonicalization on PostgreSQL', () => {
  it('counts only the canonical historical media cost in active totals', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schemaName = `media_cost_canonical_${process.pid}_${Date.now()}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
      await client.query(`
        CREATE TABLE "media_vendor_costs" (
          "id" text PRIMARY KEY,
          "organizationId" text NOT NULL,
          "ingredientId" text,
          "idempotencyKey" text,
          "vendorCostMicros" bigint NOT NULL,
          "isDeleted" boolean NOT NULL DEFAULT false,
          "createdAt" timestamp NOT NULL,
          "updatedAt" timestamp NOT NULL
        );

        INSERT INTO "media_vendor_costs" VALUES
          ('cost_canonical', 'org_1', 'ingredient_1', 'media:org_1:ingredient_1', 125000, false, '2026-08-20', '2026-08-20'),
          ('cost_duplicate', 'org_1', 'ingredient_1', NULL, 125000, false, '2026-08-21', '2026-08-21'),
          ('cost_unique', 'org_1', 'ingredient_2', 'media:org_1:ingredient_2', 250000, false, '2026-08-22', '2026-08-22');
      `);

      await client.query(migrationSource);

      const rows = await client.query<{
        id: string;
        isDeleted: boolean;
      }>(`
        SELECT "id", "isDeleted"
        FROM "media_vendor_costs"
        ORDER BY "id"
      `);
      const totals = await client.query<{ total: string }>(`
        SELECT SUM("vendorCostMicros")::text AS "total"
        FROM "media_vendor_costs"
        WHERE "organizationId" = 'org_1'
          AND "isDeleted" = false
      `);

      expect(rows.rows).toEqual([
        { id: 'cost_canonical', isDeleted: false },
        { id: 'cost_duplicate', isDeleted: true },
        { id: 'cost_unique', isDeleted: false },
      ]);
      expect(totals.rows).toEqual([{ total: '375000' }]);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
      await pool.end();
    }
  });
});
