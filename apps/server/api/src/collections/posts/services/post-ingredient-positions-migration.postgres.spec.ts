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
    '../../../../../../../packages/prisma/prisma/migrations/20261012220000_post_ingredient_positions/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const BRIDGE_MARKER = '-- Rollout bridge (#6740).';
// The data step alone, so it can be re-run on a table that already holds the links.
const backfillStep = migrationSql.slice(
  migrationSql.indexOf('INSERT INTO "post_ingredients"'),
  migrationSql.indexOf(BRIDGE_MARKER),
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

    async function oldLinks(postId: string): Promise<string[]> {
      const { rows } = await client.query<{ A: string }>(
        `SELECT "A" FROM "_post_ingredients" WHERE "B" = $1 ORDER BY "A"`,
        [postId],
      );
      return rows.map((row) => row.A);
    }

    async function newLink(
      id: string,
      postId: string,
      ingredientId: string,
      position: number,
    ): Promise<void> {
      await client.query(
        `INSERT INTO "post_ingredients" ("id","postId","ingredientId","organizationId","position")
         VALUES ($1,$2,$3,'org-1',$4)`,
        [id, postId, ingredientId, position],
      );
    }

    async function positionOf(
      postId: string,
      ingredientId: string,
    ): Promise<{ position: number; organizationId: string } | undefined> {
      const { rows } = await client.query<{
        position: number;
        organizationId: string;
      }>(
        `SELECT "position","organizationId" FROM "post_ingredients"
         WHERE "postId" = $1 AND "ingredientId" = $2`,
        [postId, ingredientId],
      );
      return rows[0];
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
                 AND NOT EXISTS (
                   SELECT 1 FROM pg_index i
                   WHERE i.indrelid = a.attrelid AND i.indisprimary
                     AND a.attnum = ANY (i.indkey))
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

    describe('rollout bridge between the old and new link tables', () => {
      beforeAll(async () => {
        // A trigger-level write, which is where a mirror's own write lands. It lets a test put a
        // pair on one side only.
        await client.query(
          `CREATE TABLE "link_probe" ("ingredientId" TEXT, "postId" TEXT, "side" TEXT)`,
        );
        await client.query(
          `CREATE FUNCTION probe_write() RETURNS TRIGGER LANGUAGE plpgsql AS $probe$
           BEGIN
             IF NEW."side" = 'old' THEN
               INSERT INTO "_post_ingredients" ("A","B") VALUES (NEW."ingredientId", NEW."postId");
             ELSE
               INSERT INTO "post_ingredients" ("id","postId","ingredientId","organizationId","position")
               VALUES ('probe-' || NEW."ingredientId", NEW."postId", NEW."ingredientId", 'org-1', 7);
             END IF;
             RETURN NEW;
           END
           $probe$`,
        );
        await client.query(
          `CREATE TRIGGER link_probe_insert AFTER INSERT ON "link_probe"
           FOR EACH ROW EXECUTE FUNCTION probe_write()`,
        );
      });

      it('adds a link written by an old release at the post’s next position with its organization', async () => {
        await insertIngredient('ing-late-1', null);
        await insertIngredient('ing-late-2', null);
        await insertPost('post-old-writer', 'org-2');

        await link('ing-late-1', 'post-old-writer');
        await link('ing-late-2', 'post-old-writer');
        expect(await positionOf('post-old-writer', 'ing-late-1')).toEqual({
          organizationId: 'org-2',
          position: 0,
        });
        expect(await positionOf('post-old-writer', 'ing-late-2')).toEqual({
          organizationId: 'org-2',
          position: 1,
        });

        // An existing carousel appends after its last slide.
        await insertIngredient('ing-late-3', null);
        await link('ing-late-3', 'post-carousel');
        expect(await positions('post-carousel')).toEqual([
          'ing-z',
          'ing-y',
          'ing-x',
          'ing-w',
          'ing-late-3',
        ]);
        expect(await positionOf('post-carousel', 'ing-late-3')).toEqual({
          organizationId: 'org-1',
          position: 4,
        });
      });

      it('removes a link an old release deleted and keeps the other slides in place', async () => {
        await client.query(
          `DELETE FROM "_post_ingredients" WHERE "A" = 'ing-y' AND "B" = 'post-carousel'`,
        );
        expect(await positions('post-carousel')).toEqual([
          'ing-z',
          'ing-x',
          'ing-w',
          'ing-late-3',
        ]);
        expect(await positionOf('post-carousel', 'ing-x')).toMatchObject({
          position: 2,
        });

        // The next add continues after the highest position, not into the gap.
        await insertIngredient('ing-late-4', null);
        await link('ing-late-4', 'post-carousel');
        expect(await positionOf('post-carousel', 'ing-late-4')).toMatchObject({
          position: 5,
        });
      });

      it('mirrors a link the new release writes into the old table for rollback', async () => {
        await insertIngredient('ing-new-1', null);
        await newLink('new-1', 'post-single', 'ing-new-1', 1);
        expect(await oldLinks('post-single')).toEqual([
          'ing-new-1',
          'ing-solo',
        ]);

        await client.query(
          `DELETE FROM "post_ingredients" WHERE "id" = 'new-1'`,
        );
        expect(await oldLinks('post-single')).toEqual(['ing-solo']);
      });

      it('does not mirror a position change, which the old table cannot express', async () => {
        const before = await oldLinks('post-carousel');
        await client.query(
          `UPDATE "post_ingredients" SET "position" = 9
           WHERE "postId" = 'post-carousel' AND "ingredientId" = 'ing-z'`,
        );
        expect(await oldLinks('post-carousel')).toEqual(before);
        expect(await positionOf('post-carousel', 'ing-z')).toMatchObject({
          position: 9,
        });
      });

      it('settles each write to one row per table instead of echoing it back and forth', async () => {
        await insertIngredient('ing-once', null);
        await link('ing-once', 'post-single');
        const old = await client.query<{ count: string }>(
          `SELECT count(*) FROM "_post_ingredients" WHERE "A" = 'ing-once'`,
        );
        const current = await client.query<{ count: string }>(
          `SELECT count(*) FROM "post_ingredients" WHERE "ingredientId" = 'ing-once'`,
        );
        expect([old.rows[0]?.count, current.rows[0]?.count]).toEqual([
          '1',
          '1',
        ]);
      });

      it('never re-mirrors a write that is itself a mirror, so the directions cannot loop', async () => {
        // A write made from inside another trigger runs one level deeper, exactly where a
        // mirror's own write lands. It must be left alone rather than mirrored again.
        await insertIngredient('ing-nested', null);
        await client.query(
          `INSERT INTO "link_probe" VALUES ('ing-nested','post-single','old')`,
        );
        expect(await oldLinks('post-single')).toContain('ing-nested');
        expect(await positionOf('post-single', 'ing-nested')).toBeUndefined();
        // Keep the later tests free of this deliberate one-sided pair.
        await client.query(
          `DELETE FROM "_post_ingredients" WHERE "A" = 'ing-nested'`,
        );
      });

      it('tolerates a pair that already exists on the other side', async () => {
        await insertIngredient('ing-only-new', null);
        await insertIngredient('ing-only-old', null);
        await client.query(
          `INSERT INTO "link_probe" VALUES ('ing-only-new','post-single','new'),
                                           ('ing-only-old','post-single','old')`,
        );
        expect(await oldLinks('post-single')).not.toContain('ing-only-new');
        expect(await positionOf('post-single', 'ing-only-old')).toBeUndefined();

        // An old-release add of a pair the new table holds keeps the stored position.
        await link('ing-only-new', 'post-single');
        expect(await positionOf('post-single', 'ing-only-new')).toMatchObject({
          position: 7,
        });

        // A new-release add of a pair the old table holds neither fails nor duplicates it.
        await newLink('both', 'post-single', 'ing-only-old', 3);
        const copies = await client.query<{ count: string }>(
          `SELECT count(*) FROM "_post_ingredients" WHERE "A" = 'ing-only-old' AND "B" = 'post-single'`,
        );
        expect(copies.rows[0]?.count).toBe('1');
      });

      it('leaves both tables unchanged when the backfill runs again with the bridge installed', async () => {
        const count = async (table: string) =>
          (
            await client.query<{ count: string }>(
              `SELECT count(*) FROM "${table}"`,
            )
          ).rows[0]?.count;
        const before = [
          await count('_post_ingredients'),
          await count('post_ingredients'),
        ];
        const order = await positions('post-carousel');

        await client.query(backfillStep);

        expect([
          await count('_post_ingredients'),
          await count('post_ingredients'),
        ]).toEqual(before);
        expect(await positions('post-carousel')).toEqual(order);
      });

      it('clears both tables when a post is deleted', async () => {
        await client.query(
          `DELETE FROM "posts" WHERE "id" = 'post-old-writer'`,
        );
        expect(await oldLinks('post-old-writer')).toEqual([]);
        expect(await positions('post-old-writer')).toEqual([]);
      });
    });
  },
);
