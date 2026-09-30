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
    'migrations/20260825120000_credential_multi_account_identity/migration.sql',
  ),
  'utf8',
);

describe('credential multi-account identity migration', () => {
  it('creates a partial unique index on live identified credentials', () => {
    expect(migrationSource).toMatch(
      /CREATE UNIQUE INDEX "credentials_brand_platform_external_key"\nON "credentials" \("brandId", "platform", "externalId"\)\nWHERE "isDeleted" = false AND "externalId" IS NOT NULL;/,
    );
  });

  it('leaves pending credentials unconstrained', () => {
    expect(migrationSource).toContain('"externalId" IS NOT NULL');
    expect(migrationSource).not.toMatch(
      /CREATE UNIQUE INDEX[^;]*\("brandId", "platform"\)\s*;/,
    );
  });

  it('soft-deletes duplicate identities instead of dropping rows', () => {
    expect(migrationSource).toContain('SET "isDeleted" = true');
    expect(migrationSource).toContain(
      'PARTITION BY c."brandId", c."platform", c."externalId"',
    );
    expect(migrationSource).not.toMatch(/DELETE FROM "credentials"/);
  });

  it('indexes account listing and pending reaping', () => {
    expect(migrationSource).toContain(
      '"credentials_brand_platform_connected_idx"',
    );
    expect(migrationSource).toContain('"credentials_pending_reap_idx"');
  });

  it('documents the identity indexes in schema.prisma', () => {
    expect(schemaSource).toContain('credentials_brand_platform_connected_idx');
    expect(schemaSource).toContain(
      '20260825120000_credential_multi_account_identity',
    );
  });
});

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('credential identity index on PostgreSQL', () => {
  it('allows many accounts per platform and one row per identity', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schemaName = `credential_identity_${process.pid}_${Date.now()}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
      await client.query(`
        CREATE TABLE "credentials" (
          "id" text PRIMARY KEY,
          "organizationId" text,
          "brandId" text,
          "userId" text,
          "platform" text NOT NULL,
          "externalId" text,
          "isConnected" boolean NOT NULL DEFAULT false,
          "isDeleted" boolean NOT NULL DEFAULT false,
          "createdAt" timestamp NOT NULL DEFAULT now(),
          "updatedAt" timestamp NOT NULL DEFAULT now()
        );

        INSERT INTO "credentials"
          ("id", "organizationId", "brandId", "userId", "platform", "externalId", "isConnected", "updatedAt")
        VALUES
          ('c_live', 'org_1', 'brand_a', 'user_1', 'TIKTOK', 'tt_1', true, '2026-01-02'),
          ('c_stale_twin', 'org_1', 'brand_a', 'user_1', 'TIKTOK', 'tt_1', true, '2026-01-01'),
          ('c_second_account', 'org_1', 'brand_a', 'user_1', 'TIKTOK', 'tt_2', true, '2026-01-01'),
          ('c_pending_one', 'org_1', 'brand_a', 'user_1', 'TIKTOK', NULL, false, '2026-01-01'),
          ('c_pending_two', 'org_1', 'brand_a', 'user_1', 'TIKTOK', NULL, false, '2026-01-01'),
          ('c_blank', 'org_1', 'brand_a', 'user_1', 'TIKTOK', '  ', false, '2026-01-01');
      `);

      await client.query(migrationSource);

      const survivors = await client.query<{ id: string }>(`
        SELECT "id" FROM "credentials" WHERE "isDeleted" = false ORDER BY "id"
      `);

      expect(survivors.rows.map((row) => row.id)).toEqual([
        'c_blank',
        'c_live',
        'c_pending_one',
        'c_pending_two',
        'c_second_account',
      ]);

      // A second account on the same platform is legal.
      await client.query(`
        INSERT INTO "credentials" ("id", "organizationId", "brandId", "platform", "externalId", "isConnected")
        VALUES ('c_third_account', 'org_1', 'brand_a', 'TIKTOK', 'tt_3', true)
      `);

      // Reconnecting the same provider account is not.
      await client.query('SAVEPOINT before_conflict');
      await expect(
        client.query(`
          INSERT INTO "credentials" ("id", "organizationId", "brandId", "platform", "externalId", "isConnected")
          VALUES ('c_conflict', 'org_1', 'brand_a', 'TIKTOK', 'tt_1', true)
        `),
      ).rejects.toThrow(/credentials_brand_platform_external_key/);
      await client.query('ROLLBACK TO SAVEPOINT before_conflict');

      // A soft-deleted account does not block reconnecting the same identity.
      await client.query(`
        UPDATE "credentials" SET "isDeleted" = true WHERE "id" = 'c_second_account'
      `);
      await client.query(`
        INSERT INTO "credentials" ("id", "organizationId", "brandId", "platform", "externalId", "isConnected")
        VALUES ('c_reconnected', 'org_1', 'brand_a', 'TIKTOK', 'tt_2', true)
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
