import {
  SCHEDULED_POST_FAILURE_WORKFLOW_ID,
  SCHEDULED_POST_WORKFLOW_ID,
  type ScheduledPostWorkflowInput,
} from '@api/collections/posts/services/scheduled-post-workflow-definition';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ScheduledPostWorkflowQueueService {
  constructor(private readonly workflowQueue: WorkflowExecutionQueueService) {}

  async enqueue(input: ScheduledPostWorkflowInput): Promise<string> {
    // Threaded from the caller via the existing `source` discriminator
    // (already used just below to pick `trigger`) rather than a new
    // parameter every one of this producer's several callers would need to
    // pass: `scheduled_sweep` is the 15-min cron; `publish_now`,
    // `manual_retry`, and `tiktok_app` are all direct user actions
    // (approve/retry/publish-now, a TikTok-app-side publish confirmation) —
    // see #5271.
    const dispatchClass =
      input.source === 'scheduled_sweep'
        ? SystemWorkflowDispatchClass.BACKGROUND
        : SystemWorkflowDispatchClass.INTERACTIVE;
    return this.workflowQueue.queueSystemWorkflow(
      {
        actionType: SCHEDULED_POST_WORKFLOW_ID,
        canonicalId: SCHEDULED_POST_WORKFLOW_ID,
        inputValues: { request: input },
        organizationId: input.organizationId,
        postIds: [input.postId],
        source: input.source,
        trigger:
          input.source === 'scheduled_sweep'
            ? WorkflowExecutionTrigger.SCHEDULED
            : WorkflowExecutionTrigger.API,
        userId: input.userId,
      },
      `scheduled-post-${input.operationId ?? input.postId}`,
      {
        attempts: 1,
        dispatchClass,
        failureWorkflow: {
          canonicalId: SCHEDULED_POST_FAILURE_WORKFLOW_ID,
          inputValues: { request: input },
        },
        replaceTerminalJob: true,
      },
    );
  }
}
