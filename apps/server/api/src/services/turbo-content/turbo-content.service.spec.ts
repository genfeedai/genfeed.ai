import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { TurboContentRequest } from '@api/services/turbo-content/interfaces/turbo-content.interfaces';
import { TurboContentService } from '@api/services/turbo-content/turbo-content.service';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';

describe('TurboContentService', () => {
  const request: TurboContentRequest = {
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
    runWithRegisteredWorkflowModule: vi.fn(
      async <T>(
        _input: { canonicalId: string; organizationId: string },
        work: () => Promise<T>,
      ) => work(),
    ),
  };
  const service = new TurboContentService(
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
    await expect(service.queueTurboRun(request, 'user-1')).resolves.toEqual({
      jobId: 'workflow-job-1',
      status: 'queued',
    });

    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'content.turbo.generate.content-writing',
        inputValues: { request },
        organizationId: request.organizationId,
        userId: 'user-1',
      }),
      expect.stringMatching(/^turboRun-content-/),
      { attempts: 1, dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE },
    );
  });

  it('rejects a missing tenant-owned brand before queueing', async () => {
    brands.findOne.mockResolvedValue(null);

    await expect(service.queueTurboRun(request)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(workflowQueue.queueSystemWorkflow).not.toHaveBeenCalled();
  });

  it('denies a direct run request before a queue write', async () => {
    workflowRunner.runWithRegisteredWorkflowModule.mockRejectedValueOnce(
      new Error('Turbo run disabled'),
    );
    await expect(service.queueTurboRun(request, 'user-1')).rejects.toThrow(
      'Turbo run disabled',
    );
    expect(workflowRunner.runWithRegisteredWorkflowModule).toHaveBeenCalledWith(
      {
        canonicalId: 'content.turbo.generate.content-writing',
        organizationId: 'org-1',
      },
      expect.any(Function),
    );
    expect(workflowQueue.queueSystemWorkflow).not.toHaveBeenCalled();
  });
});
