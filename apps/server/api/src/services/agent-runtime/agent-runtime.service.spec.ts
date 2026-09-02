import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRuntimeService } from './agent-runtime.service';

describe('AgentRuntimeService', () => {
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
  };
  const workflowRunner = {
    enqueueWorkflow: vi.fn(),
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
      agentThreadsService as never,
      workflowRunner as never,
      agentThreadEngineService as never,
    );
  });

  it('startTurn creates a thread, enqueues the agent-turn workflow, and appends turn_requested', async () => {
    agentThreadsService.create.mockResolvedValue({ id: 'thread-1' });
    workflowRunner.enqueueWorkflow.mockResolvedValue({
      executionId: 'execution-1',
    });
    agentThreadEngineService.appendEvent.mockResolvedValue(undefined);

    const handle = await service.startTurn({
      agentType: 'general',
      autonomyMode: 'supervised',
      brandId: 'brand-1',
      campaignId: 'campaign-1',
      creditBudget: 12,
      label: 'Campaign run: Spring Push - Specialist',
      metadata: { clientRequestId: 'client-1' },
      model: 'openai/gpt-5.6-terra',
      objective: 'Grow engagement',
      organizationId: 'org-1',
      strategyId: 'strategy-1',
      threadTitle: 'Spring Push · Specialist',
      trigger: WorkflowExecutionTrigger.SCHEDULED,
      userId: 'user-1',
    });

    expect(handle).toEqual({
      executionId: 'execution-1',
      threadId: 'thread-1',
    });
    expect(agentThreadsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        source: 'campaign',
        title: 'Spring Push · Specialist',
        userId: 'user-1',
      }),
    );
    expect(workflowRunner.enqueueWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'agent.turn.execute',
        canonicalId: 'agent.turn.execute',
        // The turn is deduped on the caller-supplied client request id, so a
        // retried enqueue rejoins the execution it already created.
        idempotencyKey: 'agent.turn.execute:org-1:user-1:client-1',
        inputValues: {
          request: expect.objectContaining({
            agentType: 'general',
            brandId: 'brand-1',
            campaignId: 'campaign-1',
            content: 'Grow engagement',
            creditBudget: 12,
            strategyId: 'strategy-1',
            threadId: 'thread-1',
          }),
        },
        metadata: expect.objectContaining({
          source: 'campaign',
          threadId: 'thread-1',
        }),
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    expect(agentThreadEngineService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: 'turn-requested:execution-1',
        organizationId: 'org-1',
        threadId: 'thread-1',
        type: 'thread.turn_requested',
        userId: 'user-1',
      }),
    );
  });

  it('startTurn omits the idempotency key when no client request id is supplied', async () => {
    agentThreadsService.create.mockResolvedValue({ id: 'thread-1' });
    workflowRunner.enqueueWorkflow.mockResolvedValue({
      executionId: 'execution-1',
    });
    agentThreadEngineService.appendEvent.mockResolvedValue(undefined);

    await service.startTurn({
      label: 'Campaign run',
      objective: 'Grow engagement',
      organizationId: 'org-1',
      strategyId: 'strategy-1',
      trigger: WorkflowExecutionTrigger.SCHEDULED,
      userId: 'user-1',
    });

    expect(workflowRunner.enqueueWorkflow).toHaveBeenCalledWith(
      expect.not.objectContaining({ idempotencyKey: expect.anything() }),
    );
  });

  it('startTurn continues when thread event append fails', async () => {
    agentThreadsService.create.mockResolvedValue({ id: 'thread-1' });
    workflowRunner.enqueueWorkflow.mockResolvedValue({
      executionId: 'execution-1',
    });
    agentThreadEngineService.appendEvent.mockRejectedValue(
      new Error('append failed'),
    );

    const handle = await service.startTurn({
      label: 'Campaign run',
      objective: 'Grow engagement',
      organizationId: 'org-1',
      strategyId: 'strategy-1',
      trigger: WorkflowExecutionTrigger.SCHEDULED,
      userId: 'user-1',
    });

    expect(handle).toEqual({
      executionId: 'execution-1',
      threadId: 'thread-1',
    });
    expect(logger.warn).toHaveBeenCalled();
  });
});
