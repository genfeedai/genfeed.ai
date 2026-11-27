import { ResearchScanLimitReachedException } from '@api/helpers/exceptions/research-scan-limit/research-scan-limit.exception';
import { SubscriptionTier } from '@genfeedai/contracts';
import { getResearchScanLimitForTier } from '@genfeedai/pricing';
import { describe, expect, it, vi } from 'vitest';
import { noteResearchRunStarted } from './research-scan.context';
import { ResearchScanService } from './research-scan.service';

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();
  return { ...actual, isSaaS: vi.fn(() => true) };
});

import { isSaaS } from '@genfeedai/config';

const ORG = 'org-1';
const START = new Date('2026-11-27T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type Row = {
  createdAt: Date;
  id: string;
  isDeleted: boolean;
  library: string;
  organizationId: string;
  subjectKey: string | null;
};

type Where = {
  createdAt?: { gt: Date };
  id?: string;
  isDeleted: boolean;
  library?: string;
  organizationId: string;
};

function table() {
  const rows: Row[] = [];
  const matches = (row: Row, where: Where) =>
    row.organizationId === where.organizationId &&
    row.isDeleted === where.isDeleted &&
    (where.library === undefined || row.library === where.library) &&
    (where.id === undefined || row.id === where.id) &&
    (where.createdAt === undefined || row.createdAt > where.createdAt.gt);
  const researchScan = {
    create: async ({ data }: { data: Omit<Row, 'id'> }) => {
      const row = { ...data, id: `scan-${rows.length + 1}` };
      rows.push(row);
      return { id: row.id };
    },
    findMany: async ({ where }: { where: Where }) =>
      rows
        .filter((row) => matches(row, where))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((row) => ({ createdAt: row.createdAt })),
    updateMany: async ({
      data,
      where,
    }: {
      data: { isDeleted: boolean };
      where: Where;
    }) => {
      const found = rows.filter((row) => matches(row, where));
      for (const row of found) row.isDeleted = data.isDeleted;
      return { count: found.length };
    },
  };
  const prisma = {
    $queryRaw: async () => [],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(prisma),
    researchScan,
  };
  return { prisma, rows };
}

function serviceFor(tier: SubscriptionTier, hasPlan: boolean) {
  const { prisma, rows } = table();
  const resolve = vi.fn().mockResolvedValue({
    decision: hasPlan
      ? { isAllowed: true, reason: 'active_paid' }
      : { isAllowed: false, reason: 'research_paid_access_required' },
    tier,
  });
  const service = new ResearchScanService(
    prisma as never,
    { resolve } as never,
    { error: vi.fn(), warn: vi.fn() } as never,
  );
  return { resolve, rows, service };
}

/** A collection that reaches the scraper, as the runner does on its first request. */
const reachesScraper = async () => {
  noteResearchRunStarted(ORG);
  return 'rows';
};

