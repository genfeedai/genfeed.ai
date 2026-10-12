import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');

// Explicit opt-in only: CI provisions this fully migrated, disposable database for the
// *.postgres.spec.ts suites. Never DATABASE_URL, never a shared server. The migration runs
// against scratch copies of the real tables in a throwaway schema, so it cannot touch the
// rows other specs share in the migrated database.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/test/i.test(url.pathname)
  ) {
    throw new Error(
      'Post ingredient positions proof needs a disposable local database',
    );
  }
}

const migrationSql = readFileSync(
  new URL(
    '../../../../../../../packages/prisma/prisma/migrations/20261012200000_post_ingredient_positions/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
// The data step alone, so it can be re-run on a table that already holds the links.
const backfillStep = migrationSql.slice(
  migrationSql.indexOf('INSERT INTO "post_ingredients"'),
);

// Fixture tables for the migration's joins and foreign keys. Their other required columns are
// relaxed; `_post_ingredients` keeps its real shape.
const FIXTURE_TABLES = ['organizations', 'posts', 'ingredients'];

describe.skipIf(!connectionString)(
  'post ingredient positions migration on PostgreSQL (#6740)',
  () => {
    let pool: Pool;
    let client: PoolClient;
    let schema: string;

    async function insertIngredient(
      id: string,
      groupIndex: number | null,
    ): Promise<void> {
      await client.query(
        `INSERT INTO "ingredients" ("id","groupIndex") VALUES ($1,$2)`,
        [id, groupIndex],
      );
    }

    async function insertPost(id: string, organizationId: string) {
      await client.query(
        `INSERT INTO "posts" ("id","organizationId") VALUES ($1,$2)`,
        [id, organizationId],
      );
    }

    async function link(ingredientId: string, postId: string): Promise<void> {
      await client.query(
        `INSERT INTO "_post_ingredients" ("A","B") VALUES ($1,$2)`,
        [ingredientId, postId],
      );
    }

    async function positions(postId: string): Promise<string[]> {
      const { rows } = await client.query<{ ingredientId: string }>(
        `SELECT "ingredientId" FROM "post_ingredients"
         WHERE "postId" = $1 ORDER BY "position"`,
        [postId],
      );
      return rows.map((row) => row.ingredientId);
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString, max: 1 });
      client = await pool.connect();
      schema = `post_ingredient_positions_${randomUUID().replaceAll('-', '')}`;
      await client.query(`CREATE SCHEMA "${schema}"`);
      for (const table of FIXTURE_TABLES) {
        await client.query(
          `CREATE TABLE "${schema}"."${table}" (LIKE "public"."${table}" INCLUDING DEFAULTS INCLUDING INDEXES)`,
        );
        await client.query(
          `DO $relax$
           DECLARE col record;
           BEGIN
             FOR col IN
               SELECT a.attname FROM pg_attribute a
               WHERE a.attrelid = '"${schema}"."${table}"'::regclass
                 AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull AND NOT a.atthasdef
             LOOP
               EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I DROP NOT NULL', '${schema}', '${table}', col.attname);
             END LOOP;
           END
           $relax$`,
        );
      }
      // The implicit many-to-many exactly as production has it before this release.
      await client.query(
        `CREATE TABLE "${schema}"."_post_ingredients" (
           "A" TEXT NOT NULL, "B" TEXT NOT NULL,
           CONSTRAINT "_post_ingredients_AB_pkey" PRIMARY KEY ("A","B"))`,
      );
      // Only the scratch schema is searched, so the migration can reach nothing else.
      await client.query(`SET search_path TO "${schema}"`);
      await client.query(
        `INSERT INTO "organizations" ("id") VALUES ('org-1'),('org-2')`,
      );
    });

    afterAll(async () => {
      if (client) {
        await client.query('SET search_path TO public');
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        client.release();
      }
      await pool?.end();
    });

    it('backfills existing carousels in group index then id order and keeps the old links', async () => {
      // Ids sort against the group order, so id order alone would be wrong.
      await insertIngredient('ing-z', 0);
      await insertIngredient('ing-y', 1);
      await insertIngredient('ing-x', 2);
      await insertIngredient('ing-w', null);
      // Two slides sharing a group index fall back to id order.
      await insertIngredient('ing-b', 5);
      await insertIngredient('ing-a', 5);
      await insertIngredient('ing-solo', null);
      await insertPost('post-carousel', 'org-1');
      await insertPost('post-ties', 'org-2');
      await insertPost('post-single', 'org-1');
      for (const id of ['ing-x', 'ing-w', 'ing-z', 'ing-y']) {
        await link(id, 'post-carousel');
      }
      for (const id of ['ing-b', 'ing-a']) await link(id, 'post-ties');
      await link('ing-solo', 'post-single');

      await client.query(migrationSql);

      expect(await positions('post-carousel')).toEqual([
        'ing-z',
        'ing-y',
        'ing-x',
        'ing-w',
      ]);
      expect(await positions('post-ties')).toEqual(['ing-a', 'ing-b']);
      expect(await positions('post-single')).toEqual(['ing-solo']);

      // Positions are contiguous from zero for each post.
      const { rows } = await client.query<{ positions: number[] }>(
        `SELECT "postId", array_agg("position" ORDER BY "position") AS positions
         FROM "post_ingredients" GROUP BY "postId" ORDER BY "postId"`,
      );
      expect(rows.map((row) => row.positions)).toEqual([
        [0, 1, 2, 3],
        [0],
        [0, 1],
      ]);

      // Each link carries its post's organization.
      const orgs = await client.query<{
        postId: string;
        organizationId: string;
      }>(
        `SELECT DISTINCT "postId","organizationId" FROM "post_ingredients" ORDER BY "postId"`,
      );
      expect(orgs.rows).toEqual([
        { organizationId: 'org-1', postId: 'post-carousel' },
        { organizationId: 'org-1', postId: 'post-single' },
        { organizationId: 'org-2', postId: 'post-ties' },
      ]);

      // Nothing is dropped: the implicit table still holds every original link.
      const old = await client.query<{ count: string }>(
        `SELECT count(*) FROM "_post_ingredients"`,
      );
      expect(old.rows[0]?.count).toBe('7');
    });

    it('is safe to run again and never duplicates a link', async () => {
      const before = await client.query<{ count: string }>(
        `SELECT count(*) FROM "post_ingredients"`,
      );

      await client.query(backfillStep);

      const after = await client.query<{ count: string }>(
        `SELECT count(*) FROM "post_ingredients"`,
      );
      expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
      expect(await positions('post-carousel')).toEqual([
        'ing-z',
        'ing-y',
        'ing-x',
        'ing-w',
      ]);
    });

    it('rejects a media item linked twice to one post', async () => {
      await expect(
        client.query(
          `INSERT INTO "post_ingredients" ("id","postId","ingredientId","organizationId","position")
           VALUES ('dup','post-single','ing-solo','org-1',5)`,
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('removes a post’s links with the post', async () => {
      await client.query(`DELETE FROM "posts" WHERE "id" = 'post-ties'`);

      expect(await positions('post-ties')).toEqual([]);
      expect(await positions('post-carousel')).toHaveLength(4);
    });
  },
);
