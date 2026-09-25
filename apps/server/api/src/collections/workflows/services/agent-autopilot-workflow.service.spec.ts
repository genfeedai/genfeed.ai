import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { AgentAutonomyMode, AgentThreadMode } from '@genfeedai/contracts';
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
      agentType: 'social',
      isActive: true,
      config,
    };
    const snapshot = {
      bestPlatformFormatPairs: [],
      bestPostingWindows: [],
      clicks: 0,
      costPerVisit: null,
      creditsSpent: 0,
      ctr: 0,
      generatedCount: 0,
      impressions: 0,
      publishedCount: 0,
      topHooks: [],
      topTopics: [],
      visits: null,
    };
    let savedThread: Record<string, unknown> | null = null;
    const performance = {
      getPerformanceSnapshot: vi.fn().mockResolvedValue(snapshot),
    };
    const settings = { findOne: vi.fn().mockResolvedValue({}) };
    const credits = {
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(1000),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
      workflowExecution: { findFirst: vi.fn().mockResolvedValue(null) },
      brand: {
        findFirst: vi.fn().mockResolvedValue({
          agentConfig: {
            voice: { tone: 'warm', bannedPhrases: ['hype'] },
            strategy: {
              platforms: ['linkedin'],
              topics: ['design'],
              frequency: 'daily',
            },
          },
        }),
      },
      agentThread: {
        findFirst: vi.fn(async () => savedThread),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          savedThread = { id: 'thread', isDeleted: false, ...data };
          return savedThread;
        }),
      },
      agentStrategy: {
        findFirst: vi.fn().mockResolvedValue(row),
        findMany: vi.fn().mockResolvedValue([row]),
        update: vi.fn().mockResolvedValue(row),
      },
    };
    const runner = {
      enqueueWorkflow: vi.fn().mockResolvedValue({ executionId: 'run' }),
    };
    const service = new AgentAutopilotWorkflowService(
      prisma as never,
      performance as never,
      runner as never,
      credits as never,
      settings as never,
      {} as never,
      {} as never,
      { error: vi.fn() } as never,
    );
    return {
      service,
      runner,
      prisma,
      row,
      performance,
      settings,
      credits,
      snapshot,
    };
  }
  it('merges configuration over brand defaults, persists the weekly snapshot, and reuses its scoped thread', async () => {
    const { service, runner, prisma, row, snapshot } = setup({
      dailyCreditBudget: 20,
      platforms: ['instagram'],
      topics: ['craft'],
      voice: 'direct',
      postsPerWeek: 4,
      autonomyMode: AgentAutonomyMode.SUPERVISED,
    });
    await service.dispatchProactiveStrategy({ item: row });
    await service.dispatchProactiveStrategy({ item: row });
    expect(prisma.agentThread.create).toHaveBeenCalledTimes(1);
    expect(prisma.agentThread.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agentStrategyId: row.id,
        mode: AgentThreadMode.AUTO,
        title: row.label,
        organizationId: row.organizationId,
        brandId: row.brandId,
      }),
    });
    const dispatch = runner.enqueueWorkflow.mock.calls[0][0];
    const brief = JSON.parse(
      dispatch.inputValues.request.content
        .split('<agent_brief_json>\n')[1]
        .split('\n</agent_brief_json>')[0],
    );
    expect(brief).toMatchObject({
      agentType: 'social',
      voice: { tone: 'direct', bannedPhrases: ['hype'] },
      strategy: {
        platforms: ['instagram'],
        topics: ['craft'],
        postsPerWeek: 4,
      },
      weeklyPerformance: snapshot,
    });
    expect(dispatch.inputValues.request).toMatchObject({
      source: 'proactive',
      creditBudget: 20,
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      agentType: 'social',
      threadId: 'thread',
    });
    expect(dispatch.metadata.performanceSnapshot).toEqual(snapshot);
  });
  it('preserves explicitly empty platforms instead of silently choosing a network', async () => {
    const { service, runner, row } = setup({
      dailyCreditBudget: 20,
      platforms: [],
    });
    await service.dispatchProactiveStrategy({ item: row });
    const content =
      runner.enqueueWorkflow.mock.calls[0][0].inputValues.request.content;
    expect(content).toContain('"platforms":[]');
    expect(content).toContain(
      'request configuration and do not generate or publish',
    );
  });
  it.each([
    { isDeleted: true, status: 'active', brandId: 'brand', userId: 'owner' },
    { isDeleted: false, status: 'archived', brandId: 'brand', userId: 'owner' },
    { isDeleted: false, status: 'active', brandId: 'foreign', userId: 'owner' },
  ])(
    'refuses to replace or reuse an inactive or mismatched strategy thread',
    async (thread) => {
      const { service, runner, prisma, row } = setup({ dailyCreditBudget: 20 });
      prisma.agentThread.findFirst.mockResolvedValue({ id: 'old', ...thread });
      await service.dispatchProactiveStrategy({ item: row });
      expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
      expect(prisma.agentThread.create).not.toHaveBeenCalled();
    },
  );
  it('records snapshot read failures and dispatch failures even when the thread has previous runs', async () => {
    const { service, runner, prisma, row, performance } = setup({
      dailyCreditBudget: 20,
    });
    performance.getPerformanceSnapshot.mockRejectedValueOnce(
      new Error('metrics unavailable'),
    );
    await service.dispatchProactiveStrategy({ item: row });
    expect(prisma.agentStrategy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({ consecutiveFailures: 1 }),
        }),
      }),
    );
    expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
    runner.enqueueWorkflow.mockRejectedValueOnce(
      new Error('queue unavailable'),
    );
    await service.dispatchProactiveStrategy({ item: row });
    expect(prisma.agentStrategy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({ consecutiveFailures: 1 }),
        }),
      }),
    );
  });
  it('bounds the run by both brand remainder and available organization credits', async () => {
    const { service, runner, row, settings, credits } = setup({
      dailyCreditBudget: 100,
      creditsUsedToday: 10,
    });
    settings.findOne.mockResolvedValue({
      agentPolicy: { creditGovernance: { brandDailyCreditCap: 40 } },
    });
    credits.getOrganizationCreditsBalance.mockResolvedValue(25);
    row.config.minCreditThreshold = 0;
    await service.dispatchProactiveStrategy({ item: row });
    expect(runner.enqueueWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        inputValues: { request: expect.objectContaining({ creditBudget: 25 }) },
      }),
    );
  });
  it('does not double-record a failure after the current dispatch has persisted', async () => {
    const { service, runner, prisma, row } = setup({ dailyCreditBudget: 20 });
    prisma.workflowExecution.findFirst.mockResolvedValue({
      id: 'current-run',
    } as never);
    runner.enqueueWorkflow.mockRejectedValue(new Error('acknowledgement lost'));
    await service.dispatchProactiveStrategy({ item: row });
    const dispatchId =
      runner.enqueueWorkflow.mock.calls[0][0].metadata.dispatchId;
    expect(prisma.workflowExecution.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          result: { path: ['metadata', 'dispatchId'], equals: dispatchId },
        }),
      }),
    );
    for (const [update] of prisma.agentStrategy.update.mock.calls) {
      expect(update.data.config).not.toHaveProperty('consecutiveFailures');
    }
  });
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
