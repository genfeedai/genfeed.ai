import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronTranscriptPurgeService } from '@workers/crons/transcript-purge/cron.transcript-purge.service';
import { TRANSCRIPT_PURGE_RETENTION_DAYS } from '@workers/crons/transcript-purge/transcript-purge.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-08-18T12:00:00.000Z');
const CUTOFF = CronTranscriptPurgeService.cutoffFrom(NOW);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type DelegateMocks = {
  findMany: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};

function createDelegate(): DelegateMocks {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
}

function expiredTombstoneWhere(organizationId: string) {
  return {
    isDeleted: true,
    organizationId,
    updatedAt: { lt: CUTOFF },
  };
}

function expiredThreadWhere(
  organizationId: string,
  threadIds: string[] = ['thread-expired-1'],
) {
  return {
    organizationId,
    threadId: { in: threadIds },
  };
}

type PurgeFilter = {
  id?: { gt?: string; in?: string[] };
  isDeleted?: boolean;
  organizationId?: string;
  threadId?: { in: string[] };
  updatedAt?: { lt: Date };
};

const EXPIRED_THREAD_WIPE = {
  config: {},
  systemPrompt: null,
  title: null,
};

const EXPIRED_MESSAGE_WIPE = {
  content: null,
  metadata: Prisma.DbNull,
  toolCalls: Prisma.DbNull,
  toolResults: Prisma.DbNull,
};

