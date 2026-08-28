import type { ClipAnalysisWorkflowInput } from '@genfeedai/interfaces';
import type { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import { ClipAnalysisWorkflowQueueService } from './clip-analysis-workflow-queue.service';

describe('ClipAnalysisWorkflowQueueService', () => {
  const workflowQueue = { queueSystemWorkflowDefinition: vi.fn() };
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
    workflowQueue.queueSystemWorkflowDefinition.mockResolvedValue(
      'clip-analysis-project-1',
    );
  });

  it('queues the immutable clip analysis graph', async () => {
    await expect(service.enqueue(request)).resolves.toBe(
      'clip-analysis-project-1',
    );

    expect(workflowQueue.queueSystemWorkflowDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalId: 'clip.analysis' }),
      expect.objectContaining({
        actionType: 'clip.analysis',
        inputValues: { job: request },
        organizationId: 'org-1',
        userId: 'user-1',
      }),
      'clip-analysis-project-1',
      {
        actionId: 'clip.analysis.fail',
        inputValues: { job: request },
      },
      { attempts: 2, replaceTerminalJob: true },
    );
  });
});
