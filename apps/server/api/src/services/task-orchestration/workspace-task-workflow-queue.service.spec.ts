import { WORKSPACE_TASK_WORKFLOW_IDS } from '@api/services/task-orchestration/workspace-task-workflow-definition';
import { WorkspaceTaskWorkflowQueueService } from '@api/services/task-orchestration/workspace-task-workflow-queue.service';

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

  it('queues facecam directly onto its resumable provider workflow', async () => {
    const queueSystemWorkflow = vi.fn().mockResolvedValue('job-facecam');
    const service = new WorkspaceTaskWorkflowQueueService({
      queueSystemWorkflow,
    } as never);

    await service.enqueue({
      organizationId: 'org-1',
      outputType: 'facecam',
      request: 'Create a presenter video',
      taskId: 'task-facecam',
      userId: 'user-1',
    });

    expect(queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: WORKSPACE_TASK_WORKFLOW_IDS.FACECAM,
      }),
      'workspace-task-task-facecam',
      { attempts: 2 },
    );
  });
});
