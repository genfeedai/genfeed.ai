import { ArticleGenerationProcessor } from '@api/collections/articles/processors/article-generation.processor';
import type { ArticlesService } from '@api/collections/articles/services/articles.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Job } from 'bullmq';

interface ArticleGenerationJobData {
  transcriptId: string;
  userId: string;
  organizationId: string;
  brandId: string;
}

function createMockArticlesService(
  overrides: Partial<ArticlesService> = {},
): ArticlesService {
  return {
    generateFromTranscript: vi
      .fn()
      .mockResolvedValue({ _id: 'article-123', title: 'Generated' }),
    ...overrides,
  } as unknown as ArticlesService;
}

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createMockJob(
  data: ArticleGenerationJobData,
  overrides: Partial<Job<ArticleGenerationJobData>> = {},
): Job<ArticleGenerationJobData> {
  return {
    attemptsMade: 0,
    data,
    id: 'job-1',
    opts: { attempts: 3 },
    updateProgress: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Job<ArticleGenerationJobData>;
}

describe('ArticleGenerationProcessor', () => {
  const defaultJobData: ArticleGenerationJobData = {
    brandId: 'brand-1',
    organizationId: 'org-1',
    transcriptId: 'transcript-1',
    userId: 'user-1',
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call generateFromTranscript with correct parameters', async () => {
    const articlesService = createMockArticlesService();
    const logger = createMockLogger();
    const processor = new ArticleGenerationProcessor(articlesService, logger);
    const job = createMockJob(defaultJobData);

    await processor.process(job);

    expect(articlesService.generateFromTranscript).toHaveBeenCalledWith(
      'transcript-1',
      'user-1',
      'org-1',
      'brand-1',
    );
  });

  it('should update progress to 10 before generation', async () => {
    const articlesService = createMockArticlesService();
    const logger = createMockLogger();
    const processor = new ArticleGenerationProcessor(articlesService, logger);
    const job = createMockJob(defaultJobData);

    await processor.process(job);

    expect(job.updateProgress).toHaveBeenCalledWith(10);
  });

  it('should update progress to 100 after successful generation', async () => {
    const articlesService = createMockArticlesService();
    const logger = createMockLogger();
    const processor = new ArticleGenerationProcessor(articlesService, logger);
    const job = createMockJob(defaultJobData);

    await processor.process(job);

    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('should log transcript id at start', async () => {
    const articlesService = createMockArticlesService();
    const logger = createMockLogger();
    const processor = new ArticleGenerationProcessor(articlesService, logger);
    const job = createMockJob(defaultJobData);

    await processor.process(job);

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('transcript-1'),
    );
  });

  it('should log article id on success', async () => {
    const articlesService = createMockArticlesService();
    const logger = createMockLogger();
    const processor = new ArticleGenerationProcessor(articlesService, logger);
    const job = createMockJob(defaultJobData);

    await processor.process(job);

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('article-123'),
    );
  });

  it('should throw and log error when generation fails', async () => {
    const error = new Error('AI service unavailable');
    const articlesService = createMockArticlesService({
      generateFromTranscript: vi.fn().mockRejectedValue(error),
    } as unknown as Partial<ArticlesService>);
    const logger = createMockLogger();
    const processor = new ArticleGenerationProcessor(articlesService, logger);
    const job = createMockJob(defaultJobData);

    await expect(processor.process(job)).rejects.toThrow(
      'AI service unavailable',
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('transcript-1'),
      expect.any(String),
    );
  });

  it('should not update progress to 100 when generation fails', async () => {
    const articlesService = createMockArticlesService({
      generateFromTranscript: vi.fn().mockRejectedValue(new Error('fail')),
    } as unknown as Partial<ArticlesService>);
    const logger = createMockLogger();
    const processor = new ArticleGenerationProcessor(articlesService, logger);
    const job = createMockJob(defaultJobData);

    await expect(processor.process(job)).rejects.toThrow();

    expect(job.updateProgress).toHaveBeenCalledWith(10);
    expect(job.updateProgress).not.toHaveBeenCalledWith(100);
  });

  it('should propagate the error for BullMQ retry', async () => {
    const error = new Error('network timeout');
    const articlesService = createMockArticlesService({
      generateFromTranscript: vi.fn().mockRejectedValue(error),
    } as unknown as Partial<ArticlesService>);
    const logger = createMockLogger();
    const processor = new ArticleGenerationProcessor(articlesService, logger);
    const job = createMockJob(defaultJobData);

    const rejection = processor.process(job);
    await expect(rejection).rejects.toBe(error);
  });

  it('should handle different job data values correctly', async () => {
    const articlesService = createMockArticlesService();
    const logger = createMockLogger();
    const processor = new ArticleGenerationProcessor(articlesService, logger);
    const job = createMockJob({
      brandId: 'brand-xyz',
      organizationId: 'org-abc',
      transcriptId: 'transcript-999',
      userId: 'user-42',
    });

    await processor.process(job);

    expect(articlesService.generateFromTranscript).toHaveBeenCalledWith(
      'transcript-999',
      'user-42',
      'org-abc',
      'brand-xyz',
    );
  });

  it('should call updateProgress(10) before generateFromTranscript', async () => {
    const callOrder: string[] = [];
    const articlesService = createMockArticlesService({
      generateFromTranscript: vi.fn().mockImplementation(async () => {
        callOrder.push('generate');
        return { _id: 'article-1' };
      }),
    } as unknown as Partial<ArticlesService>);
    const logger = createMockLogger();
    const processor = new ArticleGenerationProcessor(articlesService, logger);
    const job = createMockJob(defaultJobData);
    (job.updateProgress as ReturnType<typeof vi.fn>).mockImplementation(
      async (progress: number) => {
        callOrder.push(`progress-${progress}`);
      },
    );

    await processor.process(job);

    expect(callOrder).toEqual(['progress-10', 'generate', 'progress-100']);
  });
});
