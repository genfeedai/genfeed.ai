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
    'migrations/20260812010000_add_brand_kit_ranking_index/migration.sql',
  ),
  'utf8',
);
const resolverSource = readFileSync(
  join(
    prismaDir,
    '../../../apps/server/api/src/collections/brands/services/brand-kit-assets.service.ts',
  ),
  'utf8',
);

const indexName = 'assets_brand_kit_ranking_idx';

describe('brand-kit Asset ranking index (#2761)', () => {
  it('documents the raw partial index without declaring a redundant full Prisma index', () => {
    expect(schemaSource).toContain(indexName);
    expect(schemaSource).toContain('Prisma cannot represent their WHERE');
    expect(schemaSource).not.toContain(`map: "${indexName}"`);
  });

  it('creates exactly the scoped composite index required by the ranking query', () => {
    expect(migrationSource.match(/CREATE INDEX/g)).toHaveLength(1);
    expect(migrationSource).toContain(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexName}"`,
    );
    expect(migrationSource).toContain(
      'ON "assets" ("parentOrgId", "parentBrandId", "category", "updatedAt" DESC, "id" ASC)',
    );
    expect(migrationSource).toContain(
      'WHERE "isDeleted" = false AND "parentType" = \'BRAND\'::"AssetParent";',
    );
    expect(migrationSource).not.toContain('INCLUDE');
  });

  it('keeps the resolver predicates indexable and its ranking deterministic', () => {
    expect(resolverSource).toContain(
      'asset."parentType" = \'BRAND\'::"AssetParent"',
    );
    expect(resolverSource).toMatch(
      /asset\."category" = ANY\(\$\{rankedCategories\}::"AssetCategory"\[\]\)/,
    );
    expect(resolverSource).not.toMatch(
      /asset\."category"::text = ANY\(\$\{rankedCategories\}/,
    );
    expect(resolverSource).toMatch(
      /PARTITION BY\s+asset\."parentBrandId",\s+asset\."category"/,
    );
    expect(resolverSource).toContain(
      'ORDER BY asset."updatedAt" DESC, asset."id" ASC',
    );
  });
});

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

type ExplainRow = {
  'QUERY PLAN': unknown;
};

describePostgres('brand-kit ranking query plan on PostgreSQL', () => {
  it('uses the scoped partial index for the ranked resolver scan', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schemaName = `brand_kit_ranking_${process.pid}_${Date.now()}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query(`SET search_path TO "${schemaName}", public`);
      await client.query(`
        CREATE TYPE "AssetParent" AS ENUM ('BRAND', 'ORGANIZATION', 'USER');
        CREATE TYPE "AssetCategory" AS ENUM ('LOGO', 'BANNER', 'REFERENCE', 'OTHER');
        CREATE TABLE "assets" (
          "id" text PRIMARY KEY,
          "parentType" "AssetParent" NOT NULL,
          "parentOrgId" text,
          "parentBrandId" text,
          "category" "AssetCategory" NOT NULL,
          "cloudObjectKey" text,
          "displayName" text,
          "mimeType" text,
          "isDeleted" boolean NOT NULL DEFAULT false,
          "updatedAt" timestamp NOT NULL
        );
      `);
      await client.query(migrationSource);
      await client.query('SET enable_seqscan = off');

      const plan = await client.query<ExplainRow>(
        `EXPLAIN (FORMAT JSON, COSTS OFF)
        SELECT
          ranked."id",
          ranked."category",
          ranked."cloudObjectKey",
          ranked."displayName",
          ranked."mimeType",
          ranked."parentBrandId"
        FROM (
          SELECT
            asset."id",
            asset."category"::text AS "category",
            asset."cloudObjectKey",
            asset."displayName",
            asset."mimeType",
            asset."parentBrandId",
            ROW_NUMBER() OVER (
              PARTITION BY asset."parentBrandId", asset."category"
              ORDER BY asset."updatedAt" DESC, asset."id" ASC
            ) AS "roleRank"
          FROM "assets" AS asset
          WHERE asset."isDeleted" = false
            AND asset."parentType" = 'BRAND'::"AssetParent"
            AND asset."parentOrgId" = $1
            AND asset."parentBrandId" = ANY($2::text[])
            AND asset."category" = ANY($3::"AssetCategory"[])
        ) AS ranked
        WHERE ranked."roleRank" <= $4::int
        ORDER BY ranked."parentBrandId" ASC, ranked."roleRank" ASC`,
        ['org-1', ['brand-1', 'brand-2'], ['LOGO', 'BANNER', 'REFERENCE'], 1],
      );

      expect(JSON.stringify(plan.rows[0]?.['QUERY PLAN'])).toContain(indexName);
    } finally {
      await client.query('RESET enable_seqscan');
      await client.query('RESET search_path');
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
      await pool.end();
    }
  });
});
