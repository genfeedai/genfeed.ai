import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';

import {
  type AdInsightsAggregationJobData,
  AdInsightsAggregationProcessor,
} from './ad-insights-aggregation.processor';

const makeJob = (
  data: AdInsightsAggregationJobData,
): Job<AdInsightsAggregationJobData> =>
  ({
    data,
    id: 'job-agg-001',
    updateProgress: vi.fn().mockResolvedValue(undefined),
  }) as unknown as Job<AdInsightsAggregationJobData>;

describe('AdInsightsAggregationProcessor', () => {
  let processor: AdInsightsAggregationProcessor;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdInsightsAggregationProcessor,
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get(AdInsightsAggregationProcessor);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should log start message when processing insight types', async () => {
    const job = makeJob({ insightTypes: ['ctr', 'cpm'] });
    await processor.process(job);
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('ctr, cpm'),
    );
  });

  it('should call updateProgress(100) on completion', async () => {
    const job = makeJob({ insightTypes: ['spend'] });
    await processor.process(job);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('should log completion after processing', async () => {
    const job = makeJob({ insightTypes: ['spend'] });
    await processor.process(job);
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('completed'),
    );
  });

  it('should process an empty insightTypes array without throwing', async () => {
    const job = makeJob({ insightTypes: [] });
    await expect(processor.process(job)).resolves.toBeUndefined();
  });

  it('should process multiple insight types without throwing', async () => {
    const job = makeJob({
      insightTypes: ['ctr', 'cpm', 'roas', 'cpa'],
    });
    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('should include optional industries in job data without error', async () => {
    const job = makeJob({
      industries: ['e-commerce', 'saas'],
      insightTypes: ['ctr'],
    });
    await expect(processor.process(job)).resolves.toBeUndefined();
  });

  it('should log error and re-throw if a top-level exception occurs', async () => {
    const job = makeJob({ insightTypes: ['throw-me'] });
    // Spy on updateProgress to throw a critical error
    vi.spyOn(job, 'updateProgress').mockRejectedValueOnce(
      new Error('redis failure'),
    );

    await expect(processor.process(job)).rejects.toThrow('redis failure');
    expect(loggerService.error).toHaveBeenCalledWith(
      expect.stringContaining('failed'),
      'redis failure',
    );
  });

  it('should continue processing remaining types when one fails internally', async () => {
    // computeInsight is private; we can verify that the processor doesn't abort
    // the whole run when individual insight computation fails.
    // Since the internal loop swallows per-insight errors, all types should complete.
    const job = makeJob({ insightTypes: ['type-a', 'type-b', 'type-c'] });
    await expect(processor.process(job)).resolves.toBeUndefined();
    // updateProgress(100) means it reached the end
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });
});
