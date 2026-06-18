import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentRunsService', () => {
  const agentRun = {
    count: vi.fn(),
    findMany: vi.fn(),
  };

  let service: AgentRunsService;

  beforeEach(() => {
    vi.clearAllMocks();
    agentRun.count.mockResolvedValue(0);
    agentRun.findMany.mockResolvedValue([]);

    service = new AgentRunsService(
      { agentRun } as unknown as PrismaService,
      {} as LoggerService,
    );
  });

  it('queries active runs with Prisma enum values', async () => {
    await service.getActiveRuns('org-1');

    expect(agentRun.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      where: {
        isDeleted: false,
        organizationId: 'org-1',
        status: {
          in: ['PENDING', 'RUNNING'],
        },
      },
    });
  });

  it('caps active runs and applies cursor dates', async () => {
    await service.getActiveRuns('org-1', {
      cursor: '2026-06-01T10:00:00.000Z',
      limit: 999,
    });

    expect(agentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 200,
        where: expect.objectContaining({
          createdAt: { lt: new Date('2026-06-01T10:00:00.000Z') },
        }),
      }),
    );
  });

  it('counts run stats with Prisma enum values', async () => {
    await service.getStats('org-1');

    expect(agentRun.count).toHaveBeenNthCalledWith(2, {
      where: {
        isDeleted: false,
        organizationId: 'org-1',
        status: {
          in: ['PENDING', 'RUNNING'],
        },
      },
    });
    expect(agentRun.count).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'COMPLETED',
        }),
      }),
    );
    expect(agentRun.count).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'FAILED',
        }),
      }),
    );
  });
});
