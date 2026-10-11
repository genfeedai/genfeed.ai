import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseWorkflowActor } from '@api/authorization/brand-access/workflow-actor.util';
import {
  resolveScheduleInitiatingActor,
  toScheduleInitiatingActorWrite,
  toWorkflowSchedulePrincipal,
} from '@api/collections/workflows/utils/workflow-schedule-actor.util';
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
      'Schedule actor grandfather proof needs a disposable local database',
    );
  }
}

const migrationSql = readFileSync(
  new URL(
    '../../../../../../../packages/prisma/prisma/migrations/20261011130000_workflow_schedule_actor_grandfather/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

const SCHEDULE = '0 9 * * *';
const TABLES = ['members', 'organizations', 'roles', 'workflows'] as const;
// Every table except `workflows` is only a fixture for the migration's lookups, so its other
// required columns are relaxed. `workflows` keeps its real constraints.
const RELAXED = TABLES.filter((table) => table !== 'workflows');

interface WorkflowSeed {
  brandId?: string | null;
  createdAt?: string;
  defaultRecurringBrandId?: string | null;
  id: string;
  isDeleted?: boolean;
  isScheduleEnabled?: boolean | null;
  metadata?: Record<string, unknown> | null;
  organizationId?: string;
  platformSeedKey?: string | null;
  schedule?: string | null;
  scheduleInitiatingActor?: unknown;
  status?: string;
  userId?: string;
}

interface WorkflowRow {
  id: string;
  isDeleted: boolean;
  isScheduleEnabled: boolean | null;
  scheduleInitiatingActor: unknown;
  updatedAt: Date;
}

const seededMetadata = (
  templateId: string,
  sourceType = 'seeded-template',
) => ({
  sourceTemplateId: templateId,
  sourceType,
});

/** The actor the schedule save path stores for a session user, built by the production code. */
function productionActor(userId: string, organizationId: string): unknown {
  const actor = resolveScheduleInitiatingActor({
    isEnabled: true,
    organizationId,
    principal: toWorkflowSchedulePrincipal({
      id: userId,
      organizationId,
      userId,
    }),
    schedule: SCHEDULE,
  });
  const write = toScheduleInitiatingActorWrite(actor);
  if (typeof write !== 'object' || write === null || !('userId' in write)) {
    throw new Error('Expected a serialized actor');
  }
  return write;
}

describe.skipIf(!connectionString)(
  'workflow schedule actor grandfather migration on PostgreSQL (#6706)',
  () => {
    let pool: Pool;
    let client: PoolClient;
    let schema: string;
    let notices: string[];

    async function insertWorkflow(seed: WorkflowSeed): Promise<void> {
      await client.query(
        `INSERT INTO "workflows"
           ("id","userId","organizationId","currentVersionId","brandId","createdAt","defaultRecurringBrandId",
            "isDeleted","isScheduleEnabled","metadata","platformSeedKey","schedule","scheduleInitiatingActor",
            "status","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6::timestamp,$7,$8,$9,$10::jsonb,$11,$12,$13::jsonb,$14,'2026-01-01')`,
        [
          seed.id,
          seed.userId ?? 'owner-live',
          seed.organizationId ?? 'org-live',
          `version-${seed.id}`,
          seed.brandId ?? null,
          seed.createdAt ?? '2026-01-01T00:00:00Z',
          seed.defaultRecurringBrandId ?? null,
          seed.isDeleted ?? false,
          seed.isScheduleEnabled === undefined ? true : seed.isScheduleEnabled,
          seed.metadata === undefined || seed.metadata === null
            ? null
            : JSON.stringify(seed.metadata),
          seed.platformSeedKey ?? null,
          seed.schedule === undefined ? SCHEDULE : seed.schedule,
          seed.scheduleInitiatingActor === undefined
            ? null
            : JSON.stringify(seed.scheduleInitiatingActor),
          seed.status ?? 'active',
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

    async function workflow(id: string): Promise<WorkflowRow> {
      const { rows } = await client.query<WorkflowRow>(
        `SELECT "id","isDeleted","isScheduleEnabled","scheduleInitiatingActor","updatedAt"
         FROM "workflows" WHERE "id" = $1`,
        [id],
      );
      const row = rows[0];
      if (!row) throw new Error(`Missing workflow ${id}`);
      return row;
    }

    async function snapshot(): Promise<string> {
      const { rows } = await client.query(
        `SELECT "id","isDeleted","isScheduleEnabled","scheduleInitiatingActor","updatedAt"
         FROM "workflows" ORDER BY "id"`,
      );
      return JSON.stringify(rows);
    }

    async function migrate(): Promise<string> {
      notices.length = 0;
      await client.query(migrationSql);
      return (
        notices.find((message) => message.includes('#6706')) ??
        'migration raised no notice'
      );
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString, max: 1 });
      client = await pool.connect();
      schema = `actor_grandfather_${randomUUID().replaceAll('-', '')}`;
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

    describe('rows from the same template', () => {
      // Template instantiation is intentionally not unique when no key is set, so these are a
      // customer's own workflows. The migration never deletes or disables any workflow.
      it('leaves two live rows of one template in one organization untouched', async () => {
        const metadata = seededMetadata('youtube-thumbnail-script');
        for (const [id, createdAt] of [
          ['template-a', '2026-01-01T00:00:00Z'],
          ['template-b', '2026-02-01T00:00:00Z'],
        ]) {
          await insertWorkflow({
            createdAt,
            id,
            isScheduleEnabled: false,
            metadata,
            schedule: null,
          });
        }
        const before = await snapshot();

        await migrate();

        expect(await snapshot()).toBe(before);
        for (const id of ['template-a', 'template-b']) {
          expect((await workflow(id)).isDeleted, id).toBe(false);
        }
      });

      it('keeps every scheduled row of one template live and enabled, binding each to its owner', async () => {
        const metadata = seededMetadata('daily-trends-digest');
        for (const [id, createdAt] of [
          ['sched-c', '2026-03-01T00:00:00Z'],
          ['sched-a', '2026-01-01T00:00:00Z'],
          ['sched-b', '2026-02-01T00:00:00Z'],
        ]) {
          await insertWorkflow({ createdAt, id, metadata });
        }
        await insertWorkflow({
          brandId: 'brand-a',
          id: 'sched-brand',
          metadata,
        });

        await migrate();

        for (const id of ['sched-a', 'sched-b', 'sched-c', 'sched-brand']) {
          const row = await workflow(id);
          expect(row.isDeleted, id).toBe(false);
          expect(row.isScheduleEnabled, id).toBe(true);
          expect(row.scheduleInitiatingActor, id).toEqual(
            productionActor('owner-live', 'org-live'),
          );
        }
      });
    });

    describe('grandfathered actors', () => {
      it('binds a legacy schedule to its active owner as exactly the actor the save path stores', async () => {
        await insertWorkflow({ id: 'legacy' });

        await migrate();

        const { scheduleInitiatingActor } = await workflow('legacy');
        expect(scheduleInitiatingActor).toEqual(
          productionActor('owner-live', 'org-live'),
        );
        expect(scheduleInitiatingActor).toEqual({
          isApiKey: false,
          organizationId: 'org-live',
          scopes: [],
          userId: 'owner-live',
        });
        // The Cloud scheduler's parser accepts it and keeps every field.
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
        await insertWorkflow({
          id: 'other-org-legacy',
          organizationId: 'org-other',
          userId: 'owner-other',
        });

        await migrate();

        expect(
          (await workflow('other-org-legacy')).scheduleInitiatingActor,
        ).toEqual(productionActor('owner-other', 'org-other'));
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
        'leaves a schedule unbound when its owner is %s',
        async (_label, member) => {
          await client.query(`TRUNCATE "members"`);
          await insertMember({ id: 'm-left', userId: 'owner-live', ...member });
          await insertWorkflow({ id: 'orphan' });
          await insertWorkflow({
            id: 'orphan-in-deleted-org',
            organizationId: 'org-deleted',
          });

          await migrate();

          expect((await workflow('orphan')).scheduleInitiatingActor).toBeNull();
          expect((await workflow('orphan')).isScheduleEnabled).toBe(true);
          expect(
            (await workflow('orphan-in-deleted-org')).scheduleInitiatingActor,
          ).toBeNull();
        },
      );

      it('leaves a schedule unbound when its owner has no membership at all', async () => {
        await insertWorkflow({ id: 'stranger', userId: 'someone-else' });

        await migrate();

        expect((await workflow('stranger')).scheduleInitiatingActor).toBeNull();
      });

      it('does not touch a row that already has an actor, whoever it names', async () => {
        const apiKeyActor = {
          apiKeyId: 'key-1',
          isApiKey: true,
          organizationId: 'org-live',
          scopes: ['workflows:write'],
          userId: 'someone-else',
        };
        await insertWorkflow({
          id: 'has-session-actor',
          scheduleInitiatingActor: productionActor('creator-2', 'org-live'),
        });
        await insertWorkflow({
          id: 'has-api-key-actor',
          scheduleInitiatingActor: apiKeyActor,
        });
        const before = await workflow('has-session-actor');
        const beforeKey = await workflow('has-api-key-actor');

        await migrate();

        expect(await workflow('has-session-actor')).toEqual(before);
        expect(await workflow('has-api-key-actor')).toEqual(beforeKey);
        expect(
          (await workflow('has-api-key-actor')).scheduleInitiatingActor,
        ).toEqual(apiKeyActor);
      });

      it('treats a JSON null actor as unbound', async () => {
        await insertWorkflow({ id: 'json-null' });
        await client.query(
          `UPDATE "workflows" SET "scheduleInitiatingActor" = 'null'::jsonb WHERE "id" = 'json-null'`,
        );

        await migrate();

        expect((await workflow('json-null')).scheduleInitiatingActor).toEqual(
          productionActor('owner-live', 'org-live'),
        );
      });

      it('does not mark or bind a platform-marked row', async () => {
        await insertWorkflow({
          id: 'platform',
          metadata: seededMetadata('platform-template'),
          platformSeedKey: 'platform-template',
        });
        const before = await workflow('platform');

        await migrate();

        expect(await workflow('platform')).toEqual(before);
      });

      it.each([
        ['a disabled schedule', { isScheduleEnabled: false }],
        ['a null enabled flag', { isScheduleEnabled: null }],
        ['no schedule', { schedule: null }],
        ['a blank schedule', { schedule: '  ' }],
        ['a deleted workflow', { isDeleted: true }],
        ['a workflow that is not active', { status: 'paused' }],
      ])('does not touch %s', async (_label, overrides) => {
        await insertWorkflow({ id: 'untouched', ...overrides });
        const before = await workflow('untouched');

        await migrate();

        expect(await workflow('untouched')).toEqual(before);
      });

      it('grandfathers a seeded-template row that is not platform-marked', async () => {
        await insertWorkflow({
          id: 'seeded-survivor',
          metadata: seededMetadata('daily-trends-digest'),
        });

        await migrate();

        expect(
          (await workflow('seeded-survivor')).scheduleInitiatingActor,
        ).toEqual(productionActor('owner-live', 'org-live'));
      });
    });

    describe('whole-migration properties', () => {
      it('runs on an empty database', async () => {
        await expect(migrate()).resolves.toBe(
          'workflow schedule actor grandfather (#6706): actors bound=0',
        );
        const { rows } = await client.query('SELECT 1 FROM "workflows"');
        expect(rows).toHaveLength(0);
      });

      it('reports what it changed', async () => {
        const metadata = seededMetadata('daily-trends-digest');
        await insertWorkflow({ id: 'a', metadata });
        await insertWorkflow({
          createdAt: '2026-02-01T00:00:00Z',
          id: 'b',
          metadata,
        });
        await insertWorkflow({ id: 'plain', metadata: null });

        await expect(migrate()).resolves.toBe(
          'workflow schedule actor grandfather (#6706): actors bound=3',
        );
      });

      it('changes nothing on a second run', async () => {
        const metadata = seededMetadata('daily-trends-digest');
        await insertWorkflow({ id: 'a', metadata });
        await insertWorkflow({
          createdAt: '2026-02-01T00:00:00Z',
          id: 'b',
          metadata,
        });
        await insertWorkflow({ id: 'plain', metadata: null });
        await insertWorkflow({ id: 'left', userId: 'gone' });
        await migrate();
        const afterFirst = await snapshot();

        await expect(migrate()).resolves.toBe(
          'workflow schedule actor grandfather (#6706): actors bound=0',
        );
        expect(await snapshot()).toBe(afterFirst);
      });

      it('runs against rows where some already have actors', async () => {
        await insertWorkflow({
          id: 'bound',
          scheduleInitiatingActor: productionActor('owner-live', 'org-live'),
        });
        await insertWorkflow({ id: 'unbound' });

        await expect(migrate()).resolves.toBe(
          'workflow schedule actor grandfather (#6706): actors bound=1',
        );
      });
    });
  },
);
