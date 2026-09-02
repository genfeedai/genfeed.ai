import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { ClipAnalysisWorkflowInput } from '@genfeedai/contracts/interfaces';
import { ClipAnalysisWorkflowQueueService } from './clip-analysis-workflow-queue.service';

describe('ClipAnalysisWorkflowQueueService', () => {
  const workflowQueue = { queueSystemWorkflow: vi.fn() };
  const service = new ClipAnalysisWorkflowQueueService(
    workflowQueue as unknown as WorkflowExecutionQueueService,
  );
  const request: ClipAnalysisWorkflowInput = {
    language: 'en',
    maxClips: 5,
    minViralityScore: 50,
    orgId: 'org-1',
    projectId: 'project-1',
    userId: 'user-1',
    youtubeUrl: 'https://youtube.com/watch?v=abc123def45',
  };

  beforeEach(() => {
    workflowQueue.queueSystemWorkflow.mockResolvedValue(
      'clip-analysis-project-1',
    );
  });

  it('queues the immutable clip analysis graph', async () => {
    await expect(service.enqueue(request)).resolves.toBe(
      'clip-analysis-project-1',
    );

    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'clip.analysis',
        inputValues: { job: request },
        organizationId: 'org-1',
        userId: 'user-1',
      }),
      'clip-analysis-project-1',
      {
        attempts: 2,
        failureWorkflow: {
          canonicalId: 'clip.analysis.failure',
          inputValues: { job: request },
        },
        replaceTerminalJob: true,
      },
    );
  });
});