describe('ResearchScanService', () => {
  describe('an organization without a plan', () => {
    it('takes one scan a week and says when the next opens', async () => {
      const { rows, service } = serviceFor(SubscriptionTier.FREE, false);
      await service.runScan(
        { library: 'trends', organizationId: ORG, subjectKey: 'brand-1' },
        reachesScraper,
        START,
      );

      const second = new Date(START.getTime() + 3 * DAY_MS);
      const refusal = await service
        .runScan(
          { library: 'trends', organizationId: ORG },
          reachesScraper,
          second,
        )
        .catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(ResearchScanLimitReachedException);
      expect(refusal).toMatchObject({
        library: 'trends',
        meta: {
          hasPlan: false,
          maxScans: 1,
          nextAvailableAtMs: START.getTime() + 7 * DAY_MS,
          windowMs: 7 * DAY_MS,
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        library: 'trends',
        organizationId: ORG,
        subjectKey: 'brand-1',
      });
    });

    it('scans again once the week is over', async () => {
      const { service } = serviceFor(SubscriptionTier.FREE, false);
      await service.runScan(
        { library: 'ads', organizationId: ORG },
        reachesScraper,
        START,
      );

      await expect(
        service.runScan(
          { library: 'ads', organizationId: ORG },
          reachesScraper,
          new Date(START.getTime() + 7 * DAY_MS + 1),
        ),
      ).resolves.toBe('rows');
    });

    it('counts trends and ads apart', async () => {
      const { service } = serviceFor(SubscriptionTier.FREE, false);
      await service.runScan(
        { library: 'trends', organizationId: ORG },
        reachesScraper,
        START,
      );

      await expect(
        service.runScan(
          { library: 'ads', organizationId: ORG },
          reachesScraper,
          START,
        ),
      ).resolves.toBe('rows');
    });

    it('does not take a scan for a collection that starts on its own', async () => {
      const { rows, service } = serviceFor(SubscriptionTier.FREE, false);
      const run = vi.fn(reachesScraper);

      await expect(
        service.runScan(
          { library: 'trends', organizationId: ORG, requiresPlan: true },
          run,
          START,
        ),
      ).rejects.toMatchObject({ message: 'research_paid_access_required' });

      expect(run).not.toHaveBeenCalled();
      expect(rows).toHaveLength(0);
    });
  });

  describe('a plan', () => {
    it('gives Pro 5 scans in a day and refuses the sixth with the hour the first leaves the window', async () => {
      const { service } = serviceFor(SubscriptionTier.PRO, true);
      for (let scan = 0; scan < 5; scan += 1) {
        await service.runScan(
          { library: 'ads', organizationId: ORG },
          reachesScraper,
          new Date(START.getTime() + scan * HOUR_MS),
        );
      }

      const refusal = await service
        .runScan(
          { library: 'ads', organizationId: ORG },
          reachesScraper,
          new Date(START.getTime() + 6 * HOUR_MS),
        )
        .catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(ResearchScanLimitReachedException);
      expect(refusal).toMatchObject({
        meta: { hasPlan: true, nextAvailableAtMs: START.getTime() + DAY_MS },
      });
    });

    it('gives Scale 25 scans a day', async () => {
      const { rows, service } = serviceFor(SubscriptionTier.SCALE, true);
      for (let scan = 0; scan < 25; scan += 1) {
        await service.runScan(
          { library: 'trends', organizationId: ORG },
          reachesScraper,
          START,
        );
      }

      await expect(
        service.runScan(
          { library: 'trends', organizationId: ORG },
          reachesScraper,
          START,
        ),
      ).rejects.toBeInstanceOf(ResearchScanLimitReachedException);
      expect(rows).toHaveLength(25);
    });

    it('does not limit, or count, the done-for-you tier', async () => {
      const { rows, service } = serviceFor(SubscriptionTier.ENTERPRISE, true);
      for (let scan = 0; scan < 30; scan += 1) {
        await service.runScan(
          { library: 'ads', organizationId: ORG },
          reachesScraper,
          START,
        );
      }

      expect(rows).toHaveLength(0);
    });
  });

  describe('a scan that starts no run', () => {
    it('is given back, so the organization still has it', async () => {
      const { rows, service } = serviceFor(SubscriptionTier.FREE, false);
      await expect(
        service.runScan(
          { library: 'trends', organizationId: ORG },
          async () => {
            throw new Error('the cache answered');
          },
          START,
        ),
      ).rejects.toThrow('the cache answered');

      expect(rows.filter((row) => !row.isDeleted)).toHaveLength(0);
      await expect(
        service.runScan(
          { library: 'trends', organizationId: ORG },
          reachesScraper,
          START,
        ),
      ).resolves.toBe('rows');
    });

    it('stays counted when the run reached the scraper and then failed', async () => {
      const { service } = serviceFor(SubscriptionTier.FREE, false);
      await service
        .runScan(
          { library: 'trends', organizationId: ORG },
          async () => {
            noteResearchRunStarted(ORG);
            throw new Error('the run failed');
          },
          START,
        )
        .catch(() => undefined);

      await expect(
        service.runScan(
          { library: 'trends', organizationId: ORG },
          reachesScraper,
          START,
        ),
      ).rejects.toBeInstanceOf(ResearchScanLimitReachedException);
    });
  });

  describe('reading the status', () => {
    it('reports what is left and when the next scan opens, without taking one', async () => {
      const { rows, service } = serviceFor(SubscriptionTier.PRO, true);
      await service.runScan(
        { library: 'trends', organizationId: ORG },
        reachesScraper,
        START,
      );

      const statuses = await service.getStatuses(
        ORG,
        new Date(START.getTime() + HOUR_MS),
      );

      expect(statuses).toEqual([
        {
          hasPlan: true,
          library: 'trends',
          limit: getResearchScanLimitForTier(SubscriptionTier.PRO),
          nextAvailableAt: null,
          remaining: 4,
          used: 1,
        },
        {
          hasPlan: true,
          library: 'ads',
          limit: getResearchScanLimitForTier(SubscriptionTier.PRO),
          nextAvailableAt: null,
          remaining: 5,
          used: 0,
        },
      ]);
      expect(rows).toHaveLength(1);
    });

    it('names the hour the weekly scan comes back', async () => {
      const { service } = serviceFor(SubscriptionTier.FREE, false);
      await service.runScan(
        { library: 'ads', organizationId: ORG },
        reachesScraper,
        START,
      );

      const [, ads] = await service.getStatuses(ORG, START);

      expect(ads).toMatchObject({
        nextAvailableAt: new Date(START.getTime() + 7 * DAY_MS).toISOString(),
        remaining: 0,
      });
    });
  });

  describe('self-hosted installs and platform collections', () => {
    it('run unlimited and take no scan', async () => {
      vi.mocked(isSaaS).mockReturnValueOnce(false);
      const { rows, service } = serviceFor(SubscriptionTier.FREE, false);

      await expect(
        service.runScan(
          { library: 'trends', organizationId: ORG },
          reachesScraper,
          START,
        ),
      ).resolves.toBe('rows');
      await expect(
        service.runScan(
          { library: 'trends', organizationId: undefined },
          reachesScraper,
          START,
        ),
      ).resolves.toBe('rows');
      expect(rows).toHaveLength(0);
    });
  });

  it('fails closed when the plan cannot be read', async () => {
    const { resolve, rows, service } = serviceFor(SubscriptionTier.FREE, false);
    resolve.mockResolvedValue({
      decision: {
        isAllowed: false,
        reason: 'research_subscription_unverified',
      },
      tier: SubscriptionTier.FREE,
    });
    const run = vi.fn(reachesScraper);

    await expect(
      service.runScan({ library: 'trends', organizationId: ORG }, run, START),
    ).rejects.toMatchObject({ message: 'research_subscription_unverified' });
    expect(run).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });
});
