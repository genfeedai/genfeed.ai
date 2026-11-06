import { randomUUID } from 'node:crypto';
import { AgentStrategyReportsService } from '@api/collections/agent-strategies/services/agent-strategy-reports.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

/**
 * Strategy reports against real Prisma and PostgreSQL: the report type lives in
 * the `data` JSON column, pages come newest first, and only the strategy's live
 * reports in the caller's organization count.
 */
describe.skipIf(!connectionString)(
  'AgentStrategyReportsService (PostgreSQL)',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma) {
        throw new Error('BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL is required');
      }
      return prisma;
    };
    const suffix = randomUUID();
    const userId = `reports-user-${suffix}`;
    const organizationId = `reports-org-${suffix}`;
    const otherOrganizationId = `reports-other-org-${suffix}`;
    const strategyId = `reports-strategy-${suffix}`;
    const service = new AgentStrategyReportsService(
      (prisma ?? {}) as unknown as PrismaService,
      { log: () => undefined } as unknown as LoggerService,
    );

    // Oldest first: d1, w1, d2, w2, d3, then a deleted daily report and one
    // filed under another organization, both newest.
    const reports = [
      ['d1', organizationId, 'daily', false],
      ['w1', organizationId, 'weekly', false],
      ['d2', organizationId, 'daily', false],
      ['w2', organizationId, 'weekly', false],
      ['d3', organizationId, 'daily', false],
      ['deleted', organizationId, 'daily', true],
      ['other-org', otherOrganizationId, 'daily', false],
    ] as const;
    const reportId = (name: string) => `report-${name}-${suffix}`;
    const names = (docs: Array<{ id: string }>) =>
      docs.map((doc) =>
        doc.id.replace(`report-`, '').replace(`-${suffix}`, ''),
      );

    beforeAll(async () => {
      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });
      await db.organization.createMany({
        data: [organizationId, otherOrganizationId].map((id) => ({
          id,
          label: id,
          slug: id,
          userId,
        })),
      });
      await db.agentStrategy.create({
        data: { id: strategyId, organizationId, userId },
      });
      await db.agentStrategyReport.createMany({
        data: reports.map(([name, orgId, reportType, isDeleted], index) => ({
          createdAt: new Date(Date.UTC(2026, 10, 1 + index)),
          data: {
            periodStart: `2026-11-0${1 + index}T00:00:00.000Z`,
            reportType,
          },
          id: reportId(name),
          isDeleted,
          organizationId: orgId,
          strategyId,
        })),
      });
    });

    afterAll(async () => {
      if (!prisma) {
        return;
      }
      await prisma.agentStrategyReport.deleteMany({ where: { strategyId } });
      await prisma.agentStrategy.deleteMany({ where: { id: strategyId } });
      await prisma.organization.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    });

    it.each([
      [
        1,
        undefined,
        ['d3', 'w2'],
        { hasNextPage: true, totalDocs: 5, totalPages: 3 },
      ],
      [
        3,
        undefined,
        ['d1'],
        { hasNextPage: false, totalDocs: 5, totalPages: 3 },
      ],
      [
        1,
        'weekly',
        ['w2', 'w1'],
        { hasNextPage: false, totalDocs: 2, totalPages: 1 },
      ],
      [2, 'daily', ['d1'], { hasNextPage: false, totalDocs: 3, totalPages: 2 }],
    ] as const)(
      'lists page %i of %s reports, newest first',
      async (page, reportType, expected, totals) => {
        const result = await service.listByStrategy(
          strategyId,
          organizationId,
          { limit: 2, page },
          reportType,
        );

        expect(names(result.docs)).toEqual(expected);
        expect(result).toMatchObject({ ...totals, limit: 2, page });
      },
    );

    it('reads the latest report of a type with its period as a date', async () => {
      const latest = await service.getLatest(
        strategyId,
        organizationId,
        'weekly',
      );

      expect(latest).toMatchObject({
        id: reportId('w2'),
        organization: organizationId,
        periodStart: new Date('2026-11-04T00:00:00.000Z'),
        reportType: 'weekly',
        strategy: strategyId,
      });
    });

    it('lists nothing for a strategy asked for from another organization', async () => {
      const result = await service.listByStrategy(
        strategyId,
        `reports-stranger-${suffix}`,
        { limit: 20, page: 1 },
      );

      expect(result.docs).toEqual([]);
      expect(result.totalDocs).toBe(0);
    });

    it('files a report for a strategy without a brand', async () => {
      const created = await service.createReport({
        brandId: null,
        metadata: { visitsAvailable: false },
        organizationId,
        periodEnd: '2026-11-30T00:00:00.000Z',
        periodStart: '2026-11-23T00:00:00.000Z',
        reportType: 'weekly',
        strategyId,
      });

      expect(created).toMatchObject({
        brand: null,
        metadata: { visitsAvailable: false },
        periodStart: new Date('2026-11-23T00:00:00.000Z'),
        reportType: 'weekly',
      });
    });
  },
);
