import {
  SCHEDULED_POST_FAILURE_WORKFLOW_ID,
  SCHEDULED_POST_WORKFLOW_ID,
  type ScheduledPostWorkflowInput,
} from '@api/collections/posts/services/scheduled-post-workflow-definition';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ScheduledPostWorkflowQueueService {
  constructor(private readonly workflowQueue: WorkflowExecutionQueueService) {}

  async enqueue(input: ScheduledPostWorkflowInput): Promise<string> {
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
        failureWorkflow: {
          canonicalId: SCHEDULED_POST_FAILURE_WORKFLOW_ID,
          inputValues: { request: input },
        },
        replaceTerminalJob: true,
      },
    );
  }
}
