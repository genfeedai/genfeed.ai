import type { LoggerService } from '@libs/logger/logger.service';
import type { BrandsService } from '@server/collections/brands/services/brands.service';
import type { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { BatchContentService } from '@server/services/batch-content/batch-content.service';
import type { BatchContentRequest } from '@server/services/batch-content/interfaces/batch-content.interfaces';

describe('BatchContentService', () => {
  const request: BatchContentRequest = {
    brandId: 'brand-1',
    count: 2,
    organizationId: 'org-1',
    params: { topic: 'launch' },
    skillSlug: 'content-writing',
  };
  const brands = {
    findOne: vi.fn(),
  };
  const workflowQueue = {
    queueSystemWorkflow: vi.fn(),
  };
  const workflowRunner = {
    registerAction: vi.fn(),
    registerWorkflow: vi.fn(),
  };
  const service = new BatchContentService(
    brands as unknown as BrandsService,
    workflowRunner as unknown as SystemWorkflowRunnerService,
    workflowQueue as unknown as WorkflowExecutionQueueService,
    { log: vi.fn() } as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    brands.findOne.mockResolvedValue({
      id: request.brandId,
      organizationId: request.organizationId,
    });
    workflowQueue.queueSystemWorkflow.mockResolvedValue('workflow-job-1');
  });

  it('queues the immutable workflow through the shared workflow queue', async () => {
    await expect(service.queueBatch(request, 'user-1')).resolves.toEqual({
      jobId: 'workflow-job-1',
      status: 'queued',
    });

    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'content.batch.generate.content-writing',
        inputValues: { request },
        organizationId: request.organizationId,
        userId: 'user-1',
      }),
      expect.stringMatching(/^batch-content-/),
      { attempts: 1 },
    );
  });

  it('rejects a missing tenant-owned brand before queueing', async () => {
    brands.findOne.mockResolvedValue(null);

    await expect(service.queueBatch(request)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(workflowQueue.queueSystemWorkflow).not.toHaveBeenCalled();
  });
});
