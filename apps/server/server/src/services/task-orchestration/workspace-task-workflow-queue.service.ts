import { Injectable } from '@nestjs/common';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import {
  findWorkspaceTaskWorkflowDefinition,
  WORKSPACE_TASK_WORKFLOW_IDS,
  type WorkspaceTaskWorkflowRequest,
} from '@server/services/task-orchestration/workspace-task-workflow-definition';

@Injectable()
export class WorkspaceTaskWorkflowQueueService {
  constructor(private readonly workflowQueue: WorkflowExecutionQueueService) {}

  enqueue(request: WorkspaceTaskWorkflowRequest): Promise<string> {
    const definition = findWorkspaceTaskWorkflowDefinition(
      WORKSPACE_TASK_WORKFLOW_IDS.EXECUTE,
    );
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
