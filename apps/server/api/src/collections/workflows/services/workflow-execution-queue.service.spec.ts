import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type {
  DelayResumeJobData,
  TriggerEvent,
} from '@api/collections/workflows/services/workflow-executor.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockQueue() {
  return {
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    getJobs: vi.fn().mockResolvedValue([]),
  };
}

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function createTriggerEvent(): TriggerEvent {
  return {
    data: { postId: 'post-1' },
    organizationId: 'org-1',
    platform: 'twitter',
    type: 'mentionTrigger',
    userId: 'user-1',
  };
}

function createDelayResumeData(): DelayResumeJobData {
  return {
    delayNodeId: 'delay-1',
    executionId: 'exec-1',
    nodeOutputCache: { 'trigger-1': { data: 'test' } },
    organizationId: 'org-1',
    remainingNodeIds: ['action-1'],
    triggerEvent: createTriggerEvent(),
    userId: 'user-1',
    workflowId: 'wf-1',
  };
}

describe('WorkflowExecutionQueueService', () => {
  let service: WorkflowExecutionQueueService;
  let mockQueue: ReturnType<typeof createMockQueue>;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockQueue = createMockQueue();
    mockLogger = createMockLogger();

    service = new (
      WorkflowExecutionQueueService as unknown as new (
        ...args: unknown[]
      ) => WorkflowExecutionQueueService
    )(mockQueue, mockLogger);
  });

  describe('queueTriggerEvent', () => {
    it('should add a trigger job to the queue', async () => {
      const event = createTriggerEvent();

      const jobId = await service.queueTriggerEvent(event);

      expect(jobId).toBe('job-123');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'trigger',
        {
          triggerEvent: event,
          type: 'trigger',
        },
        expect.objectContaining({
          attempts: 1,
          removeOnComplete: 200,
        }),
      );
    });

    it('should log the queued event', async () => {
      await service.queueTriggerEvent(createTriggerEvent());

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('queued trigger event'),
        expect.objectContaining({
          jobId: 'job-123',
          triggerType: 'mentionTrigger',
        }),
      );
    });
  });

  describe('queueDelayedResume', () => {
    it('should add a delayed resume job with correct delay', async () => {
      const data = createDelayResumeData();
      const delayMs = 1800000; // 30 minutes

      const jobId = await service.queueDelayedResume(data, delayMs);

      expect(jobId).toBe('job-123');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'delay-resume',
        {
          delayResumeData: data,
          type: 'delay-resume',
        },
        expect.objectContaining({
          attempts: 3,
          delay: 1800000,
        }),
      );
    });

    it('should use exponential backoff for retries', async () => {
      await service.queueDelayedResume(createDelayResumeData(), 5000);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'delay-resume',
        expect.anything(),
        expect.objectContaining({
          backoff: { delay: 5000, type: 'exponential' },
        }),
      );
    });

    it('should log the queued delay resume', async () => {
      await service.queueDelayedResume(createDelayResumeData(), 60000);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('queued delay resume'),
        expect.objectContaining({
          delayMs: 60000,
          executionId: 'exec-1',
          workflowId: 'wf-1',
        }),
      );
    });
  });

  describe('getPendingJobs', () => {
    it('should return pending jobs for a specific workflow', async () => {
      mockQueue.getJobs.mockResolvedValue([
        {
          data: {
            delayResumeData: { workflowId: 'wf-1' },
            type: 'delay-resume',
          },
          delay: 5000,
          id: 'job-1',
        },
        {
          data: {
            delayResumeData: { workflowId: 'wf-2' },
            type: 'delay-resume',
          },
          delay: 10000,
          id: 'job-2',
        },
        {
          data: {
            triggerEvent: { organizationId: 'org-1' },
            type: 'trigger',
          },
          id: 'job-3',
        },
      ]);

      const jobs = await service.getPendingJobs('wf-1');

      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe('job-1');
      expect(jobs[0].type).toBe('delay-resume');
    });

    it('should return empty array when no matching jobs', async () => {
      mockQueue.getJobs.mockResolvedValue([]);

      const jobs = await service.getPendingJobs('wf-nonexistent');

      expect(jobs).toEqual([]);
    });

    it('should query waiting, delayed, and active jobs', async () => {
      await service.getPendingJobs('wf-1');

      expect(mockQueue.getJobs).toHaveBeenCalledWith([
        'waiting',
        'delayed',
        'active',
      ]);
    });
  });
});
