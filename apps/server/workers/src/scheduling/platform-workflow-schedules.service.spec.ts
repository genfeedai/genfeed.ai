import { PlatformWorkflowSchedulesService } from '@workers/scheduling/platform-workflow-schedules.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PlatformWorkflowSchedulesService', () => {
  const prisma = {
    agentStrategy: { findMany: vi.fn() },
    organization: { findMany: vi.fn() },
    workflow: { findFirst: vi.fn() },
    workflowExecution: { findFirst: vi.fn() },
  };
  const runner = { enqueueWorkflow: vi.fn() };
  const logger = { error: vi.fn() };
  const continuations = { reconcile: vi.fn() };
  const pendingExecutions = { reconcile: vi.fn() };
  const service = new PlatformWorkflowSchedulesService(
    prisma as never,
    runner as never,
    logger as never,
    continuations as never,
    pendingExecutions as never,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.organization.findMany.mockResolvedValue([
      { id: 'org-1', userId: 'owner-1' },
    ]);
    prisma.workflow.findFirst.mockResolvedValue(null);
    prisma.workflowExecution.findFirst.mockResolvedValue(null);
    // Due by default (empty config: no failures, no manual-reactivation gate,
    // no future nextRunAt) so existing proactive-agent-strategies assertions
    // below keep exercising the installed-workflow branch they target.
    prisma.agentStrategy.findMany.mockResolvedValue([
      { organizationId: 'org-1', config: {} },
    ]);
    runner.enqueueWorkflow.mockResolvedValue({ executionId: 'execution-1' });
  });

  it('delegates pending-execution reconciliation to its existing owner', async () => {
    await service.reconcilePendingExecutions();
    expect(pendingExecutions.reconcile).toHaveBeenCalledOnce();
  });

  it('delegates continuation reconciliation to its existing owner', async () => {
    await service.reconcileContinuations();
    expect(continuations.reconcile).toHaveBeenCalledOnce();
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

  it.each(['analytics-sync', 'content-loop-autopilot'] as const)(
    'does not enqueue a second dispatch for %s while the previous one is still PENDING/RUNNING (#5252 minor)',
    async (template) => {
      prisma.workflowExecution.findFirst.mockResolvedValue({
        id: 'still-queued-execution',
      });
      await service.sweep(template, 0);
      expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
      expect(prisma.workflowExecution.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            isDeleted: false,
            status: { in: ['PENDING', 'RUNNING'] },
          }),
        }),
      );
    },
  );

  it('still dispatches once the previous run has left PENDING/RUNNING', async () => {
    prisma.workflowExecution.findFirst.mockResolvedValue(null);
    await service.sweep('analytics-sync', 0);
    expect(runner.enqueueWorkflow).toHaveBeenCalledOnce();
  });

  it('does not let a stale (>2×interval-old) RUNNING row block dispatch forever (#5252 final review)', async () => {
    // A worker crash mid-run leaves the row RUNNING with no further updates.
    // Without an age bound, `inFlight` would match it on every future sweep
    // and this org's analytics-sync would never dispatch again. Simulate the
    // real Prisma filtering the where-clause's `createdAt.gte` bound would
    // apply: the row only counts as in-flight while it is younger than the
    // sweep's own in-flight window.
    const staleRowCreatedAt = new Date(0);
    prisma.workflowExecution.findFirst.mockImplementation(
      async ({ where }: { where: { createdAt?: { gte: Date } } }) => {
        const bound = where.createdAt?.gte;
        return bound && staleRowCreatedAt < bound
          ? null
          : { id: 'stale-running-execution' };
      },
    );
    const interval = 6 * 60 * 60 * 1000; // analytics-sync's own interval

    // Still inside the 2×interval window: the row keeps blocking dispatch.
    await service.sweep('analytics-sync', 2 * interval - 1);
    expect(runner.enqueueWorkflow).not.toHaveBeenCalled();

    // Past the window: the same never-updated row no longer blocks it.
    await service.sweep('analytics-sync', 2 * interval + 1);
    expect(runner.enqueueWorkflow).toHaveBeenCalledOnce();
  });

  it('floors the in-flight window at 1h for a fast-cadence template (#5252 final review)', async () => {
    // proactive-agent-strategies' own interval is 60s; without a floor,
    // 2×interval (2 minutes) would treat almost any genuinely in-progress
    // run as stale.
    prisma.workflowExecution.findFirst.mockResolvedValue({
      id: 'genuinely-in-progress-execution',
    });
    await service.sweep('proactive-agent-strategies', 59 * 60 * 1000); // 59 minutes in
    expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
    expect(prisma.workflowExecution.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: new Date(59 * 60 * 1000 - 60 * 60 * 1000) },
        }),
      }),
    );
  });

  it('does not dispatch proactive-agent-strategies for an org with no due active strategy (#4961 AC-1, #5162)', async () => {
    prisma.agentStrategy.findMany.mockResolvedValue([]);
    await service.sweep('proactive-agent-strategies', 120001);
    expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
    // The whole point of the gate: skip before the installed-workflow lookup
    // too, so a strategy-less org costs one query per sweep, not two.
    expect(prisma.workflow.findFirst).not.toHaveBeenCalled();
    expect(prisma.agentStrategy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: { in: ['org-1'] },
          isActive: true,
          isDeleted: false,
        }),
      }),
    );
  });

  it('does not dispatch proactive-agent-strategies for a strategy paused past its consecutive-failure limit', async () => {
    prisma.agentStrategy.findMany.mockResolvedValue([
      { organizationId: 'org-1', config: { consecutiveFailures: 5 } },
    ]);
    await service.sweep('proactive-agent-strategies', 120001);
    expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
  });

  it('does not dispatch proactive-agent-strategies for a strategy whose nextRunAt is in the future', async () => {
    prisma.agentStrategy.findMany.mockResolvedValue([
      {
        organizationId: 'org-1',
        config: {
          nextRunAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      },
    ]);
    await service.sweep('proactive-agent-strategies', 120001);
    expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
  });

  it.each(['analytics-sync', 'content-loop-autopilot'] as const)(
    'never gates %s on agent-strategy due state (AC-5: own catalog cadence)',
    async (template) => {
      prisma.agentStrategy.findMany.mockResolvedValue([]);
      await service.sweep(template, 0);
      expect(prisma.agentStrategy.findMany).not.toHaveBeenCalled();
      expect(runner.enqueueWorkflow).toHaveBeenCalledOnce();
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
