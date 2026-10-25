import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { ClipperAnalysisWorkflowInput } from '@genfeedai/contracts/interfaces';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { ClipperAnalysisWorkflowQueueService } from './clipper-analysis-workflow-queue.service';

describe('ClipperAnalysisWorkflowQueueService', () => {
  const workflowQueue = { queueSystemWorkflow: vi.fn() };
  const service = new ClipperAnalysisWorkflowQueueService(
    workflowQueue as unknown as WorkflowExecutionQueueService,
  );
  const request: ClipperAnalysisWorkflowInput = {
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
      'clipper-analysis-project-1',
    );
  });

  it('queues the immutable clip analysis graph', async () => {
    await expect(service.enqueue(request)).resolves.toBe(
      'clipper-analysis-project-1',
    );

    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'clipper.analysis',
        inputValues: { job: request },
        organizationId: 'org-1',
        userId: 'user-1',
      }),
      'clipper-analysis-project-1',
      {
        attempts: 2,
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
        failureWorkflow: {
          canonicalId: 'clipper.analysis.failure',
          inputValues: { job: request },
        },
      },
    );
  });
});
