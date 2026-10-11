import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseWorkflowActor } from '@api/authorization/brand-access/workflow-actor.util';
import { resolveStrategyScheduleActorWrite } from '@api/collections/agent-strategies/services/agent-strategy-schedule-actor.util';
import { toWorkflowSchedulePrincipal } from '@api/collections/workflows/utils/workflow-schedule-actor.util';
import { Pool, type PoolClient } from 'pg';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));

// Explicit opt-in only: CI provisions this fully migrated, disposable database for the
// *.postgres.spec.ts suites. Never DATABASE_URL, never a shared server. The migration runs
// against scratch copies of the real tables (column types, defaults) in a throwaway schema, so
// it cannot touch the rows other specs share in the migrated database.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/test/i.test(url.pathname)
  ) {
    throw new Error(
      'Strategy schedule actor grandfather proof needs a disposable local database',
    );
  }
}

const migrationSql = readFileSync(
  new URL(
    '../../../../../../../packages/prisma/prisma/migrations/20261011160000_agent_strategy_schedule_actor/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
// The data step alone, so it can be re-run on a table that already has the column.
const grandfatherStep = migrationSql.slice(migrationSql.indexOf('DO $$'));

const TABLES = ['agent_strategies', 'members', 'organizations', 'roles'];
// Every table except `agent_strategies` is only a fixture for the migration's lookups, so its other
// required columns are relaxed. `agent_strategies` keeps its real constraints.
const RELAXED = TABLES.filter((table) => table !== 'agent_strategies');
const NOTICE = 'agent strategy schedule actor grandfather (#6689)';

interface StrategySeed {
  actor?: unknown;
  config?: Record<string, unknown> | null;
  id: string;
  isActive?: boolean;
  isDeleted?: boolean;
  organizationId?: string;
  userId?: string;
}

interface StrategyRow {
  config: unknown;
  id: string;
  isActive: boolean;
  isDeleted: boolean;
  scheduleInitiatingActor: unknown;
  updatedAt: Date;
}

/** The actor the strategy save path stores for a session user, built by the production code. */
function productionActor(userId: string, organizationId: string): unknown {
  const write = resolveStrategyScheduleActorWrite({
    config: {},
    isActive: true,
    organizationId,
    principal: toWorkflowSchedulePrincipal({
      id: userId,
      organizationId,
      userId,
    }),
  });
  if (typeof write !== 'object' || write === null || !('userId' in write)) {
    throw new Error('Expected a serialized actor');
  }
  return write;
}

describe.skipIf(!connectionString)(
  'agent strategy schedule actor grandfather migration on PostgreSQL (#6689)',
  () => {
    let pool: Pool;
    let client: PoolClient;
    let schema: string;
    let notices: string[];

    async function insertStrategy(seed: StrategySeed): Promise<void> {
      await client.query(
        `INSERT INTO "agent_strategies"
           ("id","userId","organizationId","config","isActive","isDeleted","scheduleInitiatingActor","updatedAt")
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,'2026-01-01')`,
        [
          seed.id,
          seed.userId ?? 'owner-live',
          seed.organizationId ?? 'org-live',
          JSON.stringify(seed.config === undefined ? {} : seed.config),
          seed.isActive ?? true,
          seed.isDeleted ?? false,
          seed.actor === undefined ? null : JSON.stringify(seed.actor),
        ],
      );
    }

    async function insertMember(input: {
      id: string;
      isActive?: boolean;
      isDeleted?: boolean;
      organizationId?: string;
      roleId?: string;
      userId: string;
    }): Promise<void> {
      await client.query(
        `INSERT INTO "members" ("id","organizationId","userId","roleId","isActive","isDeleted")
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          input.id,
          input.organizationId ?? 'org-live',
          input.userId,
          input.roleId ?? 'role-user',
          input.isActive ?? true,
          input.isDeleted ?? false,
        ],
      );
    }

    async function strategy(id: string): Promise<StrategyRow> {
      const { rows } = await client.query<StrategyRow>(
        `SELECT "id","config","isActive","isDeleted","scheduleInitiatingActor","updatedAt"
         FROM "agent_strategies" WHERE "id" = $1`,
        [id],
      );
      const row = rows[0];
      if (!row) throw new Error(`Missing strategy ${id}`);
      return row;
    }

    async function snapshot(): Promise<string> {
      const { rows } = await client.query(
        `SELECT "id","config","isActive","isDeleted","scheduleInitiatingActor","updatedAt"
         FROM "agent_strategies" ORDER BY "id"`,
      );
      return JSON.stringify(rows);
    }

    async function migrate(): Promise<string> {
      notices.length = 0;
      await client.query(grandfatherStep);
      return (
        notices.find((message) => message.includes('#6689')) ??
        'migration raised no notice'
      );
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString, max: 1 });
      client = await pool.connect();
      schema = `strategy_actor_${randomUUID().replaceAll('-', '')}`;
      notices = [];
      client.on('notice', (notice) => notices.push(notice.message ?? ''));
      await client.query(`CREATE SCHEMA "${schema}"`);
      for (const table of TABLES) {
        await client.query(
          `CREATE TABLE "${schema}"."${table}" (LIKE "public"."${table}" INCLUDING DEFAULTS INCLUDING GENERATED)`,
        );
      }
      for (const table of RELAXED) {
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
      // Only the scratch schema is searched, so the migration can reach nothing else.
      await client.query(`SET search_path TO "${schema}"`);
    });

    beforeEach(async () => {
      notices.length = 0;
      await client.query(
        `TRUNCATE ${TABLES.map((table) => `"${table}"`).join(', ')}`,
      );
      await client.query(
        `INSERT INTO "organizations" ("id","isDeleted") VALUES ('org-live',false),('org-other',false),('org-deleted',true)`,
      );
      await client.query(
        `INSERT INTO "roles" ("id","key","isDeleted") VALUES ('role-user','user',false),('role-owner','owner',false),('role-gone','user',true)`,
      );
      await insertMember({ id: 'm-owner', userId: 'owner-live' });
    });

    afterAll(async () => {
      if (client) {
        await client.query('SET search_path TO public');
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        client.release();
      }
      await pool?.end();
    });

    describe('the whole migration file', () => {
      it('adds the nullable column and then binds, on a table that lacks the column', async () => {
        // Rebuild the scratch table the way production has it before this release.
        await client.query(
          `ALTER TABLE "agent_strategies" DROP COLUMN IF EXISTS "scheduleInitiatingActor"`,
        );
        // Seed through the columns production had before this release.
        await client.query(
          `INSERT INTO "agent_strategies" ("id","userId","organizationId","isActive","isDeleted","updatedAt")
           VALUES ('legacy','owner-live','org-live',true,false,'2026-01-01')`,
        );
        notices.length = 0;

        await client.query(migrationSql);

        const { rows } = await client.query(
          `SELECT data_type, is_nullable FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'agent_strategies' AND column_name = 'scheduleInitiatingActor'`,
          [schema],
        );
        expect(rows).toEqual([{ data_type: 'jsonb', is_nullable: 'YES' }]);
        expect(notices.find((message) => message.includes('#6689'))).toBe(
          `${NOTICE}: actors bound=1`,
        );
        expect((await strategy('legacy')).scheduleInitiatingActor).toEqual(
          productionActor('owner-live', 'org-live'),
        );
      });
    });

    describe('grandfathered actors', () => {
      it('binds a running strategy to its active owner as exactly the actor the save path stores', async () => {
        await insertStrategy({ id: 'legacy' });

        await migrate();

        const { scheduleInitiatingActor } = await strategy('legacy');
        expect(scheduleInitiatingActor).toEqual(
          productionActor('owner-live', 'org-live'),
        );
        expect(scheduleInitiatingActor).toEqual({
          isApiKey: false,
          organizationId: 'org-live',
          scopes: [],
          userId: 'owner-live',
        });
        // The parser the turns use accepts it and keeps every field...
        expect(parseWorkflowActor(scheduleInitiatingActor, 'org-live')).toEqual(
          {
            isApiKey: false,
            organizationId: 'org-live',
            scopes: [],
            userId: 'owner-live',
          },
        );
        // ...and it is still scoped to its own organization.
        expect(() =>
          parseWorkflowActor(scheduleInitiatingActor, 'org-other'),
        ).toThrow();
      });

      it('binds each owner of a different organization and role to that organization', async () => {
        await insertMember({
          id: 'm-other',
          organizationId: 'org-other',
          roleId: 'role-owner',
          userId: 'owner-other',
        });
        await insertStrategy({
          id: 'other-org-legacy',
          organizationId: 'org-other',
          userId: 'owner-other',
        });

        await migrate();

        expect(
          (await strategy('other-org-legacy')).scheduleInitiatingActor,
        ).toEqual(productionActor('owner-other', 'org-other'));
      });

      it.each([
        ['an enabled flag of true', { isEnabled: true }],
        ['no enabled flag', {}],
        ['a JSON null enabled flag', { isEnabled: null }],
      ])('binds a strategy with %s', async (_label, config) => {
        await insertStrategy({ config, id: 'running' });

        await migrate();

        expect((await strategy('running')).scheduleInitiatingActor).toEqual(
          productionActor('owner-live', 'org-live'),
        );
      });

      it.each([
        ['an inactive member', { isActive: false }],
        ['a deleted member', { isDeleted: true }],
        ['a member whose role was deleted', { roleId: 'role-gone' }],
        [
          'a member of another organization only',
          { organizationId: 'org-other' },
        ],
        [
          'a member of a deleted organization',
          { organizationId: 'org-deleted' },
        ],
      ])(
        'leaves a strategy unbound when its owner is %s',
        async (_label, member) => {
          await client.query(`TRUNCATE "members"`);
          await insertMember({ id: 'm-left', userId: 'owner-live', ...member });
          await insertStrategy({ id: 'orphan' });
          await insertStrategy({
            id: 'orphan-in-deleted-org',
            organizationId: 'org-deleted',
          });

          await migrate();

          expect((await strategy('orphan')).scheduleInitiatingActor).toBeNull();
          expect((await strategy('orphan')).isActive).toBe(true);
          expect(
            (await strategy('orphan-in-deleted-org')).scheduleInitiatingActor,
          ).toBeNull();
        },
      );

      it('leaves a strategy unbound when its owner has no membership at all', async () => {
        await insertStrategy({ id: 'stranger', userId: 'someone-else' });

        await migrate();

        expect((await strategy('stranger')).scheduleInitiatingActor).toBeNull();
      });

      it('does not touch a strategy that already has an actor, whoever it names', async () => {
        const apiKeyActor = {
          apiKeyId: 'key-1',
          isApiKey: true,
          organizationId: 'org-live',
          scopes: ['agents:write'],
          userId: 'someone-else',
        };
        await insertStrategy({
          actor: productionActor('admin-2', 'org-live'),
          id: 'has-session-actor',
        });
        await insertStrategy({ actor: apiKeyActor, id: 'has-api-key-actor' });
        const before = await strategy('has-session-actor');
        const beforeKey = await strategy('has-api-key-actor');

        await migrate();

        expect(await strategy('has-session-actor')).toEqual(before);
        expect(await strategy('has-api-key-actor')).toEqual(beforeKey);
        expect(
          (await strategy('has-api-key-actor')).scheduleInitiatingActor,
        ).toEqual(apiKeyActor);
      });

      it('treats a JSON null actor as unbound', async () => {
        await insertStrategy({ id: 'json-null' });
        await client.query(
          `UPDATE "agent_strategies" SET "scheduleInitiatingActor" = 'null'::jsonb WHERE "id" = 'json-null'`,
        );

        await migrate();

        expect((await strategy('json-null')).scheduleInitiatingActor).toEqual(
          productionActor('owner-live', 'org-live'),
        );
      });

      it.each([
        ['an inactive strategy', { isActive: false }],
        ['a deleted strategy', { isDeleted: true }],
        [
          'a strategy disabled through its config',
          { config: { isEnabled: false } },
        ],
      ])('does not touch %s', async (_label, overrides) => {
        await insertStrategy({ id: 'untouched', ...overrides });
        const before = await strategy('untouched');

        await migrate();

        expect(await strategy('untouched')).toEqual(before);
      });
    });

    describe('whole-migration properties', () => {
      it('runs on an empty database', async () => {
        await expect(migrate()).resolves.toBe(`${NOTICE}: actors bound=0`);
        const { rows } = await client.query('SELECT 1 FROM "agent_strategies"');
        expect(rows).toHaveLength(0);
      });

      it('reports what it changed and never deletes or disables a strategy', async () => {
        await insertStrategy({ id: 'a' });
        await insertStrategy({ id: 'b' });
        await insertStrategy({ id: 'left', userId: 'gone' });
        await insertStrategy({ id: 'off', isActive: false });
        const { rows: before } = await client.query(
          `SELECT "id","isActive","isDeleted","config" FROM "agent_strategies" ORDER BY "id"`,
        );

        await expect(migrate()).resolves.toBe(`${NOTICE}: actors bound=2`);

        const { rows: after } = await client.query(
          `SELECT "id","isActive","isDeleted","config" FROM "agent_strategies" ORDER BY "id"`,
        );
        expect(after).toEqual(before);
      });

      it('changes nothing on a second run', async () => {
        await insertStrategy({ id: 'a' });
        await insertStrategy({ id: 'b' });
        await insertStrategy({ id: 'left', userId: 'gone' });
        await migrate();
        const afterFirst = await snapshot();

        await expect(migrate()).resolves.toBe(`${NOTICE}: actors bound=0`);
        expect(await snapshot()).toBe(afterFirst);
      });

      it('runs against rows where some already have actors', async () => {
        await insertStrategy({
          actor: productionActor('owner-live', 'org-live'),
          id: 'bound',
        });
        await insertStrategy({ id: 'unbound' });

        await expect(migrate()).resolves.toBe(`${NOTICE}: actors bound=1`);
      });
    });
  },
);
