import { AgentCampaignExecutionService } from '@api/collections/agent-campaigns/services/agent-campaign-execution.service';
import { AgentRuntimeService } from '@api/services/agent-runtime/agent-runtime.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Smoke path: campaign execute → AgentRuntime.startTurn → agent-turn workflow
 * execution + thread.turn_requested snapshot event.
 */
describe('campaign → runtime → thread snapshot smoke', () => {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const agentCampaignsService = {
    findOneById: vi.fn(),
    patch: vi.fn(),
  };
  const agentStrategiesService = {
    findOneById: vi.fn(),
    pauseStrategy: vi.fn(),
    setActive: vi.fn(),
  };
  const prisma = {};
  const workflowRunner = {
    enqueueWorkflow: vi.fn(),
  };
  const agentThreadsService = {
    create: vi.fn(),
  };
  const agentThreadEngineService = {
    appendEvent: vi.fn(),
  };

  let executionService: AgentCampaignExecutionService;
  let runtimeService: AgentRuntimeService;

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeService = new AgentRuntimeService(
      logger as never,
      agentThreadsService as never,
      workflowRunner as never,
      agentThreadEngineService as never,
    );
    executionService = new AgentCampaignExecutionService(
      logger as never,
      agentCampaignsService as never,
      agentStrategiesService as never,
      prisma as never,
      runtimeService,
    );
  });

  it('execute starts a runtime turn with thread provenance snapshot', async () => {
    const campaignId = 'campaign-1';
    const organizationId = 'org-1';
    const userId = 'user-1';
    const strategyId = 'strategy-1';

    agentCampaignsService.findOneById.mockResolvedValue({
      agents: [strategyId],
      brandId: 'brand-1',
      brief: 'Grow engagement on X',
      id: campaignId,
      label: 'Spring Push',
      organizationId,
      status: 'draft',
      userId,
    });
    agentCampaignsService.patch.mockResolvedValue({
      agents: [strategyId],
      id: campaignId,
      label: 'Spring Push',
      organizationId,
      status: 'active',
      userId,
    });
    agentStrategiesService.findOneById.mockResolvedValue({
      agentType: 'general',
      autonomyMode: 'supervised',
      dailyCreditBudget: 20,
      id: strategyId,
      isActive: true,
      label: 'Engagement specialist',
      model: 'openai/gpt-5.6-terra',
    });
    agentThreadsService.create.mockResolvedValue({ id: 'thread-1' });
    workflowRunner.enqueueWorkflow.mockResolvedValue({
      executionId: 'execution-1',
    });
    agentThreadEngineService.appendEvent.mockResolvedValue(undefined);

    const updated = await executionService.execute(
      campaignId,
      organizationId,
      userId,
    );

    expect(updated.status).toBe('active');
    expect(updated.agents).toEqual([strategyId]);
    expect(agentCampaignsService.patch).toHaveBeenCalledWith(
      campaignId,
      expect.objectContaining({ status: 'active' }),
      ['agents'],
    );
    expect(agentThreadsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        source: 'campaign',
        title: 'Spring Push · Engagement specialist',
        userId,
      }),
    );
    expect(workflowRunner.enqueueWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'agent.turn.execute',
        canonicalId: 'agent.turn.execute',
        inputValues: {
          request: expect.objectContaining({
            content: 'Grow engagement on X',
            creditBudget: 20,
            strategyId,
            threadId: 'thread-1',
          }),
        },
        metadata: expect.objectContaining({
          campaignId,
          source: 'campaign',
          threadId: 'thread-1',
        }),
        organizationId,
        userId,
      }),
    );
    expect(agentThreadEngineService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          executionId: 'execution-1',
          label: 'Turn requested',
          status: 'queued',
        }),
        threadId: 'thread-1',
        type: 'thread.turn_requested',
      }),
    );
  });

  it('pause returns the populated Program roster', async () => {
    const campaignId = 'campaign-1';
    const organizationId = 'org-1';
    const strategyId = 'strategy-1';

    agentCampaignsService.findOneById.mockResolvedValue({
      agents: [strategyId],
      id: campaignId,
      label: 'Spring Push',
      organizationId,
      status: 'active',
      userId: 'user-1',
    });
    agentCampaignsService.patch.mockResolvedValue({
      agents: [strategyId],
      id: campaignId,
      label: 'Spring Push',
      organizationId,
      status: 'paused',
      userId: 'user-1',
    });

    const updated = await executionService.pause(campaignId, organizationId);

    expect(updated.agents).toEqual([strategyId]);
    expect(agentCampaignsService.patch).toHaveBeenCalledWith(
      campaignId,
      expect.objectContaining({ status: 'paused' }),
      ['agents'],
    );
    expect(agentStrategiesService.pauseStrategy).toHaveBeenCalledWith(
      strategyId,
    );
  });
});
