import { BatchWorkflowService } from '@api/collections/workflows/services/batch-workflow.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import type { BatchWorkflowItemJobData } from '@genfeedai/queue-contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { BatchWorkflowProcessor } from '@workers/processors/api/collections/workflows/services/batch-workflow.processor';
import type { Job } from 'bullmq';
import type { Mock } from 'vitest';

/** Minimal shape of a node result the processor mines for output metadata. */
interface TestNodeResult {
  creditsUsed: number;
  nodeId: string;
  nodeType: string;
  output?: Record<string, unknown>;
  retryCount: number;
  status: string;
}

const executionWith = (
  executionId: string,
  nodeResults: TestNodeResult[],
): Record<string, unknown> => ({
  completedAt: new Date(),
  executionId,
  nodeResults,
  startedAt: new Date(),
  status: 'completed',
  totalCreditsUsed: 1,
  workflowId: 'wf-1',
});

const nodeWith = (output?: Record<string, unknown>): TestNodeResult => ({
  creditsUsed: 1,
  nodeId: 'node-1',
  nodeType: 'generate',
  output,
  retryCount: 0,
  status: 'completed',
});

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
    batchJobId: 'test-object-id',
    ingredientId: 'test-object-id',
    itemId: 'test-object-id',
    organizationId: 'test-object-id',
    userId: 'test-object-id',
    workflowId: 'test-object-id',
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

  describe('output summary resolution', () => {
    const runWith = async (
      nodeResults: TestNodeResult[],
    ): Promise<Record<string, unknown>> => {
      const job = createJob();
      (
        mockWorkflowExecutor.executeManualWorkflow as Mock
      ).mockResolvedValueOnce(executionWith('exec-1', nodeResults));

      await processor.process(job as unknown as Job<BatchWorkflowItemJobData>);

      const call = (mockBatchService.markItemCompleted as Mock).mock
        .calls[0][2];
      return call as Record<string, unknown>;
    };

    it('resolves an image output and reuses the ingredient URL as the thumbnail', async () => {
      const completion = await runWith([
        nodeWith({
          id: 'ingredient-image-1',
          imageUrl: 'https://example.com/raw.png',
          status: 'generated',
        }),
      ]);

      expect(completion).toEqual({
        executionId: 'exec-1',
        outputCategory: 'image',
        outputIngredientId: 'ingredient-image-1',
        outputSummary: {
          category: 'image',
          id: 'ingredient-image-1',
          ingredientUrl:
            'https://cdn.example.com/ingredients/images/ingredient-image-1',
          status: 'generated',
          thumbnailUrl:
            'https://cdn.example.com/ingredients/images/ingredient-image-1',
        },
      });
    });

    it('resolves a music output from musicIngredientId and emits no thumbnail', async () => {
      const completion = await runWith([
        nodeWith({ musicIngredientId: 'ingredient-music-1', status: 'ready' }),
      ]);

      expect(completion.outputCategory).toBe('music');
      expect(completion.outputIngredientId).toBe('ingredient-music-1');
      expect(completion.outputSummary).toEqual({
        category: 'music',
        id: 'ingredient-music-1',
        ingredientUrl:
          'https://cdn.example.com/ingredients/musics/ingredient-music-1',
        status: 'ready',
        thumbnailUrl: undefined,
      });
    });

    it('reads the ingredient id from the nested asset record', async () => {
      const completion = await runWith([
        nodeWith({ status: 'generated', video: { id: 'nested-video-1' } }),
      ]);

      expect(completion.outputCategory).toBe('video');
      expect(completion.outputIngredientId).toBe('nested-video-1');
    });

    it('falls back to the nested asset key and inherits the outer status', async () => {
      // The direct record names a category but carries no id, so the
      // processor re-scans the video/image/music/audio keys.
      const completion = await runWith([
        nodeWith({
          image: { image: { id: 'deep-image-1' } },
          status: 'generated',
        }),
      ]);

      expect(completion.outputCategory).toBe('image');
      expect(completion.outputIngredientId).toBe('deep-image-1');
      expect(completion.outputSummary).toEqual(
        expect.objectContaining({ status: 'generated' }),
      );
    });

    it('prefers the last node that produced an asset', async () => {
      const completion = await runWith([
        nodeWith({ id: 'first-image', imageUrl: 'https://example.com/a.png' }),
        nodeWith({ id: 'last-video', videoUrl: 'https://example.com/b.mp4' }),
      ]);

      expect(completion.outputCategory).toBe('video');
      expect(completion.outputIngredientId).toBe('last-video');
    });

    it('ignores nodes without output and records only the execution id', async () => {
      const completion = await runWith([nodeWith(undefined)]);

      expect(completion).toEqual({ executionId: 'exec-1' });
    });

    it('ignores an asset record that names no known category', async () => {
      const completion = await runWith([
        nodeWith({ id: 'doc-1', transcriptUrl: 'https://example.com/t.txt' }),
      ]);

      expect(completion).toEqual({ executionId: 'exec-1' });
    });
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

  it('records a non-Error rejection as an unknown error', async () => {
    const job = createJob();
    (mockWorkflowExecutor.executeManualWorkflow as Mock).mockRejectedValueOnce(
      'boom',
    );

    await processor.process(job as unknown as Job<BatchWorkflowItemJobData>);

    expect(mockBatchService.markItemFailed).toHaveBeenCalledWith(
      job.data.batchJobId,
      job.data.itemId,
      'Unknown error',
    );
  });
});
