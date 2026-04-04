import { BatchContentProcessor } from '@api/services/batch-content/batch-content.processor';
import type { BatchContentQueueService } from '@api/services/batch-content/batch-content-queue.service';
import type { BatchContentItemJobData } from '@api/services/batch-content/interfaces/batch-content.interfaces';
import type { SkillExecutionResult } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import type { SkillExecutorService } from '@api/services/skill-executor/skill-executor.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Job } from 'bullmq';

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createMockQueueService(
  overrides: Partial<BatchContentQueueService> = {},
): BatchContentQueueService {
  return {
    markItemCompleted: vi.fn().mockResolvedValue(undefined),
    markItemFailed: vi.fn().mockResolvedValue(undefined),
    markItemProcessing: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as BatchContentQueueService;
}

function createMockSkillExecutor(
  overrides: Partial<SkillExecutorService> = {},
): SkillExecutorService {
  return {
    execute: vi.fn().mockResolvedValue({
      creditsUsed: 1,
      draft: {
        confidence: 0.88,
        content: 'generated draft',
        metadata: {},
        platforms: [],
        skillSlug: 'content-writing',
        type: 'text',
      },
      duration: 120,
      source: 'hosted',
    } satisfies SkillExecutionResult),
    ...overrides,
  } as unknown as SkillExecutorService;
}

function createMockJob(
  data: BatchContentItemJobData,
  overrides: Partial<Job<BatchContentItemJobData>> = {},
): Job<BatchContentItemJobData> {
  return {
    attemptsMade: 0,
    data,
    id: `${data.batchId}:${data.itemIndex}`,
    opts: { attempts: 3 },
    ...overrides,
  } as unknown as Job<BatchContentItemJobData>;
}

const defaultJobData: BatchContentItemJobData = {
  batchId: 'batch-1',
  itemIndex: 0,
  request: {
    brandId: 'brand-1',
    count: 1,
    organizationId: 'org-1',
    skillSlug: 'content-writing',
  },
};

describe('BatchContentProcessor', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should mark item as processing before execution', async () => {
    const queueService = createMockQueueService();
    const processor = new BatchContentProcessor(
      createMockSkillExecutor(),
      queueService,
      createMockLogger(),
    );

    await processor.process(createMockJob(defaultJobData));

    expect(queueService.markItemProcessing).toHaveBeenCalledWith('batch-1');
  });

  it('should execute skill with correct parameters', async () => {
    const skillExecutor = createMockSkillExecutor();
    const processor = new BatchContentProcessor(
      skillExecutor,
      createMockQueueService(),
      createMockLogger(),
    );

    await processor.process(
      createMockJob({
        ...defaultJobData,
        request: {
          brandId: 'brand-2',
          count: 5,
          organizationId: 'org-2',
          params: { tone: 'formal' },
          skillSlug: 'social-post',
        },
      }),
    );

    expect(skillExecutor.execute).toHaveBeenCalledWith({
      brandId: 'brand-2',
      organizationId: 'org-2',
      params: { tone: 'formal' },
      skillSlug: 'social-post',
    });
  });

  it('should mark item completed with draft on success', async () => {
    const queueService = createMockQueueService();
    const expectedDraft = {
      confidence: 0.95,
      content: 'great content',
      metadata: {},
      platforms: [],
      skillSlug: 'content-writing',
      type: 'text',
    };
    const skillExecutor = createMockSkillExecutor({
      execute: vi.fn().mockResolvedValue({
        creditsUsed: 1,
        draft: expectedDraft,
        duration: 100,
        source: 'hosted' as const,
      }),
    } as unknown as Partial<SkillExecutorService>);
    const processor = new BatchContentProcessor(
      skillExecutor,
      queueService,
      createMockLogger(),
    );

    await processor.process(createMockJob(defaultJobData));

    expect(queueService.markItemCompleted).toHaveBeenCalledWith(
      'batch-1',
      expectedDraft,
    );
  });

  it('should return the draft on success', async () => {
    const processor = new BatchContentProcessor(
      createMockSkillExecutor(),
      createMockQueueService(),
      createMockLogger(),
    );

    const result = await processor.process(createMockJob(defaultJobData));

    expect(result).toEqual(
      expect.objectContaining({ content: 'generated draft' }),
    );
  });

  it('should mark item failed on final attempt and rethrow', async () => {
    const queueService = createMockQueueService();
    const skillExecutor = createMockSkillExecutor({
      execute: vi.fn().mockRejectedValue(new Error('AI timeout')),
    } as unknown as Partial<SkillExecutorService>);
    const processor = new BatchContentProcessor(
      skillExecutor,
      queueService,
      createMockLogger(),
    );
    const job = createMockJob(defaultJobData, {
      attemptsMade: 2,
      opts: { attempts: 3 },
    } as Partial<Job<BatchContentItemJobData>>);

    await expect(processor.process(job)).rejects.toThrow('AI timeout');

    expect(queueService.markItemFailed).toHaveBeenCalledWith('batch-1');
  });

  it('should NOT mark item failed on non-final attempt', async () => {
    const queueService = createMockQueueService();
    const skillExecutor = createMockSkillExecutor({
      execute: vi.fn().mockRejectedValue(new Error('transient')),
    } as unknown as Partial<SkillExecutorService>);
    const processor = new BatchContentProcessor(
      skillExecutor,
      queueService,
      createMockLogger(),
    );
    const job = createMockJob(defaultJobData, {
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as Partial<Job<BatchContentItemJobData>>);

    await expect(processor.process(job)).rejects.toThrow('transient');

    expect(queueService.markItemFailed).not.toHaveBeenCalled();
  });

  it('should log error details on failure', async () => {
    const logger = createMockLogger();
    const skillExecutor = createMockSkillExecutor({
      execute: vi.fn().mockRejectedValue(new Error('model rate limited')),
    } as unknown as Partial<SkillExecutorService>);
    const processor = new BatchContentProcessor(
      skillExecutor,
      createMockQueueService(),
      logger,
    );

    await expect(
      processor.process(
        createMockJob({
          batchId: 'batch-99',
          itemIndex: 3,
          request: {
            brandId: 'brand-1',
            count: 5,
            organizationId: 'org-1',
            skillSlug: 'skill',
          },
        }),
      ),
    ).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('job failed'),
      expect.objectContaining({
        batchId: 'batch-99',
        error: 'model rate limited',
        itemIndex: 3,
      }),
    );
  });

  it('should handle non-Error thrown values', async () => {
    const logger = createMockLogger();
    const skillExecutor = createMockSkillExecutor({
      execute: vi.fn().mockRejectedValue('string error'),
    } as unknown as Partial<SkillExecutorService>);
    const processor = new BatchContentProcessor(
      skillExecutor,
      createMockQueueService(),
      logger,
    );
    const job = createMockJob(defaultJobData, {
      attemptsMade: 2,
      opts: { attempts: 3 },
    } as Partial<Job<BatchContentItemJobData>>);

    await expect(processor.process(job)).rejects.toBe('string error');

    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ error: 'string error' }),
    );
  });

  it('should mark item failed when attempts default to 1', async () => {
    const queueService = createMockQueueService();
    const skillExecutor = createMockSkillExecutor({
      execute: vi.fn().mockRejectedValue(new Error('fail')),
    } as unknown as Partial<SkillExecutorService>);
    const processor = new BatchContentProcessor(
      skillExecutor,
      queueService,
      createMockLogger(),
    );
    const job = createMockJob(defaultJobData, {
      attemptsMade: 0,
      opts: {},
    } as Partial<Job<BatchContentItemJobData>>);

    await expect(processor.process(job)).rejects.toThrow();

    expect(queueService.markItemFailed).toHaveBeenCalledWith('batch-1');
  });

  it('should not mark completed when execution fails', async () => {
    const queueService = createMockQueueService();
    const skillExecutor = createMockSkillExecutor({
      execute: vi.fn().mockRejectedValue(new Error('fail')),
    } as unknown as Partial<SkillExecutorService>);
    const processor = new BatchContentProcessor(
      skillExecutor,
      queueService,
      createMockLogger(),
    );

    await expect(
      processor.process(createMockJob(defaultJobData)),
    ).rejects.toThrow();

    expect(queueService.markItemCompleted).not.toHaveBeenCalled();
  });
});
