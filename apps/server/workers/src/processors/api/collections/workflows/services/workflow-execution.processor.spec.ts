import type { WorkflowExecutionJobData } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { getActionOriginContext } from '@api/index';
import { ActionOrigin, WorkflowExecutionStatus } from '@genfeedai/contracts';
import { WorkflowExecutionProcessor } from '@workers/processors/api/collections/workflows/services/workflow-execution.processor';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function createMockExecutorService() {
  return {
    continueExistingExecution: vi.fn().mockResolvedValue({
      executionId: 'exec-1',
      nodeResults: [],
      startedAt: new Date(),
      status: WorkflowExecutionStatus.COMPLETED,
      totalCreditsUsed: 0,
      workflowId: 'wf-1',
    }),
    handleTriggerEvent: vi.fn().mockResolvedValue([
      {
        executionId: 'exec-1',
        nodeResults: [],
        startedAt: new Date(),
        status: WorkflowExecutionStatus.COMPLETED,
        totalCreditsUsed: 0,
        workflowId: 'wf-1',
      },
    ]),
    resumeAfterDelay: vi.fn().mockResolvedValue({
      executionId: 'exec-1',
      nodeResults: [],
      startedAt: new Date(),
      status: WorkflowExecutionStatus.COMPLETED,
      totalCreditsUsed: 0,
      workflowId: 'wf-1',
    }),
  };
}

function createMockQueueService() {
  return {
    queueDelayedResume: vi.fn().mockResolvedValue('job-123'),
    queueTriggerEvent: vi.fn().mockResolvedValue('job-456'),
  };
}

