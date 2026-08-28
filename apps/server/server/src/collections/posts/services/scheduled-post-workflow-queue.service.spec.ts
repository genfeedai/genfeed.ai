import {
  SCHEDULED_POST_ACTION_IDS,
  SCHEDULED_POST_WORKFLOW_ID,
} from '@server/collections/posts/services/scheduled-post-workflow-definition';
import { ScheduledPostWorkflowQueueService } from '@server/collections/posts/services/scheduled-post-workflow-queue.service';

describe('ScheduledPostWorkflowQueueService', () => {
  it('queues the immutable graph with one attempt and terminal replacement', async () => {
    const workflowQueue = {
      queueSystemWorkflowDefinition: vi.fn().mockResolvedValue('job-1'),
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

    expect(workflowQueue.queueSystemWorkflowDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalId: SCHEDULED_POST_WORKFLOW_ID }),
      expect.objectContaining({
        canonicalId: SCHEDULED_POST_WORKFLOW_ID,
        inputValues: { request: input },
        postIds: ['post-1'],
      }),
      'scheduled-post-operation-1',
      {
        actionId: SCHEDULED_POST_ACTION_IDS.FAIL,
        inputValues: input,
      },
      { attempts: 1, replaceTerminalJob: true },
    );
  });
});
