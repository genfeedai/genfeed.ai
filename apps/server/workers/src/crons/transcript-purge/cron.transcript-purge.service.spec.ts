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
    isDeleted: true,
    organizationId,
    threadId: { in: threadIds },
    updatedAt: { lt: CUTOFF },
  };
}

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

const EXPIRED_RUN_WIPE = {
  objective: null,
  steps: [],
  summary: null,
  toolCalls: [],
};

describe('CronTranscriptPurgeService', () => {
  let service: CronTranscriptPurgeService;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    agentMessage: DelegateMocks;
    agentRun: DelegateMocks;
    agentThread: DelegateMocks;
    agentThreadEvent: DelegateMocks;
    agentThreadSnapshot: DelegateMocks;
    threadContextState: DelegateMocks;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
      agentMessage: createDelegate(),
      agentRun: createDelegate(),
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

  it('uses a 30-day retention window', () => {
    expect(TRANSCRIPT_PURGE_RETENTION_DAYS).toBe(30);
    expect(NOW.getTime() - CUTOFF.getTime()).toBe(30 * MS_PER_DAY);
  });

  it('is a no-op when no expired tombstones exist', async () => {
    const totals = await service.purgeExpiredTranscripts(NOW);

    expect(totals).toEqual({
      agentMessages: 0,
      agentRuns: 0,
      agentThreadEvents: 0,
      agentThreadSnapshots: 0,
      agentThreads: 0,
      organizations: 0,
      threadContextStates: 0,
    });
    expect(prisma.agentMessage.updateMany).not.toHaveBeenCalled();
    expect(prisma.agentThread.updateMany).not.toHaveBeenCalled();
  });

  it('purges expired soft-deleted transcript fields per organization', async () => {
    prisma.agentThread.findMany
      .mockResolvedValueOnce([{ organizationId: 'org-1' }])
      .mockResolvedValueOnce([{ id: 'thread-expired-1' }]);
    prisma.agentMessage.updateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.agentThreadEvent.updateMany
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.agentRun.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.agentThreadSnapshot.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.threadContextState.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.agentThread.updateMany.mockResolvedValue({ count: 1 });

    const totals = await service.purgeExpiredTranscripts(NOW);

    expect(totals).toEqual({
      agentMessages: 3,
      agentRuns: 1,
      agentThreadEvents: 3,
      agentThreadSnapshots: 1,
      agentThreads: 1,
      organizations: 1,
      threadContextStates: 1,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.agentMessage.updateMany).toHaveBeenCalledWith({
      data: EXPIRED_MESSAGE_WIPE,
      where: expiredTombstoneWhere('org-1'),
    });
    expect(prisma.agentMessage.updateMany).toHaveBeenCalledWith({
      data: EXPIRED_MESSAGE_WIPE,
      where: expiredThreadWhere('org-1'),
    });
    expect(prisma.agentThreadEvent.updateMany).toHaveBeenCalledWith({
      data: { data: Prisma.DbNull },
      where: expiredTombstoneWhere('org-1'),
    });
    expect(prisma.agentRun.updateMany).toHaveBeenCalledWith({
      data: EXPIRED_RUN_WIPE,
      where: expiredTombstoneWhere('org-1'),
    });
    expect(prisma.agentThreadSnapshot.updateMany).toHaveBeenCalledWith({
      data: { data: {} },
      where: expiredTombstoneWhere('org-1'),
    });
    expect(prisma.threadContextState.updateMany).toHaveBeenCalledWith({
      data: { data: {} },
      where: expiredTombstoneWhere('org-1'),
    });
    expect(prisma.agentThread.updateMany).toHaveBeenCalledWith({
      data: EXPIRED_THREAD_WIPE,
      where: expiredTombstoneWhere('org-1'),
    });
  });

  it('does not match live or recently soft-deleted rows in the purge filter', async () => {
    prisma.agentMessage.findMany.mockResolvedValue([
      { organizationId: 'org-live' },
    ]);

    await service.purgeExpiredTranscripts(NOW);

    const tombstoneCalls = [
      ...prisma.agentMessage.updateMany.mock.calls,
      ...prisma.agentThreadEvent.updateMany.mock.calls,
      ...prisma.agentRun.updateMany.mock.calls,
      ...prisma.agentThreadSnapshot.updateMany.mock.calls,
      ...prisma.threadContextState.updateMany.mock.calls,
      ...prisma.agentThread.updateMany.mock.calls,
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

      expect(isExpiredTombstone).toBe(true);
      expect(where.thread).toBeUndefined();
      expect(where.isDeleted).toBe(true);
    }
  });

  it('keeps the retention cutoff 30 days behind now so in-window tombstones stay intact', async () => {
    const recentDelete = new Date(NOW.getTime() - 10 * MS_PER_DAY);
    expect(recentDelete.getTime()).toBeGreaterThan(CUTOFF.getTime());

    prisma.agentRun.findMany.mockResolvedValue([{ organizationId: 'org-1' }]);

    await service.purgeExpiredTranscripts(NOW);

    const runTombstoneWhere = prisma.agentRun.updateMany.mock.calls[0]?.[0]
      ?.where as { isDeleted: boolean; updatedAt: { lt: Date } };

    expect(runTombstoneWhere.isDeleted).toBe(true);
    expect(runTombstoneWhere.updatedAt.lt.getTime()).toBe(CUTOFF.getTime());
    expect(
      recentDelete.getTime() >= runTombstoneWhere.updatedAt.lt.getTime(),
    ).toBe(true);
  });

  it('scopes every write to organizationId and never widens past the tenant', async () => {
    prisma.agentThreadEvent.findMany.mockResolvedValue([
      { organizationId: 'org-a' },
      { organizationId: 'org-b' },
    ]);
    prisma.agentThread.findMany
      .mockResolvedValueOnce([{ organizationId: 'org-a' }])
      .mockResolvedValueOnce([{ id: 'thread-a' }])
      .mockResolvedValueOnce([{ id: 'thread-b' }]);

    await service.purgeExpiredTranscripts(NOW);

    const writeCalls = [
      ...prisma.agentMessage.updateMany.mock.calls,
      ...prisma.agentThreadEvent.updateMany.mock.calls,
      ...prisma.agentRun.updateMany.mock.calls,
      ...prisma.agentThreadSnapshot.updateMany.mock.calls,
      ...prisma.threadContextState.updateMany.mock.calls,
      ...prisma.agentThread.updateMany.mock.calls,
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
    prisma.agentThread.findMany
      .mockResolvedValueOnce([
        { organizationId: 'org-bad' },
        { organizationId: 'org-ok' },
      ])
      .mockResolvedValueOnce([{ id: 'thread-bad' }])
      .mockResolvedValueOnce([{ id: 'thread-ok' }]);
    prisma.agentMessage.updateMany.mockImplementation(
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
