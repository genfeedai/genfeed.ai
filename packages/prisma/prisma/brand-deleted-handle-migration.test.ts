import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const connectionString = process.env.BRAND_DELETE_SAFETY_TEST_DATABASE_URL;
const migration = readFileSync(
  new URL(
    './migrations/20261021160000_release_deleted_brand_handles/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe.skipIf(!connectionString)(
  'deleted brand handle migration on PostgreSQL',
  () => {
    it('releases existing deleted handles while preserving their rows and live handle uniqueness', async () => {
      const pool = new Pool({ connectionString, max: 1 });
      const client = await pool.connect();
      const schema = `brand_handle_${randomUUID().replaceAll('-', '')}`;
      try {
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET search_path TO "${schema}", public`);
        await client.query(`
        CREATE TABLE "brands" (
          "id" text PRIMARY KEY,
          "organizationId" text NOT NULL,
          "slug" text NOT NULL UNIQUE,
          "isDeleted" boolean NOT NULL DEFAULT false,
          "updatedAt" timestamp NOT NULL DEFAULT now()
        );
        INSERT INTO "brands" ("id", "organizationId", "slug", "isDeleted") VALUES
          ('deleted-one', 'org-one', 'released-one', true),
          ('deleted-two', 'org-two', 'released-two', true),
          ('live', 'org-one', 'keep-live', false);
      `);
        await client.query(migration);
        const { rows } = await client.query(`
        SELECT "id", "organizationId", "slug", "isDeleted", "deletedSlug"
        FROM "brands" ORDER BY "id"
      `);
        expect(rows).toEqual([
          {
            id: 'deleted-one',
            organizationId: 'org-one',
            slug: expect.stringMatching(/^deleted-[0-9a-f-]{36}$/),
            isDeleted: true,
            deletedSlug: 'released-one',
          },
          {
            id: 'deleted-two',
            organizationId: 'org-two',
            slug: expect.stringMatching(/^deleted-[0-9a-f-]{36}$/),
            isDeleted: true,
            deletedSlug: 'released-two',
          },
          {
            id: 'live',
            organizationId: 'org-one',
            slug: 'keep-live',
            isDeleted: false,
            deletedSlug: null,
          },
        ]);
        await client.query(`
        INSERT INTO "brands" ("id", "organizationId", "slug") VALUES
          ('replacement-one', 'org-one', 'released-one'),
          ('replacement-two', 'org-two', 'released-two');
      `);
        await expect(
          client.query(`
        INSERT INTO "brands" ("id", "organizationId", "slug")
        VALUES ('conflict', 'org-two', 'keep-live')
      `),
        ).rejects.toMatchObject({ code: '23505' });
      } finally {
        await client.query('ROLLBACK');
        await client.query('RESET search_path');
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        client.release();
        await pool.end();
      }
    });
  },
);
