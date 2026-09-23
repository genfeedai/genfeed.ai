import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { describe, expect, it, vi } from 'vitest';

describe('AgentAutopilotWorkflowService atomic actions', () => {
  it('discovers and resets one due credit window without iterating strategies internally', async () => {
    const config = {
      creditsUsedThisWeek: 8,
      dailyResetAt: '2020-01-01T00:00:00.000Z',
      weeklyResetAt: '2020-01-01T00:00:00.000Z',
    };
    // `isActive` scopes the query; discovery hands the graph a projected
    // snapshot, so the persisted row and the emitted item are not the same shape.
    const strategyRow = {
      brandId: null,
      config,
      goalId: null,
      id: 'strategy-1',
      isActive: true,
      label: null,
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const strategySnapshot = {
      config,
      id: 'strategy-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
      agentStrategy: {
        findFirst: vi.fn().mockResolvedValue(strategyRow),
        findMany: vi.fn().mockResolvedValue([strategyRow]),
        update: vi.fn().mockResolvedValue(strategyRow),
      },
    };
    const service = new AgentAutopilotWorkflowService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const discovery = await service.discoverCreditResetStrategies('org-1', {
      state: { acquired: true },
    });
    expect(discovery.items).toEqual([strategySnapshot]);

    await service.resetCreditWindow('org-1', {
      item: strategySnapshot,
      now: '2026-08-28T00:00:00.000Z',
    });
    expect(prisma.agentStrategy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'strategy-1', isDeleted: false, organizationId: 'org-1' },
      }),
    );
  });
});

describe('AgentAutopilotWorkflowService dispatch budgets', () => {
  function setup(config: Record<string, unknown>) {
    const row = {
      id: 'strategy',
      organizationId: 'org',
      userId: 'owner',
      brandId: 'brand',
      goalId: null,
      label: 'Agent',
      isActive: true,
      config,
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
      agentStrategy: {
        findFirst: vi.fn().mockResolvedValue(row),
        update: vi.fn().mockResolvedValue(row),
      },
    };
    const runner = {
      enqueueWorkflow: vi.fn().mockResolvedValue({ executionId: 'run' }),
    };
    const service = new AgentAutopilotWorkflowService(
      prisma as never,
      { create: vi.fn().mockResolvedValue({ id: 'thread' }) } as never,
      runner as never,
      {
        getOrganizationCreditsBalance: vi.fn().mockResolvedValue(1000),
      } as never,
      { findOne: vi.fn().mockResolvedValue({}) } as never,
      {} as never,
      {} as never,
      { error: vi.fn() } as never,
    );
    return { service, runner, prisma, row };
  }
  it('dispatches legacy missing weekly budget using daily times five', async () => {
    const { service, runner, row } = setup({ dailyCreditBudget: 10 });
    expect(
      await service.dispatchProactiveStrategy({
        item: row,
        organizationId: 'org',
      }),
    ).toEqual({ executionId: 'run', status: 'enqueued' });
    expect(runner.enqueueWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'proactive',
        metadata: expect.objectContaining({ strategyId: 'strategy' }),
        inputValues: { request: expect.objectContaining({ creditBudget: 10 }) },
      }),
    );
  });
  it.each([
    { dailyCreditBudget: 10, weeklyCreditBudget: 0 },
    { dailyCreditBudget: 10, creditsUsedToday: 10 },
    { dailyCreditBudget: 10, creditsUsedThisWeek: 50 },
  ])('preserves zero and spent credit gates', async (config) => {
    const { service, runner, row } = setup(config);
    await service.dispatchProactiveStrategy({ item: row });
    expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
  });
  it('rejects a foreign snapshot and a strategy paused after discovery', async () => {
    const { service, runner, prisma, row } = setup({ dailyCreditBudget: 10 });
    await service.dispatchProactiveStrategy({
      item: row,
      organizationId: 'foreign',
    });
    prisma.agentStrategy.findFirst.mockResolvedValue(null as never);
    await service.dispatchProactiveStrategy({
      item: row,
      organizationId: 'org',
    });
    expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
  });
});
