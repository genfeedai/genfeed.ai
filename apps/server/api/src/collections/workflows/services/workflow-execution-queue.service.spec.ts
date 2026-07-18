import {
  WorkflowExecutionQueueService,
  workflowSchedulerId,
} from '@api/collections/workflows/services/workflow-execution-queue.service';
import type {
  DelayResumeJobData,
  TriggerEvent,
} from '@api/collections/workflows/services/workflow-executor.service';
import { buildSystemWorkflowMetadata } from '@api/collections/workflows/system-workflow.contract';
import { ActionOrigin, WorkflowStatus } from '@genfeedai/enums';
import { runWithActionOrigin } from '@genfeedai/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockQueue() {
  return {
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    getJobs: vi.fn().mockResolvedValue([]),
    removeJobScheduler: vi.fn().mockResolvedValue(true),
    upsertJobScheduler: vi.fn().mockResolvedValue({ id: 'scheduled-job-1' }),
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
          actionContext: { origin: ActionOrigin.UNKNOWN },
          triggerEvent: event,
          type: 'trigger',
        },
        expect.objectContaining({
          attempts: 1,
          removeOnComplete: 200,
        }),
      );
    });

    it('propagates MCP action context with a trigger job', async () => {
      await runWithActionOrigin(
        {
          actorUserId: 'user-1',
          apiKeyId: 'key-1',
          origin: ActionOrigin.MCP,
        },
        () => service.queueTriggerEvent(createTriggerEvent()),
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        'trigger',
        expect.objectContaining({
          actionContext: {
            actorUserId: 'user-1',
            apiKeyId: 'key-1',
            origin: ActionOrigin.MCP,
          },
        }),
        expect.anything(),
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

    it('should use a caller-provided job id to deduplicate trigger retries', async () => {
      await service.queueTriggerEvent(createTriggerEvent(), {
        jobId: 'social-comment-trigger-org-1-message-1',
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'trigger',
        expect.anything(),
        expect.objectContaining({
          jobId: 'social-comment-trigger-org-1-message-1',
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
          actionContext: { origin: ActionOrigin.UNKNOWN },
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

  describe('upsertWorkflowScheduler', () => {
    it('should upsert a job scheduler keyed on the workflow id', async () => {
      await service.upsertWorkflowScheduler({
        cronExpression: '0 7 * * *',
        timezone: 'Europe/Amsterdam',
        workflowId: 'wf-1',
      });

      expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'workflow-schedule:wf-1',
        { pattern: '0 7 * * *', tz: 'Europe/Amsterdam' },
        {
          data: {
            actionContext: { origin: ActionOrigin.WORKFLOW },
            type: 'scheduled-fire',
            workflowId: 'wf-1',
          },
          name: 'scheduled-fire',
          opts: expect.objectContaining({ attempts: 1 }),
        },
      );
    });

    it('should use the same scheduler id when two producers upsert the same workflow', async () => {
      // Two API replicas sharing the queue converge on ONE scheduler id, which
      // is what makes BullMQ dedupe fires across replicas.
      const replicaA = new (
        WorkflowExecutionQueueService as unknown as new (
          ...args: unknown[]
        ) => WorkflowExecutionQueueService
      )(mockQueue, createMockLogger());
      const replicaB = new (
        WorkflowExecutionQueueService as unknown as new (
          ...args: unknown[]
        ) => WorkflowExecutionQueueService
      )(mockQueue, createMockLogger());

      await replicaA.upsertWorkflowScheduler({
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        workflowId: 'wf-1',
      });
      await replicaB.upsertWorkflowScheduler({
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        workflowId: 'wf-1',
      });

      const schedulerIds = mockQueue.upsertJobScheduler.mock.calls.map(
        (call) => call[0],
      );
      expect(schedulerIds).toEqual([
        workflowSchedulerId('wf-1'),
        workflowSchedulerId('wf-1'),
      ]);
    });
  });

  describe('removeWorkflowScheduler', () => {
    it('should remove the job scheduler for the workflow', async () => {
      await service.removeWorkflowScheduler('wf-1');

      expect(mockQueue.removeJobScheduler).toHaveBeenCalledWith(
        'workflow-schedule:wf-1',
      );
    });
  });

  describe('syncWorkflowScheduler', () => {
    it('should upsert an active enabled workflow schedule', async () => {
      await service.syncWorkflowScheduler({
        id: 'wf-1',
        isDeleted: false,
        isScheduleEnabled: true,
        schedule: '0 7 * * *',
        status: WorkflowStatus.ACTIVE,
        timezone: 'Europe/Amsterdam',
      });

      expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'workflow-schedule:wf-1',
        { pattern: '0 7 * * *', tz: 'Europe/Amsterdam' },
        expect.objectContaining({
          data: { type: 'scheduled-fire', workflowId: 'wf-1' },
          name: 'scheduled-fire',
        }),
      );
      expect(mockQueue.removeJobScheduler).not.toHaveBeenCalled();
    });

    it('should remove instead of upserting protected system workflow rows', async () => {
      await service.syncWorkflowScheduler({
        id: 'wf-system',
        isDeleted: false,
        isScheduleEnabled: true,
        metadata: {
          systemWorkflow: buildSystemWorkflowMetadata({
            canonicalId: 'scheduled-post-publishing',
          }),
        },
        schedule: '*/15 * * * *',
        status: WorkflowStatus.ACTIVE,
        timezone: 'UTC',
      });

      expect(mockQueue.upsertJobScheduler).not.toHaveBeenCalled();
      expect(mockQueue.removeJobScheduler).toHaveBeenCalledWith(
        'workflow-schedule:wf-system',
      );
    });

    it('should remove when a row is no longer schedulable', async () => {
      await service.syncWorkflowScheduler({
        id: 'wf-disabled',
        isDeleted: false,
        isScheduleEnabled: false,
        schedule: '0 7 * * *',
        status: WorkflowStatus.ACTIVE,
        timezone: 'UTC',
      });

      expect(mockQueue.upsertJobScheduler).not.toHaveBeenCalled();
      expect(mockQueue.removeJobScheduler).toHaveBeenCalledWith(
        'workflow-schedule:wf-disabled',
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
