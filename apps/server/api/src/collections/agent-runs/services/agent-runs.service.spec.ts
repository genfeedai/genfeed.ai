import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentRunsService', () => {
  const agentRun = {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: AgentRunsService;

  beforeEach(() => {
    vi.clearAllMocks();
    agentRun.count.mockResolvedValue(0);
    agentRun.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'run-1', ...data }),
    );
    agentRun.findFirst.mockResolvedValue(null);
    agentRun.findMany.mockResolvedValue([]);
    agentRun.update.mockResolvedValue({ id: 'run-1' });
    agentRun.updateMany.mockResolvedValue({ count: 1 });

    service = new AgentRunsService(
      { agentRun } as unknown as PrismaService,
      logger as unknown as LoggerService,
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

  it('scopes active runs by brand when provided', async () => {
    await service.getActiveRuns('org-1', { brandId: 'brand-1' });

    expect(agentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          organizationId: 'org-1',
        }),
      }),
    );
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

  it('normalizes legacy relation aliases to scalar columns on create', async () => {
    await service.create({
      brand: 'brand-1',
      creditBudget: 50,
      label: 'Run',
      metadata: { source: 'test' },
      objective: 'Do the thing',
      organization: 'org-1',
      strategy: 'strategy-1',
      trigger: 'manual' as never,
      user: 'user-1',
    });

    expect(agentRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        creditBudget: 50,
        organizationId: 'org-1',
        strategyId: 'strategy-1',
        userId: 'user-1',
      }),
    });
    expect(agentRun.create.mock.calls[0]?.[0].data).not.toHaveProperty(
      'organization',
    );
    expect(agentRun.create.mock.calls[0]?.[0].data).not.toHaveProperty('user');
    expect(agentRun.create.mock.calls[0]?.[0].data).not.toHaveProperty('brand');
    expect(agentRun.create.mock.calls[0]?.[0].data).not.toHaveProperty(
      'strategy',
    );
  });

  it('rejects create without normalized user scope', async () => {
    await expect(
      service.create({
        label: 'Run',
        organization: 'org-1',
        trigger: 'manual' as never,
      } as never),
    ).rejects.toThrow('User context is required');
  });

  it('records tool calls on the durable JSON column with an ISO timestamp', async () => {
    agentRun.findFirst.mockResolvedValue({
      id: 'run-1',
      toolCalls: [{ status: 'completed', toolName: 'existing' }],
    });

    await service.recordToolCall('run-1', 'org-1', {
      creditsUsed: 3,
      durationMs: 120,
      status: 'completed',
      toolName: 'generate_post',
    });

    expect(agentRun.update).toHaveBeenCalledWith({
      data: {
        creditsUsed: { increment: 3 },
        toolCalls: [
          { status: 'completed', toolName: 'existing' },
          expect.objectContaining({
            creditsUsed: 3,
            durationMs: 120,
            status: 'completed',
            toolName: 'generate_post',
          }),
        ],
      },
      where: { id: 'run-1' },
    });

    const appendedCall = agentRun.update.mock.calls[0]?.[0].data.toolCalls[1];
    expect(appendedCall.executedAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(appendedCall.executedAt))).toBe(false);
  });

  it('clamps progress before writing the durable progress column', async () => {
    await service.updateProgress('run-1', 'org-1', 150);

    expect(agentRun.updateMany).toHaveBeenCalledWith({
      data: { progress: 100 },
      where: {
        id: 'run-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });
});
