import { PlatformWorkflowSweepsService } from '@workers/scheduling/platform-workflow-sweeps.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PlatformWorkflowSweepsService', () => {
  const prisma = {
    organization: { findMany: vi.fn() },
    workflow: { findFirst: vi.fn() },
  };
  const runner = { enqueueWorkflow: vi.fn() };
  const logger = { error: vi.fn() };
  const service = new PlatformWorkflowSweepsService(
    prisma as never,
    runner as never,
    logger as never,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.organization.findMany.mockResolvedValue([
      { id: 'org-1', userId: 'owner-1' },
    ]);
    prisma.workflow.findFirst.mockResolvedValue(null);
    runner.enqueueWorkflow.mockResolvedValue({ executionId: 'execution-1' });
  });

  it('dispatches without installation with a stable scheduled-slot identity', async () => {
    await service.sweep('proactive-agent-strategies', 120001);
    await service.sweep('proactive-agent-strategies', 120001);
    expect(runner.enqueueWorkflow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        canonicalId: 'agent.autopilot.proactive',
        idempotencyKey: 'platform:proactive-agent-strategies:org-1:2',
        organizationId: 'org-1',
        userId: 'owner-1',
        trigger: 'scheduled',
      }),
    );
    expect(runner.enqueueWorkflow.mock.calls[0]).toEqual(
      runner.enqueueWorkflow.mock.calls[1],
    );
  });

  it.each([
    'analytics-sync',
    'content-loop-autopilot',
    'proactive-agent-strategies',
  ] as const)(
    'respects installed, paused and deleted tenant controls for %s',
    async (template) => {
      prisma.workflow.findFirst.mockResolvedValue({ id: 'installed' });
      await service.sweep(template, 120000);
      expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
      expect(prisma.workflow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            OR: expect.any(Array),
          }),
        }),
      );
      expect(
        prisma.workflow.findFirst.mock.calls[0][0].where,
      ).not.toHaveProperty('isDeleted');
    },
  );

  it('continues other tenants and preserves failures for retry', async () => {
    prisma.organization.findMany.mockResolvedValue([
      { id: 'a', userId: 'u' },
      { id: 'b', userId: 'v' },
    ]);
    runner.enqueueWorkflow.mockRejectedValueOnce(
      new Error('queue unavailable'),
    );
    await expect(service.sweep('analytics-sync', 0)).rejects.toThrow(
      'sweep failed',
    );
    expect(runner.enqueueWorkflow).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('organization a'),
      expect.any(Object),
    );
  });

  it('pages non-deleted organizations in bounded ID order', async () => {
    prisma.organization.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, i) => ({
          id: `org-${i}`,
          userId: 'owner',
        })),
      )
      .mockResolvedValueOnce([]);
    await service.sweep('analytics-sync', 0);
    expect(prisma.organization.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { isDeleted: false, id: { gt: 'org-99' } },
        orderBy: { id: 'asc' },
        take: 100,
      }),
    );
  });
});
