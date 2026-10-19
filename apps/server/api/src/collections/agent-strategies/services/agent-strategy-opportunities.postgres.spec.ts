import { randomUUID } from 'node:crypto';
import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: the disposable, migrated local database CI provisions for the
// *.postgres.spec.ts suites. The table is a scratch copy (same column types) in a throwaway
// schema, so no row of the shared database is touched.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/test/i.test(url.pathname)
  ) {
    throw new Error(
      'Agent strategy opportunity proof needs a disposable local database',
    );
  }
}

const ORG = 'org-1';
const STRATEGY = 'strategy-1';

describe.skipIf(!connectionString)(
  'AgentStrategyOpportunitiesService.listOpenPageByStrategy (PostgreSQL)',
  () => {
    let pool: Pool;
    let prisma: PrismaClient;
    let schema: string;
    let service: AgentStrategyOpportunitiesService;

    async function seed(
      id: string,
      data: Record<string, unknown>,
      overrides: {
        createdAt?: string;
        isDeleted?: boolean;
        organizationId?: string;
        strategyId?: string;
      } = {},
    ): Promise<void> {
      await pool.query(
        `INSERT INTO "${schema}".agent_strategy_opportunities
           (id, "strategyId", "organizationId", data, "isDeleted", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4::jsonb, $5, $6::timestamptz, now())`,
        [
          id,
          overrides.strategyId ?? STRATEGY,
          overrides.organizationId ?? ORG,
          JSON.stringify({ status: 'queued', topic: id, ...data }),
          overrides.isDeleted ?? false,
          overrides.createdAt ?? '2026-01-01T00:00:00Z',
        ],
      );
    }

    beforeEach(async () => {
      schema = `opportunities_${randomUUID().replaceAll('-', '')}`;
      pool = new Pool({ connectionString });
      await pool.query(`CREATE SCHEMA "${schema}"`);
      await pool.query(`CREATE TABLE "${schema}".agent_strategy_opportunities (
        id text PRIMARY KEY, "strategyId" text NOT NULL, "organizationId" text NOT NULL, "brandId" text,
        data jsonb NOT NULL DEFAULT '{}', "isDeleted" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL
      )`);
      prisma = new PrismaClient({
        adapter: new PrismaPg(
          { connectionString, options: `-c search_path="${schema}",public` },
          { schema },
        ),
      });
      service = new AgentStrategyOpportunitiesService(
        prisma as unknown as PrismaService,
        { log: vi.fn() } as unknown as LoggerService,
      );
    });

    afterEach(async () => {
      await prisma.$disconnect();
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      await pool.end();
    });

    it('ranks by priority in the database and pages the ranked set', async () => {
      await seed('low', { priorityScore: 10 });
      await seed('top', { priorityScore: 90 });
      await seed(
        'mid-old',
        { priorityScore: 50 },
        { createdAt: '2026-01-01T00:00:00Z' },
      );
      await seed(
        'mid-new',
        { priorityScore: 50 },
        { createdAt: '2026-02-01T00:00:00Z' },
      );
      await seed('unscored', {});
      await seed('text-score', { priorityScore: 'high' });
      await seed('held', { priorityScore: 70, status: 'held' });

      const first = await service.listOpenPageByStrategy(STRATEGY, ORG, {
        limit: 3,
        page: 1,
      });
      const second = await service.listOpenPageByStrategy(STRATEGY, ORG, {
        limit: 3,
        page: 2,
      });
      const third = await service.listOpenPageByStrategy(STRATEGY, ORG, {
        limit: 3,
        page: 3,
      });

      expect(first.docs.map((doc) => doc.id)).toEqual([
        'top',
        'held',
        'mid-new',
      ]);
      expect(second.docs.map((doc) => doc.id)).toEqual([
        'mid-old',
        'low',
        'text-score',
      ]);
      expect(third.docs.map((doc) => doc.id)).toEqual(['unscored']);
      expect(first).toMatchObject({
        hasNextPage: true,
        limit: 3,
        page: 1,
        totalDocs: 7,
        totalPages: 3,
      });
      expect(third).toMatchObject({
        hasNextPage: false,
        page: 3,
        totalDocs: 7,
      });
      expect(first.docs[0]).toMatchObject({
        id: 'top',
        organization: ORG,
        priorityScore: 90,
        strategy: STRATEGY,
        topic: 'top',
      });
    });

    it('returns only open rows of this strategy, organization and not deleted', async () => {
      await seed('open', { priorityScore: 1 });
      await seed('published', { priorityScore: 99, status: 'published' });
      await seed('expired', { priorityScore: 99, status: 'expired' });
      await seed('deleted', { priorityScore: 99 }, { isDeleted: true });
      await seed(
        'other-org',
        { priorityScore: 99 },
        { organizationId: 'org-2' },
      );
      await seed(
        'other-strategy',
        { priorityScore: 99 },
        { strategyId: 'strategy-2' },
      );

      const page = await service.listOpenPageByStrategy(STRATEGY, ORG, {
        limit: 20,
        page: 1,
      });

      expect(page.docs.map((doc) => doc.id)).toEqual(['open']);
      expect(page.totalDocs).toBe(1);
    });

    it('returns an empty page, with the total, past the last page', async () => {
      await seed('only', { priorityScore: 1 });

      const page = await service.listOpenPageByStrategy(STRATEGY, ORG, {
        limit: 20,
        page: 4,
      });

      expect(page.docs).toEqual([]);
      expect(page).toMatchObject({ page: 4, totalDocs: 1, totalPages: 1 });
    });
  },
);
