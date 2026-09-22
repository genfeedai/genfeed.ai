import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronOAuthClientCleanupService } from '@workers/crons/oauth-client-cleanup/cron.oauth-client-cleanup.service';
import {
  OAUTH_CLIENT_CLEANUP_BATCH_SIZE,
  OAUTH_CLIENT_CLEANUP_RETENTION_DAYS,
} from '@workers/crons/oauth-client-cleanup/oauth-client-cleanup.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-09-22T12:00:00.000Z');
const CUTOFF = CronOAuthClientCleanupService.cutoffFrom(NOW);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const ABANDONED_WHERE = {
  authCodes: { none: {} },
  createdAt: { lt: CUTOFF },
  refreshTokens: { none: {} },
};

function ids(count: number, prefix = 'client'): Array<{ id: string }> {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
  }));
}

describe('CronOAuthClientCleanupService', () => {
  let service: CronOAuthClientCleanupService;
  let prisma: {
    oAuthClient: {
      deleteMany: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let logger: { log: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      oAuthClient: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    logger = { log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronOAuthClientCleanupService,
        { provide: LoggerService, useValue: logger },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(CronOAuthClientCleanupService);
  });

  it('uses a 7-day retention window', () => {
    expect(OAUTH_CLIENT_CLEANUP_RETENTION_DAYS).toBe(7);
    expect(NOW.getTime() - CUTOFF.getTime()).toBe(7 * MS_PER_DAY);
  });

  it('is a no-op when no abandoned clients exist', async () => {
    const deleted = await service.deleteAbandonedClients(NOW);

    expect(deleted).toBe(0);
    expect(prisma.oAuthClient.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      take: OAUTH_CLIENT_CLEANUP_BATCH_SIZE,
      where: ABANDONED_WHERE,
    });
    expect(prisma.oAuthClient.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes only old clients without refresh tokens or authorization codes', async () => {
    prisma.oAuthClient.findMany.mockResolvedValueOnce([
      { id: 'client-a' },
      { id: 'client-b' },
    ]);
    prisma.oAuthClient.deleteMany.mockResolvedValueOnce({ count: 2 });

    const deleted = await service.deleteAbandonedClients(NOW);

    expect(deleted).toBe(2);
    expect(prisma.oAuthClient.deleteMany).toHaveBeenCalledOnce();
    expect(prisma.oAuthClient.deleteMany).toHaveBeenCalledWith({
      where: {
        ...ABANDONED_WHERE,
        id: { in: ['client-a', 'client-b'] },
      },
    });
  });

  it('re-applies the abandoned filter on delete so a client that signs in mid-sweep survives', async () => {
    prisma.oAuthClient.findMany.mockResolvedValueOnce([
      { id: 'client-a' },
      { id: 'client-signed-in' },
    ]);
    prisma.oAuthClient.deleteMany.mockResolvedValueOnce({ count: 1 });

    const deleted = await service.deleteAbandonedClients(NOW);

    const where = prisma.oAuthClient.deleteMany.mock.calls[0]?.[0]?.where;
    expect(where.authCodes).toEqual({ none: {} });
    expect(where.refreshTokens).toEqual({ none: {} });
    expect(where.createdAt.lt.getTime()).toBe(CUTOFF.getTime());
    expect(deleted).toBe(1);
  });

  it('never matches clients registered inside the retention window', async () => {
    const recentRegistration = new Date(NOW.getTime() - 6 * MS_PER_DAY);

    await service.deleteAbandonedClients(NOW);

    const where = prisma.oAuthClient.findMany.mock.calls[0]?.[0]?.where;
    expect(where.createdAt.lt.getTime()).toBe(CUTOFF.getTime());
    expect(recentRegistration.getTime()).toBeGreaterThan(
      where.createdAt.lt.getTime(),
    );
  });

  it('drains abandoned clients in bounded batches', async () => {
    prisma.oAuthClient.findMany
      .mockResolvedValueOnce(ids(OAUTH_CLIENT_CLEANUP_BATCH_SIZE, 'first'))
      .mockResolvedValueOnce(ids(3, 'second'));
    prisma.oAuthClient.deleteMany
      .mockResolvedValueOnce({ count: OAUTH_CLIENT_CLEANUP_BATCH_SIZE })
      .mockResolvedValueOnce({ count: 3 });

    const deleted = await service.deleteAbandonedClients(NOW);

    expect(deleted).toBe(OAUTH_CLIENT_CLEANUP_BATCH_SIZE + 3);
    expect(prisma.oAuthClient.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.oAuthClient.deleteMany).toHaveBeenCalledTimes(2);
    expect(
      prisma.oAuthClient.deleteMany.mock.calls[1]?.[0]?.where.id.in,
    ).toEqual(['second-0', 'second-1', 'second-2']);
  });

  it('stops after an empty page following a full batch', async () => {
    prisma.oAuthClient.findMany
      .mockResolvedValueOnce(ids(OAUTH_CLIENT_CLEANUP_BATCH_SIZE))
      .mockResolvedValueOnce([]);
    prisma.oAuthClient.deleteMany.mockResolvedValueOnce({
      count: OAUTH_CLIENT_CLEANUP_BATCH_SIZE,
    });

    const deleted = await service.deleteAbandonedClients(NOW);

    expect(deleted).toBe(OAUTH_CLIENT_CLEANUP_BATCH_SIZE);
    expect(prisma.oAuthClient.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.oAuthClient.deleteMany).toHaveBeenCalledOnce();
  });

  it('logs the sweep outcome', async () => {
    prisma.oAuthClient.findMany.mockResolvedValueOnce([{ id: 'client-a' }]);
    prisma.oAuthClient.deleteMany.mockResolvedValueOnce({ count: 1 });

    await service.deleteAbandonedClients(NOW);

    expect(logger.log).toHaveBeenCalledWith(
      'CronOAuthClientCleanupService completed',
      expect.objectContaining({
        cutoff: CUTOFF.toISOString(),
        deleted: 1,
        retentionDays: OAUTH_CLIENT_CLEANUP_RETENTION_DAYS,
      }),
    );
  });
});
