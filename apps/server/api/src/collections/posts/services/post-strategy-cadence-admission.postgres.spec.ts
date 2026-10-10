import { randomUUID } from 'node:crypto';
import { assertStrategyCadenceAdmission } from '@api/collections/posts/services/post-strategy-cadence-admission.util';
import { TargetExecutionState } from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
// Share CI's explicitly provisioned verification DB; isolate every fixture in
// its own schema. Never use DATABASE_URL or production configuration.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;
describe.skipIf(!connectionString)(
  'cadence admission PostgreSQL concurrency',
  () => {
    const schema = `cadence_${randomUUID().replaceAll('-', '')}`;
    let pool: Pool;
    let prisma: PrismaClient;
    const due = new Date('2026-10-08T12:00:00Z');
    beforeAll(async () => {
      if (!connectionString)
        throw new Error('Explicit disposable database required');
      const url = new URL(connectionString);
      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        !['/billing_scope_test', '/genfeed_6507_disposable'].includes(
          url.pathname,
        )
      )
        throw new Error('Disposable local cadence database required');
      pool = new Pool({ connectionString });
      await pool.query(`CREATE SCHEMA "${schema}"`);
      await pool.query(
        `CREATE TABLE "${schema}"."agent_strategies" ("id" text PRIMARY KEY, "brandId" text, "organizationId" text, "isDeleted" boolean NOT NULL DEFAULT false, "config" jsonb NOT NULL)`,
      );
      await pool.query(
        `CREATE TABLE "${schema}"."posts" ("id" text PRIMARY KEY, "agentStrategyId" text, "organizationId" text, "isDeleted" boolean NOT NULL DEFAULT false, "parentId" text, "groupId" text, "publishedAt" timestamp(3), "scheduledDate" timestamp(3), "targetExecutionState" text)`,
      );
      url.searchParams.set('options', `-c search_path=${schema}`);
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
      });
    });
    afterAll(async () => {
      await prisma?.$disconnect();
      if (pool) {
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await pool.end();
      }
    });
    async function configure(id: string, ceiling = 1) {
      await pool.query(
        `INSERT INTO "${schema}"."agent_strategies" ("id","brandId","organizationId","config") VALUES ($1,'brand','organization',$2)`,
        [
          id,
          JSON.stringify({
            postsPerWeek: 1,
            publishingCeilingPerWeek: ceiling,
            readyDraftReserve: 3,
            timezone: 'Europe/Malta',
          }),
        ],
      );
    }
    async function schedule(strategy: string, id: string, groupId?: string) {
      return prisma.$transaction(async (tx) => {
        await assertStrategyCadenceAdmission(tx, {
          id,
          agentStrategyId: strategy,
          organizationId: 'organization',
          brandId: 'brand',
          scheduledDate: due,
          targetExecutionState: TargetExecutionState.SCHEDULED,
          groupId,
        });
        await tx.$executeRaw`INSERT INTO "posts" ("id","agentStrategyId","organizationId","groupId","scheduledDate","targetExecutionState") VALUES (${id},${strategy},'organization',${groupId ?? null},${due},${TargetExecutionState.SCHEDULED})`;
      });
    }
    it('admits exactly one concurrent new group at the last slot', async () => {
      const strategy = randomUUID();
      await configure(strategy);
      const results = await Promise.allSettled([
        schedule(strategy, randomUUID()),
        schedule(strategy, randomUUID()),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      expect(
        await pool.query(
          `SELECT "id" FROM "${schema}"."posts" WHERE "agentStrategyId"=$1`,
          [strategy],
        ),
      ).toMatchObject({ rowCount: 1 });
    });
    it('admits fan-out siblings in the same group without another slot', async () => {
      const strategy = randomUUID();
      await configure(strategy);
      const group = randomUUID();
      await Promise.all([
        schedule(strategy, randomUUID(), group),
        schedule(strategy, randomUUID(), group),
      ]);
      await expect(schedule(strategy, randomUUID())).rejects.toThrow(
        'publishing ceiling',
      );
    });
    it('counts delayed in-flight sends in the current week', async () => {
      const strategy = randomUUID();
      await configure(strategy);
      await pool.query(
        `INSERT INTO "${schema}"."posts" ("id","agentStrategyId","organizationId","scheduledDate","targetExecutionState") VALUES ($1,$2,'organization',$3,$4)`,
        [randomUUID(), strategy, new Date(0), TargetExecutionState.PUBLISHING],
      );
      await expect(
        prisma.$transaction((tx) =>
          assertStrategyCadenceAdmission(tx, {
            id: randomUUID(),
            agentStrategyId: strategy,
            organizationId: 'organization',
            brandId: 'brand',
            targetExecutionState: TargetExecutionState.PUBLISHING,
          }),
        ),
      ).rejects.toThrow('publishing ceiling');
    });
    it('serializes admission against a concurrent configuration change', async () => {
      const strategy = randomUUID();
      await configure(strategy, 2);
      await schedule(strategy, randomUUID());
      let release = () => {};
      let acquired = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const locked = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const edit = prisma.$transaction(async (tx) => {
        const key = `agent-strategy-config:${strategy}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
        acquired();
        await gate;
        await tx.$executeRaw`UPDATE "agent_strategies" SET "config"=jsonb_set("config",'{publishingCeilingPerWeek}','1') WHERE "id"=${strategy}`;
      });
      await locked;
      const admission = schedule(strategy, randomUUID());
      const rejected = expect(admission).rejects.toThrow('publishing ceiling');
      release();
      await edit;
      await rejected;
    });
  },
);
