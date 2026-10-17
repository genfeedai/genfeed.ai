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
      'Post ingredient position compaction needs a disposable local database',
    );
  }
}

const migrationDir = new URL(
  '../../../../../../../packages/prisma/prisma/migrations/',
  import.meta.url,
);
const appliedSql = readFileSync(
  new URL(
    '20261012220000_post_ingredient_positions/migration.sql',
    migrationDir,
  ),
  'utf8',
);
const repairSql = readFileSync(
  new URL(
    '20261013150000_compact_post_ingredient_positions/migration.sql',
    migrationDir,
  ),
  'utf8',
);

const FIXTURE_TABLES = ['organizations', 'posts', 'ingredients'];

type Slide = { ingredientId: string; position: number };

describe.skipIf(!connectionString)(
  'legacy link deletion compacts carousel positions (#6862)',
  () => {
    let pool: Pool;
    let client: PoolClient;
    let schema: string;
    let gapBeforeRepair: Slide[] = [];

    async function insertIngredient(id: string): Promise<void> {
      await client.query(`INSERT INTO "ingredients" ("id") VALUES ($1)`, [id]);
    }

    async function insertPost(id: string): Promise<void> {
      await client.query(
        `INSERT INTO "posts" ("id","organizationId") VALUES ($1,'org-1')`,
        [id],
      );
    }

    async function link(ingredientId: string, postId: string): Promise<void> {
      await client.query(
        `INSERT INTO "_post_ingredients" ("A","B") VALUES ($1,$2)`,
        [ingredientId, postId],
      );
    }

    async function unlink(ingredientId: string, postId: string): Promise<void> {
      await client.query(
        `DELETE FROM "_post_ingredients" WHERE "A" = $1 AND "B" = $2`,
        [ingredientId, postId],
      );
    }

    async function arrange(
      postId: string,
      ingredientIds: readonly string[],
    ): Promise<void> {
      await insertPost(postId);
      for (const ingredientId of ingredientIds) {
        await insertIngredient(ingredientId);
        await link(ingredientId, postId);
      }
    }

    async function slides(postId: string): Promise<Slide[]> {
      const { rows } = await client.query<Slide>(
        `SELECT "ingredientId", "position" FROM "post_ingredients"
         WHERE "postId" = $1 ORDER BY "position", "id"`,
        [postId],
      );
      return rows;
    }

    async function oldLinks(postId: string): Promise<string[]> {
      const { rows } = await client.query<{ A: string }>(
        `SELECT "A" FROM "_post_ingredients" WHERE "B" = $1 ORDER BY "A"`,
        [postId],
      );
      return rows.map((row) => row.A);
    }

    async function assertMirrored(
      postId: string,
      orderedIds: readonly string[],
    ): Promise<void> {
      const current = await slides(postId);
      expect(current).toEqual(
        orderedIds.map((ingredientId, position) => ({
          ingredientId,
          position,
        })),
      );
      expect(await oldLinks(postId)).toEqual([...orderedIds].sort());
    }

    async function waitForAdvisoryWait(
      holder: PoolClient,
      waiterName: string,
    ): Promise<void> {
      for (let attempt = 0; attempt < 250; attempt += 1) {
        // Match the ungranted lock, not `state = 'active'`: while a parameterized
        // statement blocks, pg_stat_activity can still report the session as idle.
        const { rows } = await holder.query(
          `SELECT 1 FROM pg_locks l
           JOIN pg_stat_activity a ON a.pid = l.pid
           WHERE a.application_name = $1
             AND l.locktype = 'advisory' AND NOT l.granted`,
          [waiterName],
        );
        if (rows.length > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`${waiterName} did not wait on the post position lock`);
    }

    async function withOverlappingWriter(
      postId: string,
      waitingSql: string,
      waitingValues: string[],
      heldSql: string,
      heldValues: string[],
    ): Promise<void> {
      const holder = await pool.connect();
      let waiter: PoolClient | undefined;
      let pending: Promise<unknown> | undefined;
      let isOpen = false;
      try {
        waiter = await pool.connect();
        const waiterName = `carousel-waiter-${postId}`;
        await holder.query(`SET search_path TO "${schema}"`);
        await waiter.query(`SET search_path TO "${schema}"`);
        await waiter.query(`SELECT set_config('application_name', $1, false)`, [
          waiterName,
        ]);
        await waiter.query(`SELECT set_config('lock_timeout', '15s', false)`);
        await holder.query('BEGIN');
        isOpen = true;
        await holder.query(
          `SELECT pg_advisory_xact_lock(hashtext('post_ingredients:' || $1))`,
          [postId],
        );
        pending = waiter.query(waitingSql, waitingValues);
        await waitForAdvisoryWait(holder, waiterName);
        await holder.query(heldSql, heldValues);
        await holder.query('COMMIT');
        isOpen = false;
        await pending;
      } finally {
        if (isOpen) await holder.query('ROLLBACK').catch(() => undefined);
        await pending?.catch(() => undefined);
        waiter?.release();
        holder.release();
      }
    }

    beforeAll(async () => {
      if (!connectionString) {
        throw new Error(
          'Post ingredient position compaction needs a disposable local database',
        );
      }
      pool = new Pool({ connectionString, max: 3 });
      client = await pool.connect();
      schema = `post_ingredient_compact_${randomUUID().replaceAll('-', '')}`;
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
      await client.query(
        `CREATE TABLE "${schema}"."_post_ingredients" (
           "A" TEXT NOT NULL, "B" TEXT NOT NULL,
           CONSTRAINT "_post_ingredients_AB_pkey" PRIMARY KEY ("A","B"))`,
      );
      await client.query(`SET search_path TO "${schema}"`);
      await client.query(`INSERT INTO "organizations" ("id") VALUES ('org-1')`);
      await client.query(appliedSql);
      await arrange('post-gap', ['gap-a', 'gap-b', 'gap-c']);
      await unlink('gap-b', 'post-gap');
      gapBeforeRepair = await slides('post-gap');
      await client.query(repairSql);
    });

    afterAll(async () => {
      if (client) {
        await client.query('SET search_path TO public');
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        client.release();
      }
      await pool?.end();
    });

    it('closes a gap a legacy delete left under the applied bridge', async () => {
      expect(gapBeforeRepair).toEqual([
        { ingredientId: 'gap-a', position: 0 },
        { ingredientId: 'gap-c', position: 2 },
      ]);
      await assertMirrored('post-gap', ['gap-a', 'gap-c']);
    });

    it('leaves the survivors at 0,1 when the first slide is deleted', async () => {
      await arrange('post-first', ['first-a', 'first-b', 'first-c']);

      await unlink('first-a', 'post-first');

      await assertMirrored('post-first', ['first-b', 'first-c']);
    });

    it('leaves the survivors at 0,1 when the middle slide is deleted', async () => {
      await arrange('post-middle', ['middle-a', 'middle-b', 'middle-c']);

      await unlink('middle-b', 'post-middle');

      await assertMirrored('post-middle', ['middle-a', 'middle-c']);
      await insertIngredient('middle-d');
      await link('middle-d', 'post-middle');
      await assertMirrored('post-middle', ['middle-a', 'middle-c', 'middle-d']);
    });

    it('leaves the survivors at 0,1 when the last slide is deleted', async () => {
      await arrange('post-last', ['last-a', 'last-b', 'last-c']);

      await unlink('last-c', 'post-last');

      await assertMirrored('post-last', ['last-a', 'last-b']);
    });

    it('closes a hole below the removed slide without changing order', async () => {
      await arrange('post-hole', ['hole-a', 'hole-b', 'hole-c']);
      await client.query(
        `UPDATE "post_ingredients" SET "position" = 5
         WHERE "postId" = 'post-hole' AND "ingredientId" = 'hole-c'`,
      );

      await unlink('hole-a', 'post-hole');

      await assertMirrored('post-hole', ['hole-b', 'hole-c']);
    });

    it('serializes a legacy add behind a legacy delete without losing either link', async () => {
      await arrange('post-race-add', ['race-a', 'race-b', 'race-c']);
      await insertIngredient('race-d');

      await withOverlappingWriter(
        'post-race-add',
        `INSERT INTO "_post_ingredients" ("A","B") VALUES ($1,$2)`,
        ['race-d', 'post-race-add'],
        `DELETE FROM "_post_ingredients" WHERE "A" = $1 AND "B" = $2`,
        ['race-b', 'post-race-add'],
      );

      await assertMirrored('post-race-add', ['race-a', 'race-c', 'race-d']);
    }, 20000);

    it('serializes two legacy deletes and keeps the remaining slides contiguous', async () => {
      await arrange('post-race-del', ['del-a', 'del-b', 'del-c', 'del-d']);

      await withOverlappingWriter(
        'post-race-del',
        `DELETE FROM "_post_ingredients" WHERE "A" = $1 AND "B" = $2`,
        ['del-d', 'post-race-del'],
        `DELETE FROM "_post_ingredients" WHERE "A" = $1 AND "B" = $2`,
        ['del-b', 'post-race-del'],
      );

      await assertMirrored('post-race-del', ['del-a', 'del-c']);
    }, 20000);

    it('keeps rollback mirroring and does not renumber a new-table delete', async () => {
      await arrange('post-rollback', ['rollback-keep']);
      await insertIngredient('rollback-new');
      await client.query(
        `INSERT INTO "post_ingredients"
           ("id","postId","ingredientId","organizationId","position")
         VALUES ('rollback-new','post-rollback','rollback-new','org-1',1)`,
      );
      expect(await oldLinks('post-rollback')).toEqual([
        'rollback-keep',
        'rollback-new',
      ]);

      await client.query(
        `UPDATE "post_ingredients" SET "position" = 4
         WHERE "postId" = 'post-rollback' AND "ingredientId" = 'rollback-keep'`,
      );
      expect(await oldLinks('post-rollback')).toEqual([
        'rollback-keep',
        'rollback-new',
      ]);
      expect(await slides('post-rollback')).toEqual([
        { ingredientId: 'rollback-new', position: 1 },
        { ingredientId: 'rollback-keep', position: 4 },
      ]);

      await client.query(
        `DELETE FROM "post_ingredients" WHERE "id" = 'rollback-new'`,
      );
      expect(await oldLinks('post-rollback')).toEqual(['rollback-keep']);
      expect(await slides('post-rollback')).toEqual([
        { ingredientId: 'rollback-keep', position: 4 },
      ]);
    });

    it('is safe to run again and leaves a compacted carousel unchanged', async () => {
      await arrange('post-again', ['again-a', 'again-b']);
      const before = await slides('post-again');

      await client.query(repairSql);

      expect(await slides('post-again')).toEqual(before);
      await assertMirrored('post-again', ['again-a', 'again-b']);
    });
  },
);
