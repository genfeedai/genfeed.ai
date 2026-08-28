import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';
import {
  buildScheduledPostWorkflowDefinition,
  SCHEDULED_POST_ACTION_IDS,
  SCHEDULED_POST_WORKFLOW_ID,
  type ScheduledPostWorkflowInput,
} from '@server/collections/posts/services/scheduled-post-workflow-definition';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';

@Injectable()
export class ScheduledPostWorkflowQueueService {
  constructor(private readonly workflowQueue: WorkflowExecutionQueueService) {}

  async enqueue(input: ScheduledPostWorkflowInput): Promise<string> {
    const definition = buildScheduledPostWorkflowDefinition();
    return this.workflowQueue.queueSystemWorkflowDefinition(
      definition,
      {
        actionType: SCHEDULED_POST_WORKFLOW_ID,
        canonicalId: definition.canonicalId,
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
        actionId: SCHEDULED_POST_ACTION_IDS.FAIL,
        inputValues: input,
      },
      { attempts: 1, replaceTerminalJob: true },
    );
  }
}
