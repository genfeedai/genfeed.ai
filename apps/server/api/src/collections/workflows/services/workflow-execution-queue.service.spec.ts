import {
  WorkflowExecutionQueueService,
  workflowSchedulerId,
} from '@api/collections/workflows/services/workflow-execution-queue.service';
import type {
  DelayResumeJobData,
  TriggerEvent,
} from '@api/collections/workflows/services/workflow-executor.service';
import { buildSystemWorkflowMetadata } from '@api/collections/workflows/system-workflow.contract';
import {
  ActionOrigin,
  WorkflowExecutionStatus,
  WorkflowStatus,
} from '@genfeedai/contracts';
import {
  PLATFORM_SYSTEM_WORKFLOW_QUEUE,
  SystemWorkflowDispatchClass,
  WORKFLOW_BACKGROUND_QUEUE,
} from '@genfeedai/contracts/queue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockQueue() {
  return {
    add: vi.fn().mockResolvedValue({
      getState: vi.fn().mockResolvedValue('waiting'),
      id: 'job-123',
    }),
    getJob: vi.fn().mockResolvedValue(undefined),
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
  let mockPlatformQueue: ReturnType<typeof createMockQueue>;
  let mockBackgroundQueue: ReturnType<typeof createMockQueue>;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockQueue = createMockQueue();
    mockPlatformQueue = createMockQueue();
    mockBackgroundQueue = createMockQueue();
    mockLogger = createMockLogger();

    service = new (
      WorkflowExecutionQueueService as unknown as new (
        ...args: unknown[]
      ) => WorkflowExecutionQueueService
    )(mockQueue, mockPlatformQueue, mockBackgroundQueue, mockLogger);
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

  describe('queueSystemWorkflow', () => {
    it('queues registered workflow identity and runtime input without a graph', async () => {
      const input = {
        actionType: 'clip-continuity',
        canonicalId: 'clip-continuity:v1:1',
        inputValues: { projectId: 'project-1' },
        organizationId: 'org-1',
        source: 'clip-generation-completion',
      };

      await expect(
        service.queueSystemWorkflow(input, 'clip-continuity-project-1', {
          dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
          failureWorkflow: {
            canonicalId: 'clip.continuity.failure',
            inputValues: { projectId: 'project-1' },
          },
        }),
      ).resolves.toBe('job-123');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'system-run',
        {
          actionContext: { origin: ActionOrigin.UNKNOWN },
          systemRun: {
            failureWorkflow: {
              canonicalId: 'clip.continuity.failure',
              inputValues: { projectId: 'project-1' },
            },
            input,
          },
          type: 'system-run',
        },
        expect.objectContaining({
          attempts: 3,
          jobId: 'clip-continuity-project-1',
        }),
      );
    });

    it('supports durable delayed child workflow dispatch', async () => {
      const input = {
        actionType: 'campaign-reply-target',
        canonicalId: 'campaign-reply-target',
        inputValues: { targetId: 'target-1' },
        organizationId: 'org-1',
        source: 'workflow.for-each',
      };

      await service.queueSystemWorkflow(input, 'campaign-target-1', {
        delayMs: 30_000,
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'system-run',
        expect.anything(),
        expect.objectContaining({ delay: 30_000 }),
      );
    });

    it('queues an already-created immutable parent execution', async () => {
      const input = {
        actionType: 'workflow.batch.execute',
        canonicalId: 'workflow.batch.execute',
        organizationId: 'org-1',
        source: 'batch',
        userId: 'user-1',
      };
      const priorExecution = {
        executionId: 'parent-execution',
        status: WorkflowExecutionStatus.PENDING,
        userId: 'user-1',
        workflowId: 'hidden-parent',
        workflowLabel: 'Execute Workflow Batch',
      };

      await service.queueSystemWorkflow(input, 'system-workflow-parent', {
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
        priorExecution,
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'system-run',
        expect.objectContaining({
          systemRun: { input, priorExecution },
        }),
        expect.objectContaining({ jobId: 'system-workflow-parent' }),
      );
    });

    it('removes a stale terminal job under the same id before re-adding (#5162)', async () => {
      // A retried acceptance call resolves to the same execution row through
      // WorkflowExecutionsService.createExecution's idempotency-key upsert,
      // so it reuses the same jobId. If the prior BullMQ job under that id is
      // still sitting in Redis in a terminal state, `add()` would otherwise
      // silently hand back the stale job instead of enqueueing new work.
      const staleJob = {
        getState: vi.fn().mockResolvedValue('completed'),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      mockQueue.getJob.mockResolvedValueOnce(staleJob);
      const input = {
        actionType: 'agent.turn.execute',
        canonicalId: 'agent.turn.execute',
        organizationId: 'org-1',
        source: 'agent',
        userId: 'user-1',
      };

      await service.queueSystemWorkflow(input, 'system-workflow-exec-1', {
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
      });

      expect(staleJob.remove).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith(
        'system-run',
        expect.anything(),
        expect.objectContaining({ jobId: 'system-workflow-exec-1' }),
      );
    });

    it('skips re-adding and reports back when a job under the same id is still in flight', async () => {
      const inFlightJob = {
        getState: vi.fn().mockResolvedValue('active'),
        remove: vi.fn(),
      };
      mockQueue.getJob.mockResolvedValueOnce(inFlightJob);
      const input = {
        actionType: 'agent.turn.execute',
        canonicalId: 'agent.turn.execute',
        organizationId: 'org-1',
        source: 'agent',
        userId: 'user-1',
      };

      const jobId = await service.queueSystemWorkflow(
        input,
        'system-workflow-exec-2',
        { dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE },
      );

      expect(jobId).toBe('system-workflow-exec-2');
      expect(inFlightJob.remove).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('system workflow already queued'),
        expect.objectContaining({ state: 'active' }),
      );
    });

    it('routes a platform-sweep dispatch to the platform queue instead of the interactive one (#5162)', async () => {
      const input = {
        actionType: 'agent.autopilot.proactive',
        canonicalId: 'agent.autopilot.proactive',
        organizationId: 'org-1',
        source: 'PlatformWorkflowSchedulesService',
        userId: 'user-1',
      };

      await service.queueSystemWorkflow(input, 'system-workflow-exec-6', {
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
        usePlatformQueue: true,
      });

      expect(mockPlatformQueue.add).toHaveBeenCalledWith(
        'system-run',
        expect.anything(),
        expect.anything(),
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockBackgroundQueue.add).not.toHaveBeenCalled();
    });

    it('routes a background dispatch to the background queue instead of the interactive one (#5271)', async () => {
      const input = {
        actionType: 'rss-autopost-sweep',
        canonicalId: 'rss-autopost-sweep',
        organizationId: 'org-1',
        source: 'rss_autopost_sweep',
        userId: 'user-1',
      };

      await service.queueSystemWorkflow(input, 'system-workflow-exec-6b', {
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
      });

      expect(mockBackgroundQueue.add).toHaveBeenCalledWith(
        'system-run',
        expect.anything(),
        expect.anything(),
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockPlatformQueue.add).not.toHaveBeenCalled();
    });

    it('keeps an interactive dispatch on the interactive queue (#5271)', async () => {
      const input = {
        actionType: 'agent.turn.execute',
        canonicalId: 'agent.turn.execute',
        organizationId: 'org-1',
        source: 'agent',
        userId: 'user-1',
      };

      await service.queueSystemWorkflow(input, 'system-workflow-exec-6c', {
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'system-run',
        expect.anything(),
        expect.anything(),
      );
      expect(mockBackgroundQueue.add).not.toHaveBeenCalled();
      expect(mockPlatformQueue.add).not.toHaveBeenCalled();
    });

    it('a platform-sourced BACKGROUND dispatch still routes to the platform queue, not the background one (#5271)', async () => {
      const input = {
        actionType: 'analytics-sync',
        canonicalId: 'analytics-sync',
        organizationId: 'org-1',
        source: 'PlatformWorkflowSchedulesService',
        userId: 'user-1',
      };

      await service.queueSystemWorkflow(input, 'system-workflow-exec-6d', {
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
        usePlatformQueue: true,
      });

      expect(mockPlatformQueue.add).toHaveBeenCalledWith(
        'system-run',
        expect.anything(),
        expect.anything(),
      );
      expect(mockBackgroundQueue.add).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('reports success when a worker already finished the freshly added job', async () => {
      mockQueue.add.mockResolvedValueOnce({
        getState: vi.fn().mockResolvedValue('completed'),
        id: 'system-workflow-exec-8',
      });
      const input = {
        actionType: 'agent.turn.execute',
        canonicalId: 'agent.turn.execute',
        organizationId: 'org-1',
        source: 'agent',
        userId: 'user-1',
      };

      await expect(
        service.queueSystemWorkflow(input, 'system-workflow-exec-8', {
          dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
        }),
      ).resolves.toBe('system-workflow-exec-8');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('fails loudly instead of silently when the enqueued job lands unclaimable (#5162)', async () => {
      mockQueue.add.mockResolvedValueOnce({
        getState: vi.fn().mockResolvedValue('unknown'),
        id: 'job-123',
      });
      const input = {
        actionType: 'agent.turn.execute',
        canonicalId: 'agent.turn.execute',
        organizationId: 'org-1',
        source: 'agent',
        userId: 'user-1',
      };

      await expect(
        service.queueSystemWorkflow(input, 'system-workflow-exec-3', {
          dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
        }),
      ).rejects.toThrow(/unclaimable state "unknown"/);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('will never claim it'),
        expect.objectContaining({ resultingState: 'unknown' }),
      );
    });
  });

  describe('queueDelayedResume', () => {
    it.each([WORKFLOW_BACKGROUND_QUEUE, PLATFORM_SYSTEM_WORKFLOW_QUEUE])(
      'retains the %s queue for a delayed resume',
      async (queueName) => {
        const data = createDelayResumeData();
        await service.queueDelayedResume(data, 5000, queueName);
        const queue =
          queueName === WORKFLOW_BACKGROUND_QUEUE
            ? mockBackgroundQueue
            : mockPlatformQueue;
        expect(queue.add).toHaveBeenCalledWith(
          'delay-resume',
          expect.objectContaining({ delayResumeData: data }),
          expect.objectContaining({ delay: 5000 }),
        );
        expect(mockQueue.add).not.toHaveBeenCalled();
      },
    );
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
          jobId: expect.stringMatching(/^workflow-delay-/),
        }),
      );
    });
  });

  describe('upsertWorkflowScheduler', () => {
    it('should use the same scheduler id when two producers upsert the same workflow', async () => {
      // Two API replicas sharing the queue converge on ONE scheduler id, which
      // is what makes BullMQ dedupe fires across replicas.
      const replicaA = new (
        WorkflowExecutionQueueService as unknown as new (
          ...args: unknown[]
        ) => WorkflowExecutionQueueService
      )(mockQueue, createMockQueue(), createMockQueue(), createMockLogger());
      const replicaB = new (
        WorkflowExecutionQueueService as unknown as new (
          ...args: unknown[]
        ) => WorkflowExecutionQueueService
      )(mockQueue, createMockQueue(), createMockQueue(), createMockLogger());

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
          data: {
            actionContext: { origin: ActionOrigin.WORKFLOW },
            type: 'scheduled-fire',
            workflowId: 'wf-1',
          },
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
  });

  describe('hasClaimableSystemWorkflowJob', () => {
    it('returns true when the interactive queue has a claimable job', async () => {
      mockQueue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('waiting'),
      });

      await expect(
        service.hasClaimableSystemWorkflowJob('system-workflow-exec-9'),
      ).resolves.toBe(true);
      // Already found on the first queue — no need to check the rest.
      expect(mockPlatformQueue.getJob).not.toHaveBeenCalled();
      expect(mockBackgroundQueue.getJob).not.toHaveBeenCalled();
    });

    it('returns true when the platform-sweep queue has a claimable job', async () => {
      mockQueue.getJob.mockResolvedValue(undefined);
      mockPlatformQueue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('active'),
      });

      await expect(
        service.hasClaimableSystemWorkflowJob('system-workflow-exec-10'),
      ).resolves.toBe(true);
    });

    it('returns true when the background queue has a claimable job (#5271)', async () => {
      mockQueue.getJob.mockResolvedValue(undefined);
      mockPlatformQueue.getJob.mockResolvedValue(undefined);
      mockBackgroundQueue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('delayed'),
      });

      await expect(
        service.hasClaimableSystemWorkflowJob('system-workflow-exec-10b'),
      ).resolves.toBe(true);
    });

    it('returns false when a job exists but is sitting in a terminal state (#5162)', async () => {
      // A stuck PENDING execution whose job already finished (or failed and
      // was cleaned up by removeOnFail) is exactly the case the bounded-
      // failure reconcile needs to catch — a job "existing" is not enough.
      mockQueue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('completed'),
      });

      await expect(
        service.hasClaimableSystemWorkflowJob('system-workflow-exec-11'),
      ).resolves.toBe(false);
    });
  });
});
