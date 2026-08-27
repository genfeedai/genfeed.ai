import { AgentExecutionTrigger } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRuntimeService } from './agent-runtime.service';

describe('AgentRuntimeService', () => {
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
  };
  const agentRunsService = {
    create: vi.fn(),
  };
  const agentRunQueueService = {
    queueRun: vi.fn(),
  };
  const agentThreadsService = {
    create: vi.fn(),
  };
  const agentThreadEngineService = {
    appendEvent: vi.fn(),
  };

  let service: AgentRuntimeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentRuntimeService(
      logger as never,
      agentRunsService as never,
      agentRunQueueService as never,
      agentThreadsService as never,
      agentThreadEngineService as never,
    );
  });

  it('startTurn creates thread, run, queues execution, and appends turn_requested', async () => {
    agentThreadsService.create.mockResolvedValue({ id: 'thread-1' });
    agentRunsService.create.mockResolvedValue({ id: 'run-1' });
    agentRunQueueService.queueRun.mockResolvedValue(undefined);
    agentThreadEngineService.appendEvent.mockResolvedValue(undefined);

    const handle = await service.startTurn({
      agentType: 'general',
      autonomyMode: 'supervised',
      brandId: 'brand-1',
      campaignId: 'campaign-1',
      creditBudget: 12,
      label: 'Campaign run: Spring Push - Specialist',
      model: 'openai/gpt-5.6-terra',
      objective: 'Grow engagement',
      organizationId: 'org-1',
      strategyId: 'strategy-1',
      threadTitle: 'Spring Push · Specialist',
      trigger: AgentExecutionTrigger.CRON,
      userId: 'user-1',
    });

    expect(handle).toEqual({ runId: 'run-1', threadId: 'thread-1' });
    expect(agentThreadsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        source: 'campaign',
        title: 'Spring Push · Specialist',
        userId: 'user-1',
      }),
    );
    expect(agentRunsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          campaignId: 'campaign-1',
          source: 'campaign',
          threadId: 'thread-1',
        }),
        objective: 'Grow engagement',
        organizationId: 'org-1',
        strategyId: 'strategy-1',
        threadId: 'thread-1',
        userId: 'user-1',
      }),
    );
    expect(agentRunQueueService.queueRun).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'campaign-1',
        organizationId: 'org-1',
        runId: 'run-1',
        strategyId: 'strategy-1',
        threadId: 'thread-1',
        userId: 'user-1',
      }),
    );
    expect(agentThreadEngineService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        runId: 'run-1',
        threadId: 'thread-1',
        type: 'thread.turn_requested',
        userId: 'user-1',
      }),
    );
  });

  it('startTurn continues when thread event append fails', async () => {
    agentThreadsService.create.mockResolvedValue({ id: 'thread-1' });
    agentRunsService.create.mockResolvedValue({ id: 'run-1' });
    agentRunQueueService.queueRun.mockResolvedValue(undefined);
    agentThreadEngineService.appendEvent.mockRejectedValue(
      new Error('append failed'),
    );

    const handle = await service.startTurn({
      label: 'Campaign run',
      objective: 'Grow engagement',
      organizationId: 'org-1',
      strategyId: 'strategy-1',
      trigger: AgentExecutionTrigger.CRON,
      userId: 'user-1',
    });

    expect(handle).toEqual({ runId: 'run-1', threadId: 'thread-1' });
    expect(logger.warn).toHaveBeenCalled();
  });
});
