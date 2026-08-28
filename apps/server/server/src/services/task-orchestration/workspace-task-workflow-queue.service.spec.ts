import { WORKSPACE_TASK_WORKFLOW_IDS } from '@server/services/task-orchestration/workspace-task-workflow-definition';
import { WorkspaceTaskWorkflowQueueService } from '@server/services/task-orchestration/workspace-task-workflow-queue.service';

describe('WorkspaceTaskWorkflowQueueService', () => {
  it('queues the immutable parent graph with a deterministic task id', async () => {
    const queueSystemWorkflow = vi.fn().mockResolvedValue('job-1');
    const service = new WorkspaceTaskWorkflowQueueService({
      queueSystemWorkflow,
    } as never);
    const request = {
      organizationId: 'org-1',
      request: 'Create a launch campaign',
      taskId: 'task-1',
      userId: 'user-1',
    };

    await expect(service.enqueue(request)).resolves.toBe('job-1');
    expect(queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: WORKSPACE_TASK_WORKFLOW_IDS.EXECUTE,
        organizationId: 'org-1',
      }),
      'workspace-task-task-1',
      { attempts: 2 },
    );
  });
});
