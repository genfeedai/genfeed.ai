import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { ClipFactoryWorkflowQueueService } from './clip-factory-workflow-queue.service';

describe('ClipFactoryWorkflowQueueService', () => {
  const workflowQueue = { queueSystemWorkflow: vi.fn() };
  const service = new ClipFactoryWorkflowQueueService(
    workflowQueue as unknown as WorkflowExecutionQueueService,
  );

  beforeEach(() => {
    workflowQueue.queueSystemWorkflow.mockResolvedValue(
      'clip-factory-project-1',
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

    await expect(service.enqueue(job)).resolves.toBe('clip-factory-project-1');
    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'clip.factory',
        inputValues: { job: { ...job, mode: 'avatar' } },
        organizationId: 'org-1',
        userId: 'user-1',
      }),
      'clip-factory-project-1',
      {
        attempts: 2,
        failureWorkflow: {
          canonicalId: 'clip.factory.failure',
          inputValues: { job: { ...job, mode: 'avatar' } },
        },
        replaceTerminalJob: true,
      },
    );
  });
});
