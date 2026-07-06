import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { AgentRunFrequency } from '@genfeedai/enums';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentAutopilotWorkflowService', () => {
  const prisma = {
    agentStrategy: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  const agentRunsService = { create: vi.fn() };
  const agentRunQueueService = { queueRun: vi.fn() };
  const creditsUtilsService = { getOrganizationCreditsBalance: vi.fn() };
  const organizationSettingsService = { findOne: vi.fn() };
  const agentGoalsService = { getGoalSummary: vi.fn() };
  const aiInfluencerService = { scheduleDailyPosts: vi.fn() };
  const cacheService = {
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
  };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: AgentAutopilotWorkflowService;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T09:00:00.000Z'));
    cacheService.acquireLock.mockResolvedValue(true);
    cacheService.releaseLock.mockResolvedValue(undefined);
    agentRunsService.create.mockResolvedValue({ id: 'run-1' });
    agentRunQueueService.queueRun.mockResolvedValue(undefined);
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(500);
    organizationSettingsService.findOne.mockResolvedValue(null);
    agentGoalsService.getGoalSummary.mockResolvedValue('Goal summary');
    aiInfluencerService.scheduleDailyPosts.mockResolvedValue([]);
    prisma.agentStrategy.findFirst.mockResolvedValue({
      config: {
        dailyResetAt: '2026-06-25T00:00:00.000Z',
        nextRunAt: '2026-06-24T08:59:00.000Z',
        weeklyResetAt: '2026-06-29T00:00:00.000Z',
      },
      id: 'strategy-1',
    });
    prisma.agentStrategy.update.mockResolvedValue({});

    service = new AgentAutopilotWorkflowService(
      prisma as never,
      agentRunsService as never,
      agentRunQueueService as never,
      creditsUtilsService as never,
      organizationSettingsService as never,
      agentGoalsService as never,
      aiInfluencerService as never,
      cacheService as never,
      logger as never,
    );
  });

  it('skips proactive strategy processing when the org lock already exists', async () => {
    cacheService.acquireLock.mockResolvedValue(false);

    const result = await service.runProactiveStrategies('org-1');

    expect(result).toMatchObject({
      action: 'proactiveAgentStrategies',
      enqueued: 0,
      organizationId: 'org-1',
      reason: 'proactive_agent_already_running',
      status: 'skipped',
    });
    expect(prisma.agentStrategy.findMany).not.toHaveBeenCalled();
    expect(cacheService.releaseLock).not.toHaveBeenCalled();
  });

  it('queues due active proactive strategies for the organization', async () => {
    prisma.agentStrategy.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          brandId: null,
          config: {
            creditsUsedThisWeek: 0,
            creditsUsedToday: 0,
            dailyCreditBudget: 100,
            dailyCreditsUsed: 0,
            dailyResetAt: '2026-06-25T00:00:00.000Z',
            minCreditThreshold: 10,
            nextRunAt: '2026-06-24T08:59:00.000Z',
            postsPerWeek: 3,
            runFrequency: AgentRunFrequency.DAILY,
            weeklyCreditBudget: 300,
            weeklyResetAt: '2026-06-29T00:00:00.000Z',
          },
          goalId: null,
          id: 'strategy-1',
          label: 'Growth strategy',
          organizationId: 'org-1',
          userId: 'user-1',
        },
      ]);

    const result = await service.runProactiveStrategies('org-1');

    expect(prisma.agentStrategy.findMany).toHaveBeenNthCalledWith(2, {
      take: 100,
      where: {
        isActive: true,
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(agentRunsService.create).toHaveBeenCalledWith({
      creditBudget: 100,
      label: 'Proactive: Growth strategy',
      objective: expect.stringContaining('Run proactive session'),
      organization: 'org-1',
      strategy: 'strategy-1',
      trigger: 'cron',
      user: 'user-1',
    });
    expect(agentRunQueueService.queueRun).toHaveBeenCalledWith(
      expect.objectContaining({
        creditBudget: 100,
        organizationId: 'org-1',
        runId: 'run-1',
        strategyId: 'strategy-1',
        userId: 'user-1',
      }),
    );
    expect(result).toMatchObject({
      action: 'proactiveAgentStrategies',
      enqueued: 1,
      organizationId: 'org-1',
      status: 'enqueued',
    });
  });

  it('records workflow handoff provenance on queued proactive agent runs', async () => {
    prisma.agentStrategy.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          brandId: null,
          config: {
            creditsUsedThisWeek: 0,
            creditsUsedToday: 0,
            dailyCreditBudget: 100,
            dailyCreditsUsed: 0,
            dailyResetAt: '2026-06-25T00:00:00.000Z',
            minCreditThreshold: 10,
            nextRunAt: '2026-06-24T08:59:00.000Z',
            postsPerWeek: 3,
            runFrequency: AgentRunFrequency.DAILY,
            weeklyCreditBudget: 300,
            weeklyResetAt: '2026-06-29T00:00:00.000Z',
          },
          goalId: null,
          id: 'strategy-1',
          label: 'Growth strategy',
          organizationId: 'org-1',
          userId: 'user-1',
        },
      ]);

    const result = await service.runProactiveStrategies('org-1', {
      workflowExecutionId: 'exec-1',
      workflowId: 'workflow-1',
      workflowNodeId: 'node-1',
      workflowNodeType: 'proactiveAgentStrategies',
      workflowRunId: 'engine-run-1',
    });

    expect(agentRunsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          workflowHandoff: {
            agentStrategyId: 'strategy-1',
            workflowExecutionId: 'exec-1',
            workflowId: 'workflow-1',
            workflowNodeId: 'node-1',
            workflowNodeType: 'proactiveAgentStrategies',
            workflowRunId: 'engine-run-1',
          },
        },
      }),
    );
    expect(result).toMatchObject({
      agentRunIds: ['run-1'],
      enqueued: 1,
      status: 'enqueued',
      workflowExecutionId: 'exec-1',
      workflowId: 'workflow-1',
      workflowRunId: 'engine-run-1',
    });
  });

  it('returns skipped when no proactive strategies are due', async () => {
    prisma.agentStrategy.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.runProactiveStrategies('org-1');

    expect(result).toMatchObject({
      action: 'proactiveAgentStrategies',
      enqueued: 0,
      organizationId: 'org-1',
      reason: 'no_due_strategies',
      status: 'skipped',
    });
    expect(agentRunsService.create).not.toHaveBeenCalled();
  });

  it('runs AI influencer daily posts with organization scope', async () => {
    aiInfluencerService.scheduleDailyPosts.mockResolvedValue([
      { ingredientId: 'ingredient-1', personaSlug: 'luna' },
      { ingredientId: 'ingredient-2', personaSlug: 'nova' },
    ]);

    const result = await service.runAiInfluencerDailyPosts('org-1');

    expect(cacheService.acquireLock).toHaveBeenCalledWith(
      'workflow-agent-autopilot:aiInfluencerDailyPosts:org-1',
      1800,
    );
    expect(aiInfluencerService.scheduleDailyPosts).toHaveBeenCalledWith({
      organizationId: 'org-1',
    });
    expect(result).toMatchObject({
      action: 'aiInfluencerDailyPosts',
      generated: 2,
      organizationId: 'org-1',
      status: 'completed',
    });
    expect(cacheService.releaseLock).toHaveBeenCalledWith(
      'workflow-agent-autopilot:aiInfluencerDailyPosts:org-1',
    );
  });
});
