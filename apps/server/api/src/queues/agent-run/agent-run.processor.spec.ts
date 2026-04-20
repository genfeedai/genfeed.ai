import { AgentRunProcessor } from '@api/queues/agent-run/agent-run.processor';
import type { AgentRunJobData } from '@api/queues/agent-run/agent-run-queue.service';
import { AgentRunStatus } from '@genfeedai/enums';
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
    mergeMetadata: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
  };
  let agentOrchestratorService: {
    chat: ReturnType<typeof vi.fn>;
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
      mergeMetadata: vi.fn(),
      patch: vi.fn(),
      start: vi.fn(),
    };

    agentOrchestratorService = {
      chat: vi.fn(),
    };

    agentStrategiesService = {
      incrementFailures: vi.fn(),
      recordRun: vi.fn(),
      resetFailures: vi.fn(),
    };

    agentStrategyAutopilotService = {
      executeQueuedRun: vi.fn(),
    };

    agentStreamPublisherService = {
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
      undefined as never,
      taskOrchestratorService as never,
    );
  });

  it('persists thread linkage and derives summary from assistant message content', async () => {
    const runId = '507f191e810c19729de860ee'.toString();
    const threadId = '507f191e810c19729de860ee'.toString();
    const organizationId = '507f191e810c19729de860ee'.toString();
    const userId = '507f191e810c19729de860ee'.toString();

    const job = {
      data: {
        objective: 'Find TikTok trends for my brand.',
        organizationId,
        runId,
        userId,
      },
    } as Job<AgentRunJobData>;

    agentRunsService.start.mockResolvedValue({
      label: 'Find TikTok trends for my brand.',
      metadata: { workspaceTaskId: 'workspace-task-1' },
      status: AgentRunStatus.RUNNING,
    });

    agentOrchestratorService.chat.mockResolvedValue({
      message: {
        content: 'Found 20 TikTok trends for review.',
      },
      threadId,
    });

    agentRunsService.complete.mockResolvedValue({
      completedAt: new Date(),
      creditsUsed: 0,
      metadata: { workspaceTaskId: 'workspace-task-1' },
      startedAt: new Date(),
      status: AgentRunStatus.COMPLETED,
      toolCalls: [],
    });

    await processor.process(job);

    expect(agentRunsService.complete).toHaveBeenCalledWith(
      runId,
      organizationId,
      'Found 20 TikTok trends for review.',
    );
    expect(agentRunsService.patch).toHaveBeenCalledTimes(1);
    expect(
      (
        agentRunsService.patch.mock.calls[0]?.[1] as { thread: string }
      ).thread.toString(),
    ).toBe(threadId);
    expect(agentRunsService.mergeMetadata).toHaveBeenCalledWith(
      runId,
      organizationId,
      { threadId },
    );
    expect(taskOrchestratorService.handleRunCompletion).toHaveBeenCalledWith(
      runId,
      organizationId,
    );
  });
});
