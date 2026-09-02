import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  findWorkspaceTaskWorkflowDefinition,
  WORKSPACE_TASK_WORKFLOW_IDS,
  type WorkspaceTaskWorkflowRequest,
} from '@api/services/task-orchestration/workspace-task-workflow-definition';
import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkspaceTaskWorkflowQueueService {
  constructor(private readonly workflowQueue: WorkflowExecutionQueueService) {}

  enqueue(request: WorkspaceTaskWorkflowRequest): Promise<string> {
    // Provider-backed facecam work must own one resumable execution. Routing it
    // through an awaited child workflow would leave the parent waiting on an
    // in-memory call stack after the child durably suspends.
    const canonicalId =
      request.outputType === 'facecam'
        ? WORKSPACE_TASK_WORKFLOW_IDS.FACECAM
        : WORKSPACE_TASK_WORKFLOW_IDS.EXECUTE;
    const definition = findWorkspaceTaskWorkflowDefinition(canonicalId);
    return this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId: request.organizationId,
        source: 'workspace-task',
        userId: request.userId,
      },
      `workspace-task-${request.taskId}`,
      { attempts: 2 },
    );
  }
}