function createMockSchedulerService() {
  return {
    executeScheduledWorkflow: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockSystemWorkflowRunner() {
  return {
    runWorkflow: vi.fn().mockResolvedValue({
      provenance: {
        executionId: 'exec-failure',
        workflowId: 'wf-failure',
        workflowLabel: 'Failure workflow',
      },
      result: { status: 'failed' },
    }),
    startWorkflow: vi.fn().mockResolvedValue({
      execution: {
        executionId: 'exec-system',
        nodeResults: [],
        startedAt: new Date(),
        status: WorkflowExecutionStatus.COMPLETED,
        totalCreditsUsed: 0,
        workflowId: 'wf-system',
      },
      provenance: {
        executionId: 'exec-system',
        workflowId: 'wf-system',
        workflowLabel: 'System workflow',
      },
      userId: 'user-1',
    }),
  };
}

function createMockJob(
  data: WorkflowExecutionJobData,
  overrides: Record<string, unknown> = {},
) {
  return {
    attemptsMade: 0,
    data,
    id: 'job-1',
    name: data.type,
    opts: { attempts: 1 },
    updateData: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('WorkflowExecutionProcessor', () => {
  let processor: WorkflowExecutionProcessor;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockExecutor: ReturnType<typeof createMockExecutorService>;
  let mockQueue: ReturnType<typeof createMockQueueService>;
  let mockScheduler: ReturnType<typeof createMockSchedulerService>;
  let mockSystemWorkflowRunner: ReturnType<
    typeof createMockSystemWorkflowRunner
  >;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockExecutor = createMockExecutorService();
    mockQueue = createMockQueueService();
    mockScheduler = createMockSchedulerService();
    mockSystemWorkflowRunner = createMockSystemWorkflowRunner();

    processor = new (
      WorkflowExecutionProcessor as unknown as new (
        ...args: unknown[]
      ) => WorkflowExecutionProcessor
    )(
      mockLogger,
      mockExecutor,
      mockQueue,
      mockScheduler,
      mockSystemWorkflowRunner,
    );
  });

  describe('process - system workflow jobs', () => {
    it('resolves the queued canonical identity through the system workflow runner', async () => {
      const input = {
        actionType: 'clip-continuity',
        canonicalId: 'clip-continuity:v1:1',
        organizationId: 'org-1',
        source: 'clip-generation-completion',
      };

      await expect(
        processor.process(
          createMockJob({
            systemRun: { input },
            type: 'system-run',
          }) as never,
        ),
      ).resolves.toEqual({
        executionId: 'exec-system',
        status: WorkflowExecutionStatus.COMPLETED,
        workflowId: 'wf-system',
      });
      expect(mockSystemWorkflowRunner.startWorkflow).toHaveBeenCalledWith(
        input,
      );
    });

    it('accepts a durable review-gate pause without projecting failure', async () => {
      mockSystemWorkflowRunner.startWorkflow.mockResolvedValueOnce({
        execution: {
          executionId: 'exec-paused',
          nodeResults: [],
          startedAt: new Date(),
          status: WorkflowExecutionStatus.RUNNING,
          totalCreditsUsed: 0,
          workflowId: 'wf-system',
        },
        provenance: {
          executionId: 'exec-paused',
          workflowId: 'wf-system',
          workflowLabel: 'Clip factory',
        },
        userId: 'user-1',
      });
      const input = {
        actionType: 'clip.factory',
        canonicalId: 'clip.factory',
        organizationId: 'org-1',
        source: 'clip-analysis-completion',
      };

      await expect(
        processor.process(
          createMockJob({
            systemRun: {
              input,
            },
            type: 'system-run',
          }) as never,
        ),
      ).resolves.toEqual({
        executionId: 'exec-paused',
        status: WorkflowExecutionStatus.RUNNING,
        workflowId: 'wf-system',
      });
    });

    it('runs a precreated parent execution on the first queue attempt', async () => {
      const input = {
        actionType: 'campaign.reply.execute-target',
        canonicalId: 'campaign.reply.execute-target',
        organizationId: 'org-1',
        source: 'workflow.for-each',
        userId: 'user-1',
      };
      mockExecutor.continueExistingExecution.mockResolvedValueOnce({
        executionId: 'exec-prior',
        nodeResults: [],
        startedAt: new Date(),
        status: WorkflowExecutionStatus.COMPLETED,
        totalCreditsUsed: 0,
        workflowId: 'wf-system',
      });

      await expect(
        processor.process(
          createMockJob(
            {
              systemRun: {
                input,
                priorExecution: {
                  executionId: 'exec-prior',
                  status: WorkflowExecutionStatus.PENDING,
                  userId: 'user-1',
                  workflowId: 'wf-system',
                  workflowLabel: 'Campaign reply',
                },
              },
              type: 'system-run',
            },
            { attemptsMade: 0 },
          ) as never,
        ),
      ).resolves.toMatchObject({
        executionId: 'exec-prior',
        status: WorkflowExecutionStatus.COMPLETED,
      });
      expect(mockSystemWorkflowRunner.startWorkflow).not.toHaveBeenCalled();
      expect(mockExecutor.continueExistingExecution).toHaveBeenCalledWith(
        'exec-prior',
        expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      );
    });

    it('does not compensate a failed workflow before its terminal queue attempt', async () => {
      mockSystemWorkflowRunner.startWorkflow.mockRejectedValueOnce(
        new Error('Transient QA failure'),
      );
      const input = {
        actionType: 'clip-continuity',
        canonicalId: 'clip.continuity',
        organizationId: 'org-1',
        source: 'clip-generation-completion',
        userId: 'user-1',
      };

      await expect(
        processor.process(
          createMockJob(
            {
              systemRun: {
                failureWorkflow: {
                  canonicalId: 'clip.continuity.failure',
                  inputValues: { projectId: 'project-1' },
                },
                input,
              },
              type: 'system-run',
            },
            { opts: { attempts: 2 } },
          ) as never,
        ),
      ).rejects.toThrow('Transient QA failure');
      expect(mockSystemWorkflowRunner.runWorkflow).not.toHaveBeenCalled();
    });

    it('runs registered failure compensation on the terminal queue attempt', async () => {
      mockSystemWorkflowRunner.startWorkflow.mockRejectedValueOnce(
        new Error('QA failed'),
      );
      const input = {
        actionType: 'clip-continuity',
        canonicalId: 'clip.continuity',
        organizationId: 'org-1',
        source: 'clip-generation-completion',
        userId: 'user-1',
      };

      await expect(
        processor.process(
          createMockJob(
            {
              systemRun: {
                failureWorkflow: {
                  canonicalId: 'clip.continuity.failure',
                  inputValues: { projectId: 'project-1' },
                },
                input,
              },
              type: 'system-run',
            },
            { attemptsMade: 1, opts: { attempts: 2 } },
          ) as never,
        ),
      ).rejects.toThrow('QA failed');
      expect(mockSystemWorkflowRunner.runWorkflow).toHaveBeenCalledWith({
        actionType: 'clip.continuity.failure',
        canonicalId: 'clip.continuity.failure',
        inputValues: { projectId: 'project-1' },
        metadata: {
          failedCanonicalId: 'clip.continuity',
          failedJobId: 'job-1',
        },
        organizationId: 'org-1',
        source: 'workflow-failure:clip.continuity',
        userId: 'user-1',
      });
    });
  });

  describe('process - trigger jobs', () => {
    it('should handle trigger events via executor service', async () => {
      let capturedContext:
        | ReturnType<typeof getActionOriginContext>
        | undefined;
      mockExecutor.handleTriggerEvent.mockImplementation(async () => {
        capturedContext = getActionOriginContext();
        return [
          {
            executionId: 'exec-1',
            nodeResults: [],
            startedAt: new Date(),
            status: WorkflowExecutionStatus.COMPLETED,
            totalCreditsUsed: 0,
            workflowId: 'wf-1',
          },
        ];
      });
      const job = createMockJob({
        actionContext: {
          actorUserId: 'user-1',
          apiKeyId: 'key-1',
          origin: ActionOrigin.MCP,
        },
        triggerEvent: {
          data: { postId: 'post-1' },
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        type: 'trigger',
      });

      const result = await processor.process(job as never);

      expect(mockExecutor.handleTriggerEvent).toHaveBeenCalledWith(
        job.data.triggerEvent,
      );
      expect(result).toEqual(
        expect.objectContaining({
          executionCount: 1,
        }),
      );
      expect(capturedContext).toEqual(job.data.actionContext);
    });

    it('should throw when trigger event data is missing', async () => {
      const job = createMockJob({
        type: 'trigger',
      });

      await expect(processor.process(job as never)).rejects.toThrow(
        'missing triggerEvent',
      );
    });

    it('continues prior executions on BullMQ retry instead of re-triggering (#2359)', async () => {
      mockExecutor.continueExistingExecution
        .mockResolvedValueOnce({
          executionId: 'exec-1',
          nodeResults: [],
          startedAt: new Date(),
          status: WorkflowExecutionStatus.COMPLETED,
          totalCreditsUsed: 0,
          workflowId: 'wf-1',
        })
        .mockResolvedValueOnce({
          executionId: 'exec-2',
          nodeResults: [],
          startedAt: new Date(),
          status: WorkflowExecutionStatus.FAILED,
          totalCreditsUsed: 0,
          workflowId: 'wf-2',
        });

      const job = createMockJob(
        {
          priorExecutionIds: ['exec-1', 'exec-2'],
          triggerEvent: {
            data: {},
            organizationId: 'org-1',
            platform: 'twitter',
            type: 'mentionTrigger',
            userId: 'user-1',
          },
          type: 'trigger',
        },
        { attemptsMade: 1 },
      );

      const result = await processor.process(job as never);

      expect(mockExecutor.handleTriggerEvent).not.toHaveBeenCalled();
      expect(mockExecutor.continueExistingExecution).toHaveBeenCalledTimes(2);
      expect(mockExecutor.continueExistingExecution).toHaveBeenNthCalledWith(
        1,
        'exec-1',
        job.data.triggerEvent,
      );
      expect(result).toEqual(
        expect.objectContaining({
          continuedOnRetry: true,
          priorExecutionIds: ['exec-1', 'exec-2'],
          executionCount: 2,
        }),
      );
    });

    it('persists priorExecutionIds after the first trigger attempt', async () => {
      const job = createMockJob({
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        type: 'trigger',
      });

      await processor.process(job as never);

      expect(job.updateData).toHaveBeenCalledWith(
        expect.objectContaining({
          priorExecutionIds: ['exec-1'],
        }),
      );
    });

    it('falls through to handleTriggerEvent on retry without priorExecutionIds', async () => {
      const job = createMockJob(
        {
          triggerEvent: {
            data: {},
            organizationId: 'org-1',
            platform: 'twitter',
            type: 'mentionTrigger',
            userId: 'user-1',
          },
          type: 'trigger',
        },
        { attemptsMade: 2 },
      );

      await processor.process(job as never);

      expect(mockExecutor.handleTriggerEvent).toHaveBeenCalledTimes(1);
      expect(mockExecutor.continueExistingExecution).not.toHaveBeenCalled();
    });

    it('falls through when priorExecutionIds is an empty array on retry', async () => {
      const job = createMockJob(
        {
          priorExecutionIds: [],
          triggerEvent: {
            data: {},
            organizationId: 'org-1',
            platform: 'twitter',
            type: 'mentionTrigger',
            userId: 'user-1',
          },
          type: 'trigger',
        },
        { attemptsMade: 1 },
      );

      await processor.process(job as never);

      expect(mockExecutor.handleTriggerEvent).toHaveBeenCalledTimes(1);
      expect(mockExecutor.continueExistingExecution).not.toHaveBeenCalled();
    });

    it('schedules delay resume jobs when continuing prior executions on retry', async () => {
      const delayJobData = {
        delayNodeId: 'delay-1',
        executionId: 'exec-1',
        nodeOutputCache: {
          'delay-1': { delayMs: 60000, resumeAt: new Date().toISOString() },
        },
        organizationId: 'org-1',
        remainingNodeIds: ['action-1'],
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        userId: 'user-1',
        workflowId: 'wf-1',
      };

      mockExecutor.continueExistingExecution.mockResolvedValueOnce({
        _delayJobData: delayJobData,
        executionId: 'exec-1',
        nodeResults: [],
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
        totalCreditsUsed: 0,
        workflowId: 'wf-1',
      });

      const job = createMockJob(
        {
          priorExecutionIds: ['exec-1'],
          triggerEvent: delayJobData.triggerEvent,
          type: 'trigger',
        },
        { attemptsMade: 1 },
      );

      await processor.process(job as never);

      expect(mockQueue.queueDelayedResume).toHaveBeenCalledWith(
        delayJobData,
        expect.any(Number),
      );
      expect(mockExecutor.handleTriggerEvent).not.toHaveBeenCalled();
    });

    it('should detect and schedule delay resume jobs', async () => {
      const delayJobData = {
        delayNodeId: 'delay-1',
        executionId: 'exec-1',
        nodeOutputCache: {
          'delay-1': { delayMs: 60000, resumeAt: new Date().toISOString() },
        },
        organizationId: 'org-1',
        remainingNodeIds: ['action-1'],
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        userId: 'user-1',
        workflowId: 'wf-1',
      };

      mockExecutor.handleTriggerEvent.mockResolvedValue([
        {
          _delayJobData: delayJobData,
          executionId: 'exec-1',
          nodeResults: [],
          startedAt: new Date(),
          status: WorkflowExecutionStatus.RUNNING,
          totalCreditsUsed: 0,
          workflowId: 'wf-1',
        },
      ]);

      const job = createMockJob({
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        type: 'trigger',
      });

      await processor.process(job as never);

      expect(mockQueue.queueDelayedResume).toHaveBeenCalledWith(
        delayJobData,
        60000,
      );
    });
  });

  describe('process - delay resume jobs', () => {
    it('schedules the next durable delay when a resumed graph pauses again', async () => {
      const nextDelay = {
        delayNodeId: 'delay-2',
        executionId: 'exec-1',
        nodeOutputCache: {
          'delay-2': { delayMs: 45_000 },
        },
        organizationId: 'org-1',
        remainingNodeIds: ['publish'],
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'manual',
          type: 'manual',
          userId: 'user-1',
        },
        userId: 'user-1',
        workflowId: 'wf-1',
      };
      mockExecutor.resumeAfterDelay.mockResolvedValueOnce({
        _delayJobData: nextDelay,
        executionId: 'exec-1',
        nodeResults: [],
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
        totalCreditsUsed: 0,
        workflowId: 'wf-1',
      });

      await processor.process(
        createMockJob({
          delayResumeData: {
            ...nextDelay,
            delayNodeId: 'delay-1',
          },
          type: 'delay-resume',
        }) as never,
      );

      expect(mockQueue.queueDelayedResume).toHaveBeenCalledWith(
        nextDelay,
        45_000,
      );
    });
  });

  describe('process - delay-resume jobs', () => {
    it('should resume execution via executor service', async () => {
      const delayResumeData = {
        delayNodeId: 'delay-1',
        executionId: 'exec-1',
        nodeOutputCache: {},
        organizationId: 'org-1',
        remainingNodeIds: ['action-1'],
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        userId: 'user-1',
        workflowId: 'wf-1',
      };

      const job = createMockJob({
        delayResumeData,
        type: 'delay-resume',
      });

      const result = await processor.process(job as never);

      expect(mockExecutor.resumeAfterDelay).toHaveBeenCalledWith(
        delayResumeData,
      );
      expect(result).toEqual(
        expect.objectContaining({
          executionId: 'exec-1',
          status: WorkflowExecutionStatus.COMPLETED,
        }),
      );
    });

    it('should throw when delay resume data is missing', async () => {
      const job = createMockJob({
        type: 'delay-resume',
      });

      await expect(processor.process(job as never)).rejects.toThrow(
        'missing delayResumeData',
      );
    });
  });

  describe('process - scheduled-fire jobs', () => {
    it('should execute the scheduled workflow via the scheduler service', async () => {
      const job = createMockJob({
        type: 'scheduled-fire',
        workflowId: 'wf-1',
      });

      const result = await processor.process(job as never);

      expect(mockScheduler.executeScheduledWorkflow).toHaveBeenCalledWith(
        'wf-1',
      );
      expect(result).toEqual({ workflowId: 'wf-1' });
    });

    it('should throw when workflowId is missing', async () => {
      const job = createMockJob({
        type: 'scheduled-fire',
      });

      await expect(processor.process(job as never)).rejects.toThrow(
        'missing workflowId',
      );
      expect(mockScheduler.executeScheduledWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('process - unknown job types', () => {
    it('should throw for unknown job type', async () => {
      const job = createMockJob({
        type: 'unknown' as WorkflowExecutionJobData['type'],
      });

      await expect(processor.process(job as never)).rejects.toThrow(
        'Unknown workflow execution job type',
      );
    });
  });

  describe('delay calculation', () => {
    it('should calculate delay from delayMs in node output cache', async () => {
      const futureTime = new Date(Date.now() + 300000).toISOString();
      const delayJobData = {
        delayNodeId: 'delay-1',
        executionId: 'exec-1',
        nodeOutputCache: {
          'delay-1': { delayMs: 300000, resumeAt: futureTime },
        },
        organizationId: 'org-1',
        remainingNodeIds: ['action-1'],
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        userId: 'user-1',
        workflowId: 'wf-1',
      };

      mockExecutor.handleTriggerEvent.mockResolvedValue([
        {
          _delayJobData: delayJobData,
          executionId: 'exec-1',
          nodeResults: [],
          startedAt: new Date(),
          status: WorkflowExecutionStatus.RUNNING,
          totalCreditsUsed: 0,
          workflowId: 'wf-1',
        },
      ]);

      const job = createMockJob({
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        type: 'trigger',
      });

      await processor.process(job as never);

      expect(mockQueue.queueDelayedResume).toHaveBeenCalledWith(
        delayJobData,
        300000,
      );
    });
  });

  describe('logging', () => {
    it('should log job processing start', async () => {
      const job = createMockJob({
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        type: 'trigger',
      });

      await processor.process(job as never);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('processing job'),
        expect.objectContaining({
          jobId: 'job-1',
          type: 'trigger',
        }),
      );
    });

    it('should log errors on failure', async () => {
      mockExecutor.handleTriggerEvent.mockRejectedValue(
        new Error('Service unavailable'),
      );

      const job = createMockJob({
        triggerEvent: {
          data: {},
          organizationId: 'org-1',
          platform: 'twitter',
          type: 'mentionTrigger',
          userId: 'user-1',
        },
        type: 'trigger',
      });

      await expect(processor.process(job as never)).rejects.toThrow(
        'Service unavailable',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('job failed'),
        expect.any(Error),
        expect.objectContaining({
          jobId: 'job-1',
        }),
      );
    });
  });
});