describe('CronTranscriptPurgeService', () => {
  let service: CronTranscriptPurgeService;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    agentMessage: DelegateMocks;
    agentThread: DelegateMocks;
    agentThreadEvent: DelegateMocks;
    agentThreadSnapshot: DelegateMocks;
    threadContextState: DelegateMocks;
  };
  let tx: Omit<typeof prisma, '$transaction'>;
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    tx = {
      agentMessage: createDelegate(),
      agentThread: createDelegate(),
      agentThreadEvent: createDelegate(),
      agentThreadSnapshot: createDelegate(),
      threadContextState: createDelegate(),
    };
    prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback(tx),
      ),
      agentMessage: createDelegate(),
      agentThread: createDelegate(),
      agentThreadEvent: createDelegate(),
      agentThreadSnapshot: createDelegate(),
      threadContextState: createDelegate(),
    };
    logger = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronTranscriptPurgeService,
        { provide: LoggerService, useValue: logger },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(CronTranscriptPurgeService);
  });

  function mockPagedTransaction(threadCount: number, failOnPage = 0) {
    const invocationNow = new Date(NOW);
    const older = new Date(CUTOFF.getTime() - 1);
    const eligible = Array.from({ length: threadCount }, (_, index) => ({
      id: `thread-${String(index).padStart(6, '0')}`,
      isDeleted: true,
      organizationId: 'org-1',
      updatedAt: older,
    }));
    const rows = [
      ...eligible,
      {
        id: 'thread-live',
        isDeleted: false,
        organizationId: 'org-1',
        updatedAt: older,
      },
      {
        id: 'thread-recent',
        isDeleted: true,
        organizationId: 'org-1',
        updatedAt: NOW,
      },
      {
        id: 'thread-other',
        isDeleted: true,
        organizationId: 'org-other',
        updatedAt: older,
      },
    ].map((row) => ({ ...row }));
    const children = [
      ...eligible.map((row) => ({
        id: `child-${row.id}`,
        isDeleted: false,
        organizationId: 'org-1',
        threadId: row.id,
        updatedAt: NOW,
      })),
      {
        id: 'independent',
        isDeleted: true,
        organizationId: 'org-1',
        threadId: 'thread-live',
        updatedAt: older,
      },
      ...(eligible[0]
        ? [
            {
              id: 'overlap',
              isDeleted: true,
              organizationId: 'org-1',
              threadId: eligible[0].id,
              updatedAt: older,
            },
          ]
        : []),
      {
        id: 'other-org',
        isDeleted: true,
        organizationId: 'org-other',
        threadId: eligible[0]?.id ?? 'thread-live',
        updatedAt: older,
      },
      {
        id: 'recent-live-parent',
        isDeleted: true,
        organizationId: 'org-1',
        threadId: 'thread-live',
        updatedAt: NOW,
      },
    ];
    const stagedThreadIds: string[] = [];
    const stagedChildIds: string[][] = [[], [], [], []];
    const committed = { childIds: [] as string[][], threadIds: [] as string[] };
    const pages: string[][] = [];
    const independentWrites: number[] = [];
    let activeIds: string[] = [];
    let cursor: string | undefined;
    let reads = 0;

    prisma.agentMessage.findMany.mockResolvedValue([
      { organizationId: 'org-1' },
    ]);
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        const result = await callback(tx);
        committed.threadIds = [...stagedThreadIds];
        committed.childIds = stagedChildIds.map((ids) => [...ids]);
        return result;
      },
    );
    tx.agentThread.findMany.mockImplementation(
      ({
        where,
        orderBy,
        select,
        take,
      }: {
        orderBy: unknown;
        select: unknown;
        take: number;
        where: PurgeFilter;
      }) => {
        expect(independentWrites).toEqual([0, 1, 2, 3]);
        expect({ orderBy, select, take, where }).toEqual({
          orderBy: { id: 'asc' },
          select: { id: true },
          take: 500,
          where: {
            ...expiredTombstoneWhere('org-1'),
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
        });
        reads += 1;
        if (reads === failOnPage) throw new Error('Later batch failed');
        activeIds = rows
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.isDeleted === where.isDeleted &&
              row.updatedAt.getTime() < (where.updatedAt?.lt.getTime() ?? 0) &&
              (!where.id?.gt || row.id > where.id.gt),
          )
          .slice(0, take)
          .map((row) => row.id);
        pages.push([...activeIds]);
        cursor = activeIds.at(-1);
        invocationNow.setTime(NOW.getTime() + 100 * MS_PER_DAY);
        return activeIds.map((id) => ({ id }));
      },
    );
    tx.agentThread.updateMany.mockImplementation(
      ({ data, where }: { data: unknown; where: PurgeFilter }) => {
        expect(data).toEqual(EXPIRED_THREAD_WIPE);
        expect(where).toEqual({
          ...expiredTombstoneWhere('org-1'),
          id: { in: activeIds },
        });
        expect(activeIds.length).toBeGreaterThan(0);
        expect(activeIds.length).toBeLessThanOrEqual(500);
        for (const row of rows) {
          if (
            where.id?.in?.includes(row.id) &&
            row.organizationId === where.organizationId &&
            row.isDeleted === where.isDeleted &&
            row.updatedAt.getTime() < (where.updatedAt?.lt.getTime() ?? 0)
          ) {
            stagedThreadIds.push(row.id);
            row.updatedAt = NOW;
          }
        }
        return { count: activeIds.length };
      },
    );
    const delegates = [
      tx.agentMessage,
      tx.agentThreadEvent,
      tx.agentThreadSnapshot,
      tx.threadContextState,
    ];
    const payloads = [
      EXPIRED_MESSAGE_WIPE,
      { data: Prisma.DbNull },
      { data: {} },
      { data: {} },
    ];
    delegates.forEach((delegate, index) => {
      const childRows = children.map((row) => ({ ...row }));
      delegate.updateMany.mockImplementation(
        ({ data, where }: { data: unknown; where: PurgeFilter }) => {
          expect(data).toEqual(payloads[index]);
          if (where.threadId) {
            expect(where).toEqual(expiredThreadWhere('org-1', activeIds));
            expect(where.threadId.in.length).toBeLessThanOrEqual(500);
          } else {
            expect(where).toEqual(expiredTombstoneWhere('org-1'));
            independentWrites.push(index);
          }
          const matching = childRows.filter(
            (row) =>
              row.organizationId === where.organizationId &&
              (where.threadId
                ? where.threadId.in.includes(row.threadId)
                : row.isDeleted === where.isDeleted &&
                  row.updatedAt.getTime() <
                    (where.updatedAt?.lt.getTime() ?? 0)),
          );
          for (const row of matching) {
            stagedChildIds[index].push(row.id);
            row.updatedAt = NOW;
          }
          return { count: matching.length };
        },
      );
    });
    return {
      committed,
      eligibleIds: eligible.map((row) => row.id),
      invocationNow,
      pages,
      stagedChildIds,
      stagedThreadIds,
    };
  }

  it.each([0, 500, 501, 1001])(
    'bounds %i expired threads inside one atomic transaction',
    async (threadCount) => {
      const state = mockPagedTransaction(threadCount);

      const totals = await service.purgeExpiredTranscripts(state.invocationNow);

      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        maxWait: 10_000,
        timeout: 180_000,
      });
      expect(prisma.agentThread.findMany).toHaveBeenCalledExactlyOnceWith({
        distinct: ['organizationId'],
        select: { organizationId: true },
        where: { isDeleted: true, updatedAt: { lt: CUTOFF } },
      });
      expect(state.pages.map((ids) => ids.length)).toEqual(
        threadCount === 0
          ? [0]
          : threadCount === 500
            ? [500, 0]
            : threadCount === 501
              ? [500, 1]
              : [500, 500, 1],
      );
      expect(state.committed.threadIds).toEqual(state.eligibleIds);
      expect(new Set(state.committed.threadIds).size).toBe(threadCount);
      const childCount = threadCount + (threadCount ? 3 : 1);
      expect(totals).toEqual({
        agentMessages: childCount,
        agentThreadEvents: childCount,
        agentThreadSnapshots: childCount,
        agentThreads: threadCount,
        organizations: 1,
        threadContextStates: childCount,
      });
      for (const ids of state.committed.childIds) {
        expect(ids).toContain('independent');
        expect(ids).not.toContain('other-org');
        expect(ids).not.toContain('recent-live-parent');
        if (threadCount) {
          expect(ids).toContain('child-thread-000000');
          expect(ids.filter((id) => id === 'overlap')).toHaveLength(2);
        }
      }
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(
        'CronTranscriptPurgeService completed',
        expect.objectContaining({
          cutoff: CUTOFF.toISOString(),
          retentionDays: 30,
        }),
      );
    },
  );

  it('rolls back prior pages and publishes no partial totals after a later batch fails', async () => {
    const state = mockPagedTransaction(1001, 2);

    const totals = await service.purgeExpiredTranscripts(state.invocationNow);

    expect(state.stagedThreadIds).toHaveLength(500);
    expect(state.stagedChildIds.every((ids) => ids.length > 500)).toBe(true);
    expect(state.committed).toEqual({ childIds: [], threadIds: [] });
    expect(totals).toEqual({
      agentMessages: 0,
      agentThreadEvents: 0,
      agentThreadSnapshots: 0,
      agentThreads: 0,
      organizations: 1,
      threadContextStates: 0,
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Transcript purge failed for organization',
      expect.objectContaining({
        error: 'Later batch failed',
        organizationId: 'org-1',
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('uses a 30-day retention window', () => {
    expect(TRANSCRIPT_PURGE_RETENTION_DAYS).toBe(30);
    expect(NOW.getTime() - CUTOFF.getTime()).toBe(30 * MS_PER_DAY);
  });

  it('is a no-op when no expired tombstones exist', async () => {
    const totals = await service.purgeExpiredTranscripts(NOW);

    expect(totals).toEqual({
      agentMessages: 0,
      agentThreadEvents: 0,
      agentThreadSnapshots: 0,
      agentThreads: 0,
      organizations: 0,
      threadContextStates: 0,
    });
    expect(tx.agentMessage.updateMany).not.toHaveBeenCalled();
    expect(tx.agentThread.updateMany).not.toHaveBeenCalled();
  });

  it('purges expired soft-deleted transcript fields per organization', async () => {
    prisma.agentThread.findMany.mockResolvedValue([
      { organizationId: 'org-1' },
    ]);
    tx.agentThread.findMany.mockResolvedValueOnce([{ id: 'thread-expired-1' }]);
    tx.agentMessage.updateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });
    tx.agentThreadEvent.updateMany
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 0 });
    tx.agentThreadSnapshot.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    tx.threadContextState.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    tx.agentThread.updateMany.mockResolvedValue({ count: 1 });

    const totals = await service.purgeExpiredTranscripts(NOW);

    expect(totals).toEqual({
      agentMessages: 3,
      agentThreadEvents: 3,
      agentThreadSnapshots: 1,
      agentThreads: 1,
      organizations: 1,
      threadContextStates: 1,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.agentMessage.updateMany).toHaveBeenCalledWith({
      data: EXPIRED_MESSAGE_WIPE,
      where: expiredTombstoneWhere('org-1'),
    });
    expect(tx.agentMessage.updateMany).toHaveBeenCalledWith({
      data: EXPIRED_MESSAGE_WIPE,
      where: expiredThreadWhere('org-1'),
    });
    expect(tx.agentThreadEvent.updateMany).toHaveBeenCalledWith({
      data: { data: Prisma.DbNull },
      where: expiredTombstoneWhere('org-1'),
    });
    expect(tx.agentThreadSnapshot.updateMany).toHaveBeenCalledWith({
      data: { data: {} },
      where: expiredTombstoneWhere('org-1'),
    });
    expect(tx.threadContextState.updateMany).toHaveBeenCalledWith({
      data: { data: {} },
      where: expiredTombstoneWhere('org-1'),
    });
    expect(tx.agentThread.updateMany).toHaveBeenCalledWith({
      data: EXPIRED_THREAD_WIPE,
      where: {
        ...expiredTombstoneWhere('org-1'),
        id: { in: ['thread-expired-1'] },
      },
    });
  });

  it('does not match live or recently soft-deleted rows in the purge filter', async () => {
    prisma.agentMessage.findMany.mockResolvedValue([
      { organizationId: 'org-live' },
    ]);

    await service.purgeExpiredTranscripts(NOW);

    const tombstoneCalls = [
      ...tx.agentMessage.updateMany.mock.calls,
      ...tx.agentThreadEvent.updateMany.mock.calls,
      ...tx.agentThreadSnapshot.updateMany.mock.calls,
      ...tx.threadContextState.updateMany.mock.calls,
      ...tx.agentThread.updateMany.mock.calls,
    ];

    for (const [args] of tombstoneCalls) {
      const where = args.where as {
        isDeleted?: boolean;
        thread?: unknown;
        threadId?: { in: string[] };
        updatedAt?: { lt: Date };
      };

      const isExpiredTombstone =
        where.isDeleted === true &&
        where.updatedAt?.lt.getTime() === CUTOFF.getTime();
      const isExpiredDeletedThread = Array.isArray(where.threadId?.in);

      expect(isExpiredTombstone || isExpiredDeletedThread).toBe(true);
      expect(where.thread).toBeUndefined();
      expect(where.isDeleted).not.toBe(false);
    }
  });

  it('keeps the retention cutoff 30 days behind now so in-window tombstones stay intact', async () => {
    const recentDelete = new Date(NOW.getTime() - 10 * MS_PER_DAY);
    expect(recentDelete.getTime()).toBeGreaterThan(CUTOFF.getTime());

    prisma.agentThreadSnapshot.findMany.mockResolvedValue([
      { organizationId: 'org-1' },
    ]);

    await service.purgeExpiredTranscripts(NOW);

    const snapshotTombstoneWhere = tx.agentThreadSnapshot.updateMany.mock
      .calls[0]?.[0]?.where as { isDeleted: boolean; updatedAt: { lt: Date } };

    expect(snapshotTombstoneWhere.isDeleted).toBe(true);
    expect(snapshotTombstoneWhere.updatedAt.lt.getTime()).toBe(
      CUTOFF.getTime(),
    );
    expect(
      recentDelete.getTime() >= snapshotTombstoneWhere.updatedAt.lt.getTime(),
    ).toBe(true);
  });

  it('scopes every write to organizationId and never widens past the tenant', async () => {
    prisma.agentThreadEvent.findMany.mockResolvedValue([
      { organizationId: 'org-a' },
      { organizationId: 'org-b' },
    ]);
    prisma.agentThread.findMany.mockResolvedValue([
      { organizationId: 'org-a' },
    ]);
    tx.agentThread.findMany
      .mockResolvedValueOnce([{ id: 'thread-a' }])
      .mockResolvedValueOnce([{ id: 'thread-b' }]);

    await service.purgeExpiredTranscripts(NOW);

    const writeCalls = [
      ...tx.agentMessage.updateMany.mock.calls,
      ...tx.agentThreadEvent.updateMany.mock.calls,
      ...tx.agentThreadSnapshot.updateMany.mock.calls,
      ...tx.threadContextState.updateMany.mock.calls,
      ...tx.agentThread.updateMany.mock.calls,
    ];

    expect(writeCalls.length).toBeGreaterThan(0);

    for (const [args] of writeCalls) {
      expect(
        args.where.organizationId === 'org-a' ||
          args.where.organizationId === 'org-b',
      ).toBe(true);
    }
  });

  it('isolates one organization failure and keeps purging the rest', async () => {
    prisma.agentThread.findMany.mockResolvedValue([
      { organizationId: 'org-bad' },
      { organizationId: 'org-ok' },
    ]);
    tx.agentThread.findMany.mockResolvedValueOnce([{ id: 'thread-ok' }]);
    tx.agentMessage.updateMany.mockImplementation(
      ({ where }: { where: { organizationId: string } }) => {
        if (where.organizationId === 'org-bad') {
          return Promise.reject(new Error('db unavailable'));
        }
        return Promise.resolve({ count: 4 });
      },
    );

    const totals = await service.purgeExpiredTranscripts(NOW);

    expect(logger.error).toHaveBeenCalledWith(
      'Transcript purge failed for organization',
      expect.objectContaining({ organizationId: 'org-bad' }),
    );
    expect(totals.organizations).toBe(2);
    expect(totals.agentMessages).toBe(8);
  });
});
