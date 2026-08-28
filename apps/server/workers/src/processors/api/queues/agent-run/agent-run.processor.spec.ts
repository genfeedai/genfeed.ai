import { ActionOrigin, AgentExecutionStatus } from '@genfeedai/enums';
import type { AgentRunJobData } from '@genfeedai/queue-contracts';
import { getActionOriginContext } from '@genfeedai/server';
import { testId } from '@helpers/testing/test-id.helper';
import { AgentRunProcessor } from '@workers/processors/api/queues/agent-run/agent-run.processor';
import { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentRunProcessor', () => {
  let processor: AgentRunProcessor;
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let agentRunsService: {
    complete: ReturnType<typeof vi.fn>;
    fail: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    mergeMetadata: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
  };
  let agentOrchestratorService: {
    chat: ReturnType<typeof vi.fn>;
    chatStream: ReturnType<typeof vi.fn>;
  };
  let voiceGenerationService: {
    executeQueuedGeneration: ReturnType<typeof vi.fn>;
  };
  let agentStrategiesService: {
    checkQuota?: ReturnType<typeof vi.fn>;
    incrementFailures: ReturnType<typeof vi.fn>;
    recordRun: ReturnType<typeof vi.fn>;
    resetFailures: ReturnType<typeof vi.fn>;
  };
  let agentStrategyAutopilotService: {
    executeQueuedRun: ReturnType<typeof vi.fn>;
  };
  let agentStreamPublisherService: {
    publishError: ReturnType<typeof vi.fn>;
    publishRunComplete: ReturnType<typeof vi.fn>;
    publishRunStart: ReturnType<typeof vi.fn>;
  };
  let taskOrchestratorService: {
    handleRunCompletion: ReturnType<typeof vi.fn>;
    handleRunStarted: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    agentRunsService = {
      complete: vi.fn(),
      fail: vi.fn(),
      getById: vi.fn(),
      mergeMetadata: vi.fn(),
      patch: vi.fn(),
      start: vi.fn(),
    };

    agentOrchestratorService = {
      chat: vi.fn(),
      chatStream: vi.fn(),
    };
    voiceGenerationService = { executeQueuedGeneration: vi.fn() };

    agentStrategiesService = {
      incrementFailures: vi.fn(),
      recordRun: vi.fn(),
      resetFailures: vi.fn(),
    };

    agentStrategyAutopilotService = {
      executeQueuedRun: vi.fn(),
    };

    agentStreamPublisherService = {
      publishError: vi.fn(),
      publishRunComplete: vi.fn(),
      publishRunStart: vi.fn(),
    };

    taskOrchestratorService = {
      handleRunCompletion: vi.fn().mockResolvedValue(undefined),
      handleRunStarted: vi.fn().mockResolvedValue(undefined),
    };

    processor = new AgentRunProcessor(
      logger as never,
      agentRunsService as never,
      agentOrchestratorService as never,
      agentStrategiesService as never,
      agentStrategyAutopilotService as never,
      agentStreamPublisherService as never,
      voiceGenerationService as never,
      undefined as never,
      taskOrchestratorService as never,
    );
  });

  it('holds the BullMQ lease while an accepted chat turn executes in the background', async () => {
    const job = {
      data: {
        clientRequestId: 'request-1',
        kind: 'agent-chat-turn',
        organizationId: 'org-1',
        request: {
          clientRequestId: 'request-1',
          content: 'Generate an image',
          threadId: 'thread-1',
        },
        runId: 'run-1',
        threadId: 'thread-1',
        userId: 'user-1',
      },
    } as Job<AgentRunJobData>;

    await processor.process(job);

    expect(agentOrchestratorService.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: 'request-1' }),
      expect.objectContaining({ executionMode: 'background', runId: 'run-1' }),
    );
    expect(agentRunsService.complete).not.toHaveBeenCalled();
  });

  it('does not replay an accepted chat turn whose run already completed', async () => {
    agentRunsService.getById.mockResolvedValue({ status: 'COMPLETED' });
    const job = {
      data: {
        clientRequestId: 'request-1',
        kind: 'agent-chat-turn',
        organizationId: 'org-1',
        request: {
          clientRequestId: 'request-1',
          content: 'Generate an image',
          threadId: 'thread-1',
        },
        runId: 'run-1',
        threadId: 'thread-1',
        userId: 'user-1',
      },
    } as Job<AgentRunJobData>;

    await processor.process(job);

    expect(agentOrchestratorService.chatStream).not.toHaveBeenCalled();
  });

  it('fails a stalled running chat turn instead of replaying side effects', async () => {
    agentRunsService.getById.mockResolvedValue({ status: 'RUNNING' });
    const job = {
      attemptsMade: 1,
      data: {
        clientRequestId: 'request-1',
        kind: 'agent-chat-turn',
        organizationId: 'org-1',
        request: {
          clientRequestId: 'request-1',
          content: 'Publish this campaign',
          threadId: 'thread-1',
        },
        runId: 'run-1',
        threadId: 'thread-1',
        userId: 'user-1',
      },
    } as Job<AgentRunJobData>;

    await processor.process(job);

    expect(agentOrchestratorService.chatStream).not.toHaveBeenCalled();
    expect(agentRunsService.fail).toHaveBeenCalledWith(
      'run-1',
      'org-1',
      'Agent generation stopped before it could complete safely.',
    );
    expect(agentStreamPublisherService.publishError).toHaveBeenCalledWith({
      error: 'Agent generation stopped safely. Please retry.',
      runId: 'run-1',
      threadId: 'thread-1',
      userId: 'user-1',
    });
    expect(agentStreamPublisherService.publishRunComplete).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', status: 'failed' }),
    );
  });

  it('persists and publishes a safe terminal failure when durable retries are exhausted', async () => {
    agentOrchestratorService.chatStream.mockRejectedValue(
      new Error('connect ECONNREFUSED 127.0.0.1:4635'),
    );
    const job = {
      attemptsMade: 2,
      data: {
        clientRequestId: 'request-1',
        kind: 'agent-chat-turn',
        organizationId: 'org-1',
        request: {
          clientRequestId: 'request-1',
          content: 'Generate an image',
          threadId: 'thread-1',
        },
        runId: 'run-1',
        threadId: 'thread-1',
        userId: 'user-1',
      },
      opts: { attempts: 3 },
    } as Job<AgentRunJobData>;

    await expect(processor.process(job)).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      'AgentRunProcessor accepted chat turn failed',
      expect.objectContaining({
        attempt: 3,
        attempts: 3,
        errorMessage: 'connect ECONNREFUSED 127.0.0.1:4635',
        errorName: 'Error',
        runId: 'run-1',
        threadId: 'thread-1',
      }),
    );
    expect(agentRunsService.fail).toHaveBeenCalledWith(
      'run-1',
      'org-1',
      'Agent generation could not be completed after durable retries.',
    );
    expect(agentStreamPublisherService.publishError).toHaveBeenCalledWith({
      error: 'Agent generation could not be completed. Please retry.',
      runId: 'run-1',
      threadId: 'thread-1',
      userId: 'user-1',
    });
    expect(agentStreamPublisherService.publishRunComplete).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', status: 'failed' }),
    );
  });

  it('keeps a retryable accepted turn non-terminal before its final attempt', async () => {
    agentRunsService.getById.mockResolvedValue({ status: 'RUNNING' });
    agentOrchestratorService.chatStream.mockRejectedValue(
      new Error('Request failed with status code 429'),
    );
    const job = {
      attemptsMade: 1,
      data: {
        clientRequestId: 'request-1',
        kind: 'agent-chat-turn',
        organizationId: 'org-1',
        request: {
          clientRequestId: 'request-1',
          content: 'Reply with hello',
          threadId: 'thread-1',
        },
        runId: 'run-1',
        threadId: 'thread-1',
        userId: 'user-1',
      },
      opts: { attempts: 3 },
    } as Job<AgentRunJobData>;

    await expect(processor.process(job)).rejects.toThrow(
      'Request failed with status code 429',
    );

    expect(agentOrchestratorService.chatStream).toHaveBeenCalledOnce();
    expect(agentRunsService.fail).not.toHaveBeenCalled();
    expect(agentStreamPublisherService.publishError).not.toHaveBeenCalled();
    expect(
      agentStreamPublisherService.publishRunComplete,
    ).not.toHaveBeenCalled();
  });

  it('redelivers queued voice rendering through the durable worker', async () => {
    const job = {
      data: {
        kind: 'voice-generation',
        organizationId: 'org-1',
        runId: 'voice-1',
        userId: 'user-1',
        voiceRequest: {
          ingredientId: 'voice-1',
          text: 'Hello',
          voiceId: 'provider-voice-1',
        },
      },
    } as Job<AgentRunJobData>;

    await processor.process(job);

    expect(voiceGenerationService.executeQueuedGeneration).toHaveBeenCalledWith(
      {
        ingredientId: 'voice-1',
        organizationId: 'org-1',
        text: 'Hello',
        userId: 'user-1',
        voiceId: 'provider-voice-1',
      },
    );
  });

  it('persists thread linkage and derives summary from assistant message content', async () => {
    const runId = testId('run').toString();
    const threadId = testId('thread').toString();
    const organizationId = testId('org').toString();
    const userId = testId('user').toString();

    const job = {
      data: {
        actionContext: {
          actorUserId: userId,
          apiKeyId: 'key-1',
          origin: ActionOrigin.MCP,
        },
        objective: 'Find TikTok trends for my brand.',
        organizationId,
        runId,
        userId,
      },
    } as Job<AgentRunJobData>;

    agentRunsService.start.mockResolvedValue({
      label: 'Find TikTok trends for my brand.',
      metadata: { workspaceTaskId: 'workspace-task-1' },
      status: AgentExecutionStatus.RUNNING,
    });

    let capturedContext: ReturnType<typeof getActionOriginContext> | undefined;
    agentOrchestratorService.chat.mockImplementation(async () => {
      capturedContext = getActionOriginContext();
      return {
        message: {
          content: 'Found 20 TikTok trends for review.',
        },
        threadId,
      };
    });

    agentRunsService.complete.mockResolvedValue({
      completedAt: new Date(),
      creditsUsed: 0,
      metadata: { workspaceTaskId: 'workspace-task-1' },
      startedAt: new Date(),
      status: AgentExecutionStatus.COMPLETED,
      toolCalls: [],
    });

    await processor.process(job);

    expect(agentRunsService.complete).toHaveBeenCalledWith(
      runId,
      organizationId,
      'Found 20 TikTok trends for review.',
    );
    expect(agentRunsService.patch).toHaveBeenCalledTimes(1);
    const patchPayload = agentRunsService.patch.mock.calls[0]?.[1] as
      | { threadId?: string }
      | undefined;
    expect(patchPayload?.threadId).toBe(threadId);
    expect(agentRunsService.mergeMetadata).toHaveBeenCalledWith(
      runId,
      organizationId,
      { threadId },
    );
    expect(taskOrchestratorService.handleRunCompletion).toHaveBeenCalledWith(
      runId,
      organizationId,
    );
    expect(capturedContext).toEqual(job.data.actionContext);
  });

  describe('strategy and campaign paths', () => {
    let campaignExecutionService: {
      checkQuota: ReturnType<typeof vi.fn>;
      updateCreditsUsed: ReturnType<typeof vi.fn>;
    };
    let strategiesService: {
      incrementFailures: ReturnType<typeof vi.fn>;
      pauseStrategy: ReturnType<typeof vi.fn>;
      recordRun: ReturnType<typeof vi.fn>;
      requireManualReactivation: ReturnType<typeof vi.fn>;
      resetFailures: ReturnType<typeof vi.fn>;
    };
    let strategyProcessor: AgentRunProcessor;

    const baseData = {
      objective: 'Generate weekly content.',
      organizationId: 'org-1',
      runId: 'run-1',
      userId: 'user-1',
    };

    beforeEach(() => {
      campaignExecutionService = {
        checkQuota: vi.fn().mockResolvedValue(undefined),
        updateCreditsUsed: vi.fn().mockResolvedValue(undefined),
      };
      strategiesService = {
        incrementFailures: vi.fn().mockResolvedValue(1),
        pauseStrategy: vi.fn().mockResolvedValue(undefined),
        recordRun: vi.fn().mockResolvedValue(undefined),
        requireManualReactivation: vi.fn().mockResolvedValue(undefined),
        resetFailures: vi.fn().mockResolvedValue(undefined),
      };

      strategyProcessor = new AgentRunProcessor(
        logger as never,
        agentRunsService as never,
        agentOrchestratorService as never,
        strategiesService as never,
        agentStrategyAutopilotService as never,
        agentStreamPublisherService as never,
        voiceGenerationService as never,
        campaignExecutionService as never,
        undefined,
      );

      agentRunsService.start.mockResolvedValue({ label: 'Run', metadata: {} });
      agentRunsService.complete.mockResolvedValue(null);
    });

    it('throws when the run record is missing', async () => {
      agentRunsService.start.mockResolvedValue(null);
      const job = { data: { ...baseData } } as Job<AgentRunJobData>;

      await expect(strategyProcessor.process(job)).rejects.toThrow(
        'Agent run run-1 not found',
      );
      expect(agentRunsService.fail).toHaveBeenCalledWith(
        'run-1',
        'org-1',
        'Agent run run-1 not found',
      );
      expect(
        agentStreamPublisherService.publishRunComplete,
      ).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    });

    it('executes strategies through the autopilot path and records run metrics', async () => {
      const job = {
        data: { ...baseData, strategyId: 'strategy-1' },
      } as Job<AgentRunJobData>;
      agentStrategyAutopilotService.executeQueuedRun.mockResolvedValue({
        contentGenerated: 4,
        creditsUsed: 12,
        summary: 'Autopilot produced 4 drafts.',
      });
      agentRunsService.complete.mockResolvedValue({
        completedAt: new Date('2026-08-09T01:00:00Z'),
        startedAt: new Date('2026-08-09T00:00:00Z'),
        toolCalls: [{ status: 'completed' }, { status: 'failed' }],
      });

      await strategyProcessor.process(job);

      expect(
        agentStrategyAutopilotService.executeQueuedRun,
      ).toHaveBeenCalledWith({
        defaultModel: undefined,
        organizationId: 'org-1',
        runId: 'run-1',
        strategyId: 'strategy-1',
        userId: 'user-1',
      });
      expect(agentOrchestratorService.chat).not.toHaveBeenCalled();
      expect(agentRunsService.complete).toHaveBeenCalledWith(
        'run-1',
        'org-1',
        'Autopilot produced 4 drafts.',
      );
      expect(strategiesService.recordRun).toHaveBeenCalledWith(
        'strategy-1',
        expect.objectContaining({
          contentGenerated: 4,
          creditsUsed: 12,
          threadId: 'run-1',
        }),
      );
      expect(strategiesService.resetFailures).toHaveBeenCalledWith(
        'strategy-1',
      );
    });

    it('updates campaign credits and checks quota for campaign runs', async () => {
      const job = {
        data: { ...baseData, campaignId: 'campaign-1' },
      } as Job<AgentRunJobData>;
      agentOrchestratorService.chat.mockResolvedValue({
        content: 'Campaign content generated.',
      });
      agentRunsService.complete.mockResolvedValue({ creditsUsed: 7 });

      await strategyProcessor.process(job);

      expect(campaignExecutionService.updateCreditsUsed).toHaveBeenCalledWith(
        'campaign-1',
        'org-1',
        7,
      );
      expect(campaignExecutionService.checkQuota).toHaveBeenCalledWith(
        'campaign-1',
        'org-1',
      );
    });

    it('skips the credits update when no credits were used', async () => {
      const job = {
        data: { ...baseData, campaignId: 'campaign-1' },
      } as Job<AgentRunJobData>;
      agentOrchestratorService.chat.mockResolvedValue('not-an-object');
      agentRunsService.complete.mockResolvedValue({ creditsUsed: 0 });

      await strategyProcessor.process(job);

      expect(campaignExecutionService.updateCreditsUsed).not.toHaveBeenCalled();
      expect(campaignExecutionService.checkQuota).toHaveBeenCalledWith(
        'campaign-1',
        'org-1',
      );
    });

    it('fails the run and increments strategy failures on error', async () => {
      const job = {
        data: { ...baseData, strategyId: 'strategy-1' },
      } as Job<AgentRunJobData>;
      agentStrategyAutopilotService.executeQueuedRun.mockRejectedValue(
        new Error('autopilot failed'),
      );
      strategiesService.incrementFailures.mockResolvedValue(2);

      await expect(strategyProcessor.process(job)).rejects.toThrow(
        'autopilot failed',
      );

      expect(agentRunsService.fail).toHaveBeenCalledWith(
        'run-1',
        'org-1',
        'autopilot failed',
      );
      expect(strategiesService.pauseStrategy).not.toHaveBeenCalled();
      expect(
        strategiesService.requireManualReactivation,
      ).not.toHaveBeenCalled();
    });

    it('auto-pauses the strategy after three consecutive failures', async () => {
      const job = {
        data: { ...baseData, strategyId: 'strategy-1' },
      } as Job<AgentRunJobData>;
      agentStrategyAutopilotService.executeQueuedRun.mockRejectedValue(
        new Error('autopilot failed'),
      );
      strategiesService.incrementFailures.mockResolvedValue(3);

      await expect(strategyProcessor.process(job)).rejects.toThrow(
        'autopilot failed',
      );

      expect(strategiesService.pauseStrategy).toHaveBeenCalledWith(
        'strategy-1',
      );
      expect(
        strategiesService.requireManualReactivation,
      ).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('requires manual reactivation after five consecutive failures', async () => {
      const job = {
        data: { ...baseData, strategyId: 'strategy-1' },
      } as Job<AgentRunJobData>;
      agentStrategyAutopilotService.executeQueuedRun.mockRejectedValue(
        'string failure',
      );
      strategiesService.incrementFailures.mockResolvedValue(5);

      await expect(strategyProcessor.process(job)).rejects.toBe(
        'string failure',
      );

      expect(agentRunsService.fail).toHaveBeenCalledWith(
        'run-1',
        'org-1',
        'string failure',
      );
      expect(strategiesService.requireManualReactivation).toHaveBeenCalledWith(
        'strategy-1',
      );
      expect(strategiesService.pauseStrategy).not.toHaveBeenCalled();
    });

    it('derives the summary from a top-level summary string', async () => {
      const job = { data: { ...baseData } } as Job<AgentRunJobData>;
      agentOrchestratorService.chat.mockResolvedValue({
        summary: '  Summary wins.  ',
        threadId: 'not-an-object-id',
      });

      await strategyProcessor.process(job);

      expect(agentRunsService.complete).toHaveBeenCalledWith(
        'run-1',
        'org-1',
        'Summary wins.',
      );
      // threadId is not a 24-char hex id, so no patch happens
      expect(agentRunsService.patch).not.toHaveBeenCalled();
    });

    it('completes without a summary when the result is not an object', async () => {
      const job = {
        data: { ...baseData, objective: undefined },
      } as unknown as Job<AgentRunJobData>;
      agentOrchestratorService.chat.mockResolvedValue(undefined);

      await strategyProcessor.process(job);

      expect(agentOrchestratorService.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          content:
            'Execute proactive content generation based on strategy configuration.',
        }),
        expect.objectContaining({ organizationId: 'org-1', runId: 'run-1' }),
      );
      expect(agentRunsService.complete).toHaveBeenCalledWith(
        'run-1',
        'org-1',
        undefined,
      );
    });
  });

  describe('workspace task rollup', () => {
    const baseData = {
      objective: 'Generate weekly content.',
      organizationId: 'org-1',
      runId: 'run-1',
      userId: 'user-1',
    };

    beforeEach(() => {
      agentOrchestratorService.chat.mockResolvedValue({});
    });

    it('notifies the task orchestrator on start and completion for workspace-backed runs', async () => {
      agentRunsService.start.mockResolvedValue({
        label: 'Run',
        metadata: { workspaceTaskId: 'task-1' },
      });
      agentRunsService.complete.mockResolvedValue({
        metadata: { workspaceTaskId: 'task-1' },
      });
      const job = { data: { ...baseData } } as Job<AgentRunJobData>;

      await processor.process(job);

      expect(taskOrchestratorService.handleRunStarted).toHaveBeenCalledWith(
        'run-1',
        'org-1',
      );
      expect(taskOrchestratorService.handleRunCompletion).toHaveBeenCalledWith(
        'run-1',
        'org-1',
      );
    });

    it('leaves the task orchestrator alone when the run is not workspace-backed', async () => {
      agentRunsService.start.mockResolvedValue({ label: 'Run', metadata: {} });
      agentRunsService.complete.mockResolvedValue({ metadata: {} });
      const job = { data: { ...baseData } } as Job<AgentRunJobData>;

      await processor.process(job);

      expect(taskOrchestratorService.handleRunStarted).not.toHaveBeenCalled();
      expect(
        taskOrchestratorService.handleRunCompletion,
      ).not.toHaveBeenCalled();
    });

    it('swallows and logs a rollup failure instead of failing the run', async () => {
      agentRunsService.start.mockResolvedValue({
        label: 'Run',
        metadata: { workspaceTaskId: 'task-1' },
      });
      agentRunsService.complete.mockResolvedValue({
        metadata: { workspaceTaskId: 'task-1' },
      });
      taskOrchestratorService.handleRunStarted.mockRejectedValue(
        new Error('start rollup exploded'),
      );
      taskOrchestratorService.handleRunCompletion.mockRejectedValue(
        new Error('completion rollup exploded'),
      );
      const job = { data: { ...baseData } } as Job<AgentRunJobData>;

      await expect(processor.process(job)).resolves.toBeUndefined();
      // The rejections are handled off the await path.
      await Promise.resolve();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('workspace task run-start update failed'),
        expect.any(Error),
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('workspace task rollup failed'),
        expect.any(Error),
      );
      expect(
        agentStreamPublisherService.publishRunComplete,
      ).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    });

    it('rolls the workspace task up when the run itself fails', async () => {
      agentRunsService.start.mockRejectedValue(new Error('start blew up'));
      const job = { data: { ...baseData } } as Job<AgentRunJobData>;

      await expect(processor.process(job)).rejects.toThrow('start blew up');

      expect(taskOrchestratorService.handleRunCompletion).toHaveBeenCalledWith(
        'run-1',
        'org-1',
      );
      expect(agentRunsService.fail).toHaveBeenCalledWith(
        'run-1',
        'org-1',
        'start blew up',
      );
    });

    it('logs a rollup failure raised while handling a failed run', async () => {
      agentRunsService.start.mockRejectedValue(new Error('start blew up'));
      taskOrchestratorService.handleRunCompletion.mockRejectedValue(
        new Error('rollup exploded'),
      );
      const job = { data: { ...baseData } } as Job<AgentRunJobData>;

      await expect(processor.process(job)).rejects.toThrow('start blew up');
      await Promise.resolve();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'workspace task rollup failed (on run failure)',
        ),
        expect.any(Error),
      );
    });
  });
});
