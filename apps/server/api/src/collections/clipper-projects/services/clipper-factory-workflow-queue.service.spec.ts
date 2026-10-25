import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { ClipperFactoryWorkflowQueueService } from './clipper-factory-workflow-queue.service';

describe('ClipperFactoryWorkflowQueueService', () => {
  const workflowQueue = { queueSystemWorkflow: vi.fn() };
  const service = new ClipperFactoryWorkflowQueueService(
    workflowQueue as unknown as WorkflowExecutionQueueService,
  );

  beforeEach(() => {
    workflowQueue.queueSystemWorkflow.mockResolvedValue(
      'clipper-factory-project-1',
    );
  });

  it('queues the immutable factory graph with failure projection', async () => {
    const job = {
      avatarId: 'avatar-1',
      avatarProvider: 'heygen' as const,
      language: 'en',
      maxClips: 5,
      minViralityScore: 50,
      orgId: 'org-1',
      projectId: 'project-1',
      userId: 'user-1',
      voiceId: 'voice-1',
      youtubeUrl: 'https://youtube.com/watch?v=abc123def45',
    };

    await expect(service.enqueue(job)).resolves.toBe(
      'clipper-factory-project-1',
    );
    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'clipper.factory',
        inputValues: { job: { ...job, mode: 'avatar' } },
        organizationId: 'org-1',
        userId: 'user-1',
      }),
      'clipper-factory-project-1',
      {
        attempts: 2,
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
        failureWorkflow: {
          canonicalId: 'clipper.factory.failure',
          inputValues: { job: { ...job, mode: 'avatar' } },
        },
      },
    );
  });
});
