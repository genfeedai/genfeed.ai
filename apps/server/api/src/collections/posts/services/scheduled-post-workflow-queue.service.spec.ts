import { SCHEDULED_POST_WORKFLOW_ID } from '@api/collections/posts/services/scheduled-post-workflow-definition';
import { ScheduledPostWorkflowQueueService } from '@api/collections/posts/services/scheduled-post-workflow-queue.service';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';

describe('ScheduledPostWorkflowQueueService', () => {
  it('queues the immutable graph with one attempt and terminal replacement', async () => {
    const workflowQueue = {
      queueSystemWorkflow: vi.fn().mockResolvedValue('job-1'),
    };
    const service = new ScheduledPostWorkflowQueueService(
      workflowQueue as never,
    );
    const input = {
      approvalId: 'approval-1',
      operationId: 'operation-1',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'publish_now' as const,
      userId: 'user-1',
      versionPinId: 'pin-1',
    };

    await service.enqueue(input);

    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: SCHEDULED_POST_WORKFLOW_ID,
        inputValues: { request: input },
        postIds: ['post-1'],
      }),
      'scheduled-post-operation-1',
      {
        attempts: 1,
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
        failureWorkflow: {
          canonicalId: 'scheduled-post.publish.failure',
          inputValues: { request: input },
        },
        replaceTerminalJob: true,
      },
    );
  });

  it('routes the scheduled_sweep cron source to the background queue', async () => {
    const workflowQueue = {
      queueSystemWorkflow: vi.fn().mockResolvedValue('job-1'),
    };
    const service = new ScheduledPostWorkflowQueueService(
      workflowQueue as never,
    );

    await service.enqueue({
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
      userId: 'user-1',
    });

    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
      }),
    );
  });
});
