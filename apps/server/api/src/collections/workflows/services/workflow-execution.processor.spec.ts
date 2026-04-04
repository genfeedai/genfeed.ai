import { WorkflowExecutionProcessor } from '@api/collections/workflows/services/workflow-execution.processor';
import type { WorkflowExecutionJobData } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
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

function createMockJob(
  data: WorkflowExecutionJobData,
  overrides: Record<string, unknown> = {},
) {
  return {
    data,
    id: 'job-1',
    name: data.type,
    ...overrides,
  };
}

describe('WorkflowExecutionProcessor', () => {
  let processor: WorkflowExecutionProcessor;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockExecutor: ReturnType<typeof createMockExecutorService>;
  let mockQueue: ReturnType<typeof createMockQueueService>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockExecutor = createMockExecutorService();
    mockQueue = createMockQueueService();

    processor = new (
      WorkflowExecutionProcessor as unknown as new (
        ...args: unknown[]
      ) => WorkflowExecutionProcessor
    )(mockLogger, mockExecutor, mockQueue);
  });

  describe('process - trigger jobs', () => {
    it('should handle trigger events via executor service', async () => {
      const job = createMockJob({
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
    });

    it('should throw when trigger event data is missing', async () => {
      const job = createMockJob({
        type: 'trigger',
      });

      await expect(processor.process(job as never)).rejects.toThrow(
        'missing triggerEvent',
      );
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
