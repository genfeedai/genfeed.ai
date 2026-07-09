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

  describe('prepareRetry', () => {
    const failedRun = {
      creditBudget: 40,
      id: 'run-1',
      metadata: {
        campaignId: 'campaign-1',
        requestedModel: 'model-from-metadata',
        source: 'test',
      },
      objective: 'Do the thing',
      retryCount: 1,
      status: 'FAILED',
      strategy: {
        agentType: 'content',
        config: { autonomyMode: 'supervised', model: 'model-from-config' },
      },
      strategyId: 'strategy-1',
      threadId: 'thread-1',
      userId: 'user-1',
    };

    it('returns null when the run is not found', async () => {
      agentRun.findFirst.mockResolvedValue(null);

      const preparation = await service.prepareRetry('missing', 'org-1', {
        retriedBy: 'user-2',
      });

      expect(preparation).toBeNull();
      expect(agentRun.update).not.toHaveBeenCalled();
    });

    it('scopes the lookup by organization and brand', async () => {
      agentRun.findFirst.mockResolvedValue(null);

      await service.prepareRetry('run-1', 'org-1', {
        brandId: 'brand-1',
        retriedBy: 'user-2',
      });

      expect(agentRun.findFirst).toHaveBeenCalledWith({
        include: { strategy: true },
        where: {
          brandId: 'brand-1',
          id: 'run-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('rejects runs that are not failed or cancelled', async () => {
      agentRun.findFirst.mockResolvedValue({
        ...failedRun,
        status: 'RUNNING',
      });

      await expect(
        service.prepareRetry('run-1', 'org-1', { retriedBy: 'user-2' }),
      ).rejects.toThrow('Only failed or cancelled agent runs can be retried');
      expect(agentRun.update).not.toHaveBeenCalled();
    });

    it('resets terminal state and stamps retry provenance metadata', async () => {
      agentRun.findFirst.mockResolvedValue(failedRun);
      agentRun.update.mockResolvedValue({ ...failedRun, status: 'PENDING' });

      const preparation = await service.prepareRetry('run-1', 'org-1', {
        retriedBy: 'user-2',
      });

      expect(preparation?.previousStatus).toBe('FAILED');
      expect(agentRun.update).toHaveBeenCalledWith({
        data: {
          completedAt: null,
          durationMs: null,
          error: null,
          metadata: expect.objectContaining({
            campaignId: 'campaign-1',
            lastRetryAt: expect.any(String),
            retriedBy: 'user-2',
            source: 'test',
          }),
          progress: 0,
          startedAt: null,
          status: 'PENDING',
          summary: null,
        },
        where: { id: 'run-1' },
      });

      const writtenMetadata = agentRun.update.mock.calls[0]?.[0].data.metadata;
      expect(Number.isNaN(Date.parse(writtenMetadata.lastRetryAt))).toBe(false);
    });

    it('rebuilds queue job data from the durable run and strategy records', async () => {
      agentRun.findFirst.mockResolvedValue(failedRun);
      agentRun.update.mockResolvedValue({ ...failedRun, status: 'PENDING' });

      const preparation = await service.prepareRetry('run-1', 'org-1', {
        retriedBy: 'user-2',
      });

      expect(preparation?.jobData).toEqual({
        agentType: 'content',
        autonomyMode: 'supervised',
        campaignId: 'campaign-1',
        creditBudget: 40,
        model: 'model-from-metadata',
        objective: 'Do the thing',
        organizationId: 'org-1',
        runId: 'run-1',
        strategyId: 'strategy-1',
        userId: 'user-1',
      });
    });

    it('falls back to strategy config model and omits absent fields for cancelled runs', async () => {
      agentRun.findFirst.mockResolvedValue({
        id: 'run-1',
        metadata: null,
        status: 'CANCELLED',
        strategy: { agentType: null, config: { model: 'model-from-config' } },
        userId: 'user-1',
      });
      agentRun.update.mockResolvedValue({ id: 'run-1', status: 'PENDING' });

      const preparation = await service.prepareRetry('run-1', 'org-1', {
        retriedBy: 'user-2',
      });

      expect(preparation?.previousStatus).toBe('CANCELLED');
      expect(preparation?.jobData).toEqual({
        agentType: undefined,
        autonomyMode: undefined,
        campaignId: undefined,
        creditBudget: undefined,
        model: 'model-from-config',
        objective: undefined,
        organizationId: 'org-1',
        runId: 'run-1',
        strategyId: undefined,
        userId: 'user-1',
      });
    });
  });
});
