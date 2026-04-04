import { BatchWorkflowProcessor } from '@api/collections/workflows/services/batch-workflow.processor';
import { BatchWorkflowService } from '@api/collections/workflows/services/batch-workflow.service';
import type { BatchWorkflowItemJobData } from '@api/collections/workflows/services/batch-workflow-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import type { Mock } from 'vitest';

// =============================================================================
// MOCKS
// =============================================================================

const mockBatchService: Partial<BatchWorkflowService> = {
  markItemCompleted: vi.fn().mockResolvedValue(undefined),
  markItemFailed: vi.fn().mockResolvedValue(undefined),
  markItemProcessing: vi.fn().mockResolvedValue(undefined),
};

const mockWorkflowExecutor: Partial<WorkflowExecutorService> = {
  executeManualWorkflow: vi.fn().mockResolvedValue({
    completedAt: new Date(),
    executionId: 'exec-abc',
    nodeResults: [],
    startedAt: new Date(),
    status: 'completed',
    totalCreditsUsed: 10,
    workflowId: 'wf-1',
  }),
};

const mockLogger = {
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

const mockConfigService = {
  ingredientsEndpoint: 'https://cdn.example.com/ingredients',
};

const createJob = (overrides: Partial<BatchWorkflowItemJobData> = {}) => ({
  data: {
    batchJobId: new Types.ObjectId().toString(),
    ingredientId: new Types.ObjectId().toString(),
    itemId: new Types.ObjectId().toString(),
    organizationId: new Types.ObjectId().toString(),
    userId: new Types.ObjectId().toString(),
    workflowId: new Types.ObjectId().toString(),
    ...overrides,
  },
  id: 'test-job-1',
  name: 'process-batch-item',
});

// =============================================================================
// TESTS
// =============================================================================

describe('BatchWorkflowProcessor', () => {
  let processor: BatchWorkflowProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchWorkflowProcessor,
        { provide: LoggerService, useValue: mockLogger },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: BatchWorkflowService,
          useValue: mockBatchService,
        },
        {
          provide: WorkflowExecutorService,
          useValue: mockWorkflowExecutor,
        },
      ],
    }).compile();

    processor = module.get<BatchWorkflowProcessor>(BatchWorkflowProcessor);
    // Inject mocks directly since DI may not resolve forwardRef in tests
    (processor as any).batchService = mockBatchService;
    (processor as any).workflowExecutor = mockWorkflowExecutor;
    vi.clearAllMocks();
  });

  it('should mark item as processing then completed on success', async () => {
    const job = createJob();

    await processor.process(job as any);

    expect(mockBatchService.markItemProcessing).toHaveBeenCalledWith(
      job.data.batchJobId,
      job.data.itemId,
    );
    expect(mockWorkflowExecutor.executeManualWorkflow).toHaveBeenCalledWith(
      job.data.workflowId,
      job.data.userId,
      job.data.organizationId,
      { ingredientId: job.data.ingredientId },
    );
    expect(mockBatchService.markItemCompleted).toHaveBeenCalledWith(
      job.data.batchJobId,
      job.data.itemId,
      {
        executionId: 'exec-abc',
      },
    );
  });

  it('should persist resolved output metadata when execution returns a generated ingredient', async () => {
    const job = createJob();
    (mockWorkflowExecutor.executeManualWorkflow as Mock).mockResolvedValueOnce({
      completedAt: new Date(),
      executionId: 'exec-with-output',
      nodeResults: [
        {
          creditsUsed: 5,
          nodeId: 'node-video',
          nodeType: 'aiAvatarVideo',
          output: {
            id: 'ingredient-video-123',
            status: 'generated',
            video: {
              id: 'ingredient-video-123',
              status: 'generated',
            },
          },
          retryCount: 0,
          status: 'completed',
        },
      ],
      startedAt: new Date(),
      status: 'completed',
      totalCreditsUsed: 10,
      workflowId: 'wf-1',
    });

    await processor.process(job as any);

    expect(mockBatchService.markItemCompleted).toHaveBeenCalledWith(
      job.data.batchJobId,
      job.data.itemId,
      {
        executionId: 'exec-with-output',
        outputCategory: 'video',
        outputIngredientId: 'ingredient-video-123',
        outputSummary: {
          category: 'video',
          id: 'ingredient-video-123',
          ingredientUrl:
            'https://cdn.example.com/ingredients/videos/ingredient-video-123',
          status: 'generated',
          thumbnailUrl:
            'https://cdn.example.com/ingredients/thumbnails/ingredient-video-123',
        },
      },
    );
  });

  it('should complete the item when execution succeeds without a generated asset', async () => {
    const job = createJob();
    (mockWorkflowExecutor.executeManualWorkflow as Mock).mockResolvedValueOnce({
      completedAt: new Date(),
      executionId: 'exec-no-output',
      nodeResults: [
        {
          creditsUsed: 1,
          nodeId: 'node-text',
          nodeType: 'promptBuilder',
          output: {
            prompt: 'A cinematic product shot',
          },
          retryCount: 0,
          status: 'completed',
        },
      ],
      startedAt: new Date(),
      status: 'completed',
      totalCreditsUsed: 1,
      workflowId: 'wf-1',
    });

    await processor.process(job as any);

    expect(mockBatchService.markItemCompleted).toHaveBeenCalledWith(
      job.data.batchJobId,
      job.data.itemId,
      {
        executionId: 'exec-no-output',
      },
    );
    expect(mockBatchService.markItemFailed).not.toHaveBeenCalled();
  });

  it('should mark item as failed on error without rethrowing', async () => {
    const job = createJob();
    (mockWorkflowExecutor.executeManualWorkflow as Mock).mockRejectedValueOnce(
      new Error('Workflow execution failed'),
    );

    // Should not throw
    await processor.process(job as any);

    expect(mockBatchService.markItemFailed).toHaveBeenCalledWith(
      job.data.batchJobId,
      job.data.itemId,
      'Workflow execution failed',
    );
    expect(mockBatchService.markItemCompleted).not.toHaveBeenCalled();
  });
});
