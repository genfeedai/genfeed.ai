import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { PlatformWorkflowSchedulesService } from '@workers/scheduling/platform-workflow-schedules.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PlatformWorkflowSchedulesService', () => {
  const prisma = {
    agentStrategy: { findMany: vi.fn() },
    member: { findMany: vi.fn() },
    organization: { findMany: vi.fn() },
    post: { findMany: vi.fn() },
    session: { findMany: vi.fn() },
    workflow: { findFirst: vi.fn() },
    workflowExecution: { findFirst: vi.fn(), findMany: vi.fn() },
  };
  const runner = { enqueueWorkflow: vi.fn() };
  const logger = { error: vi.fn(), log: vi.fn() };
  const continuations = { reconcile: vi.fn() };
  const pendingExecutions = { reconcile: vi.fn() };
  const taskOrchestrator = { recoverStalledRollups: vi.fn() };
  const moduleAccess = { canStartWork: vi.fn() };
  const service = new PlatformWorkflowSchedulesService(
    prisma as never,
    runner as never,
    logger as never,
    continuations as never,
    pendingExecutions as never,
    taskOrchestrator as never,
    moduleAccess as never,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.organization.findMany.mockResolvedValue([
      { id: 'org-1', userId: 'owner-1' },
    ]);
    prisma.workflow.findFirst.mockResolvedValue(null);
    prisma.workflowExecution.findFirst.mockResolvedValue(null);
    prisma.workflowExecution.findMany.mockResolvedValue([]);
    // The default organization also has a published post that is due.
    prisma.post.findMany.mockResolvedValue([{ organizationId: 'org-1' }]);
    // Due by default (empty config: no failures, no manual-reactivation gate,
    // no future nextRunAt) so existing proactive-agent-strategies assertions
    // below keep exercising the installed-workflow branch they target.
    prisma.agentStrategy.findMany.mockResolvedValue([
      { id: 'strategy-1', organizationId: 'org-1', config: {} },
    ]);
    runner.enqueueWorkflow.mockResolvedValue({ executionId: 'execution-1' });
    // The default organization result also represents a recently active page.
    moduleAccess.canStartWork.mockResolvedValue(true);
  });

  describe('active Discovery gate (#5634)', () => {
    const gated = [
      'content-learning.reconcile',
      'content-loop-autopilot',
    ] as const;

    it.each(gated)(
      'skips %s for an organization with no session in the last 48h',
      async (template) => {
        prisma.organization.findMany
          .mockResolvedValueOnce([{ id: 'org-1', userId: 'owner-1' }])
          .mockResolvedValueOnce([]);
        await service.sweep(template, Date.UTC(2026, 9, 14));
        expect(prisma.organization.findMany).toHaveBeenNthCalledWith(2, {
          where: {
            id: { in: ['org-1'] },
            isDeleted: false,
            OR: [
              {
                user: {
                  is: {
                    sessions: {
                      some: {
                        updatedAt: { gte: new Date(Date.UTC(2026, 9, 12)) },
                      },
                    },
                  },
                },
              },
              {
                members: {
                  some: {
                    isDeleted: false,
                    user: {
                      is: {
                        sessions: {
                          some: {
                            updatedAt: { gte: new Date(Date.UTC(2026, 9, 12)) },
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
          select: { id: true },
          take: 1,
        });
        expect(prisma.member.findMany).not.toHaveBeenCalled();
        expect(prisma.session.findMany).not.toHaveBeenCalled();
        expect(moduleAccess.canStartWork).not.toHaveBeenCalled();
        expect(prisma.workflow.findFirst).not.toHaveBeenCalled();
        expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
      },
    );

    it.each(gated)(
      'skips %s for an active organization without Discovery access',
      async (template) => {
        moduleAccess.canStartWork.mockResolvedValue(false);
        await service.sweep(template, 0);
        expect(moduleAccess.canStartWork).toHaveBeenCalledWith(
          'org-1',
          'discovery',
        );
        expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
      },
    );

    it('uses only activity IDs and preserves original organization admission order', async () => {
      prisma.organization.findMany
        .mockResolvedValueOnce([
          { id: 'org-1', userId: 'owner-1' },
          { id: 'org-2', userId: 'owner-2' },
          { id: 'org-inactive', userId: 'owner-inactive' },
        ])
        .mockResolvedValueOnce([
          { id: 'org-2' },
          { id: 'org-outside-page' },
          { id: 'org-1' },
        ]);

      await service.sweep('content-learning.reconcile', 0);

      expect(moduleAccess.canStartWork.mock.calls).toEqual([
        ['org-1', 'discovery'],
        ['org-2', 'discovery'],
      ]);
      expect(runner.enqueueWorkflow).toHaveBeenCalledTimes(2);
      expect(prisma.member.findMany).not.toHaveBeenCalled();
      expect(prisma.session.findMany).not.toHaveBeenCalled();
    });

    it('does not read activity evidence for an empty organization page', async () => {
      prisma.organization.findMany.mockResolvedValueOnce([]);

      await service.sweep('content-learning.reconcile', 0);

      expect(prisma.organization.findMany).toHaveBeenCalledOnce();
      expect(prisma.member.findMany).not.toHaveBeenCalled();
      expect(prisma.session.findMany).not.toHaveBeenCalled();
      expect(moduleAccess.canStartWork).not.toHaveBeenCalled();
    });

    it('preserves an activity lookup failure without dispatching work', async () => {
      const unavailable = new Error('activity database unavailable');
      prisma.organization.findMany
        .mockResolvedValueOnce([{ id: 'org-1', userId: 'owner-1' }])
        .mockRejectedValueOnce(unavailable);

      await expect(service.sweep('content-learning.reconcile', 0)).rejects.toBe(
        unavailable,
      );

      expect(moduleAccess.canStartWork).not.toHaveBeenCalled();
      expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
    });

    it.each([
      'content-learning.retention',
      'proactive-agent-strategies',
    ] as const)('leaves %s outside the activity gate', async (template) => {
      prisma.session.findMany.mockResolvedValue([]);
      await service.sweep(template, 120001);
      expect(prisma.session.findMany).not.toHaveBeenCalled();
      expect(moduleAccess.canStartWork).not.toHaveBeenCalled();
      expect(runner.enqueueWorkflow).toHaveBeenCalledOnce();
    });
  });

  describe('published-post gate (#11097)', () => {
    const measured = ['analytics-collect', 'analytics-sync'] as const;

    it.each(measured)(
      'dispatches %s for an organization that published but has no recent session',
      async (template) => {
        await service.sweep(template, Date.UTC(2026, 10, 24));
        // No session lookup, no Discovery access check: only the published post.
        expect(prisma.organization.findMany).toHaveBeenCalledOnce();
        expect(prisma.session.findMany).not.toHaveBeenCalled();
        expect(moduleAccess.canStartWork).not.toHaveBeenCalled();
        expect(runner.enqueueWorkflow).toHaveBeenCalledOnce();
        expect(runner.enqueueWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId: 'org-1',
            userId: 'owner-1',
          }),
          expect.objectContaining({
            dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
          }),
        );
      },
    );

    it.each(measured)(
      'skips %s for an organization with no published post',
      async (template) => {
        prisma.post.findMany.mockResolvedValue([]);
        await service.sweep(template, 0);
        expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
        expect(prisma.workflow.findFirst).not.toHaveBeenCalled();
      },
    );

    it('asks for a published, external-id post of this page, tenant-scoped', async () => {
      await service.sweep('analytics-sync', 0);
      expect(prisma.post.findMany).toHaveBeenCalledWith({
        distinct: ['organizationId'],
        select: { organizationId: true },
        where: {
          externalId: { not: null },
          isDeleted: false,
          organizationId: { in: ['org-1'] },
          targetExecutionState: 'published',
        },
      });
    });

    it('collects from the platforms only for a post whose collection is due', async () => {
      const now = Date.UTC(2026, 10, 24, 10);
      await service.sweep('analytics-collect', now);
      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            analyticsNextCollectAt: { lte: new Date(now) },
          }),
        }),
      );
      expect(runner.enqueueWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalId: 'analytics.organization-refresh',
          idempotencyKey: `platform:analytics-collect:org-1:${Math.floor(now / (30 * 60 * 1000))}`,
        }),
        expect.objectContaining({ expireAfterMs: expect.any(Number) }),
      );
    });

    it('admits only the organizations the database returned, in page order', async () => {
      prisma.organization.findMany.mockResolvedValueOnce([
        { id: 'org-1', userId: 'owner-1' },
        { id: 'org-2', userId: 'owner-2' },
        { id: 'org-3', userId: 'owner-3' },
      ]);
      prisma.post.findMany.mockResolvedValue([
        { organizationId: 'org-3' },
        { organizationId: 'org-1' },
      ]);
      await service.sweep('analytics-sync', 0);
      expect(
        runner.enqueueWorkflow.mock.calls.map(
          ([input]) => input.organizationId,
        ),
      ).toEqual(['org-1', 'org-3']);
    });

    it('does not read posts for an empty organization page', async () => {
      prisma.organization.findMany.mockResolvedValueOnce([]);
      await service.sweep('analytics-collect', 0);
      expect(prisma.post.findMany).not.toHaveBeenCalled();
    });

    it('preserves a post lookup failure without dispatching work', async () => {
      const unavailable = new Error('posts database unavailable');
      prisma.post.findMany.mockRejectedValue(unavailable);
      await expect(service.sweep('analytics-collect', 0)).rejects.toBe(
        unavailable,
      );
      expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
    });

    it.each([
      'content-learning.reconcile',
      'content-loop-autopilot',
      'proactive-agent-strategies',
    ] as const)(
      'leaves %s outside the published-post gate',
      async (template) => {
        await service.sweep(template, 120001);
        expect(prisma.post.findMany).not.toHaveBeenCalled();
      },
    );
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
      expect.objectContaining({
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
        expireAfterMs: 10 * 60 * 1000,
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

  it('admits future-cadence agents with their own accepted pending proactive work', async () => {
    prisma.agentStrategy.findMany.mockResolvedValue([
      {
        id: 'strategy-1',
        organizationId: 'org-1',
        config: { nextRunAt: '2099-01-01T00:00:00.000Z' },
      },
    ]);
    prisma.workflowExecution.findMany.mockResolvedValue([
      { organizationId: 'org-1' },
    ]);

    await service.sweep('proactive-agent-strategies', 120001);

    expect(prisma.workflowExecution.findMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        organizationId: { in: ['org-1'] },
        isDeleted: false,
        status: 'PENDING',
        idempotencyKey: { startsWith: 'proactive:' },
        source: 'proactive',
        OR: [{ organizationId: 'org-1', strategyId: 'strategy-1' }],
      },
      select: { organizationId: true },
    });
    expect(runner.enqueueWorkflow).toHaveBeenCalledOnce();
  });

  it.each([{ consecutiveFailures: 5 }, { requiresManualReactivation: true }])(
    'keeps pending recovery behind strategy opt-outs: %s',
    async (config) => {
      prisma.agentStrategy.findMany.mockResolvedValue([
        {
          id: 'strategy-1',
          organizationId: 'org-1',
          config: { ...config, nextRunAt: '2099-01-01T00:00:00.000Z' },
        },
      ]);
      prisma.workflowExecution.findMany.mockResolvedValue([
        { organizationId: 'org-1' },
      ]);

      await service.sweep('proactive-agent-strategies', 120001);

      expect(prisma.workflowExecution.findMany).not.toHaveBeenCalled();
      expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
    },
  );

  it('retains the tenant installation pause control for pending recovery', async () => {
    prisma.agentStrategy.findMany.mockResolvedValue([
      {
        id: 'strategy-1',
        organizationId: 'org-1',
        config: { nextRunAt: '2099-01-01T00:00:00.000Z' },
      },
    ]);
    prisma.workflowExecution.findMany.mockResolvedValue([
      { organizationId: 'org-1' },
    ]);
    prisma.workflow.findFirst.mockResolvedValue({ id: 'paused-installation' });

    await service.sweep('proactive-agent-strategies', 120001);

    expect(prisma.workflowExecution.findMany).toHaveBeenCalledOnce();
    expect(prisma.workflow.findFirst).toHaveBeenCalledOnce();
    expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
  });

  it.each(['analytics-sync', 'content-loop-autopilot'] as const)(
    'never gates %s on agent-strategy due state (AC-5: own catalog cadence)',
    async (template) => {
      prisma.agentStrategy.findMany.mockResolvedValue([]);
      await service.sweep(template, 0);
      expect(prisma.agentStrategy.findMany).not.toHaveBeenCalled();
      expect(prisma.workflowExecution.findMany).not.toHaveBeenCalled();
      expect(runner.enqueueWorkflow).toHaveBeenCalledOnce();
    },
  );

  it('continues other tenants and preserves failures for retry', async () => {
    prisma.organization.findMany.mockResolvedValue([
      { id: 'a', userId: 'u' },
      { id: 'b', userId: 'v' },
    ]);
    prisma.post.findMany.mockResolvedValue([
      { organizationId: 'a' },
      { organizationId: 'b' },
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
    const page = Array.from({ length: 100 }, (_, i) => ({
      id: `org-${i}`,
      userId: 'owner',
    }));
    prisma.organization.findMany
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(page.map(({ id }) => ({ id })))
      .mockResolvedValueOnce([]);
    await service.sweep('content-learning.reconcile', 0);
    expect(prisma.organization.findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: { isDeleted: false, id: { gt: 'org-99' } },
        orderBy: { id: 'asc' },
        take: 100,
      }),
    );
    expect(prisma.organization.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: page.map(({ id }) => id) },
        }),
        select: { id: true },
        take: 100,
      }),
    );
    expect(prisma.member.findMany).not.toHaveBeenCalled();
    expect(prisma.session.findMany).not.toHaveBeenCalled();
  });

  it('pages organizations for the published-post gate without a session lookup', async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({
      id: `org-${i}`,
      userId: 'owner',
    }));
    prisma.organization.findMany
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce([]);
    prisma.post.findMany.mockResolvedValue([]);
    await service.sweep('analytics-sync', 0);
    expect(prisma.organization.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.organization.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { isDeleted: false, id: { gt: 'org-99' } },
      }),
    );
    expect(prisma.post.findMany).toHaveBeenCalledOnce();
  });

  it('runs the workspace task rollup recovery sweep', async () => {
    taskOrchestrator.recoverStalledRollups.mockResolvedValue(2);

    await service.recoverWorkspaceTaskRollups();

    expect(taskOrchestrator.recoverStalledRollups).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(
      'Recovered stalled workspace task rollups',
      { recovered: 2 },
    );
  });
});
