import type { YouTubeAnalyticsJobData } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { BrokenCircuitError } from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Test } from '@nestjs/testing';
import { AnalyticsYouTubeJobService } from '@server/analytics/services/analytics-youtube-job.service';
import { AnalyticsYouTubeProcessor } from '@workers/processors/api/queues/analytics-youtube/analytics-youtube.processor';
import type { Job } from 'bullmq';

vi.mock(
  '@libs/utils/circuit-breaker/circuit-breaker.util',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@libs/utils/circuit-breaker/circuit-breaker.util')
      >();
    return {
      ...actual,
      createProcessorCircuitBreaker: vi.fn(() => ({
        execute: vi.fn((fn: () => Promise<unknown>) => fn()),
      })),
    };
  },
);

function makeJob(
  data: Partial<YouTubeAnalyticsJobData> = {},
): Job<YouTubeAnalyticsJobData> {
  return {
    data: {
      brandId: 'brand-1',
      organizationId: 'org-1',
      posts: [],
      ...data,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<YouTubeAnalyticsJobData>;
}

describe('AnalyticsYouTubeProcessor', () => {
  let processor: AnalyticsYouTubeProcessor;
  let analyticsYouTubeJobService: {
    process: ReturnType<typeof vi.fn>;
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    analyticsYouTubeJobService = {
      process: vi.fn().mockResolvedValue(undefined),
    };
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AnalyticsYouTubeProcessor,
        {
          provide: AnalyticsYouTubeJobService,
          useValue: analyticsYouTubeJobService,
        },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    processor = module.get(AnalyticsYouTubeProcessor);
  });

  it('delegates processing to the domain job service', async () => {
    const job = makeJob({
      posts: [
        {
          brand: 'brand-1',
          externalId: 'video-1',
          id: 'post-1',
          organization: 'org-1',
        },
      ],
    });

    await processor.process(job);

    expect(analyticsYouTubeJobService.process).toHaveBeenCalledWith(job);
  });

  it('propagates domain job service errors', async () => {
    analyticsYouTubeJobService.process.mockRejectedValue(
      new Error('YouTube API failed'),
    );

    await expect(processor.process(makeJob())).rejects.toThrow(
      'YouTube API failed',
    );
  });

  it('warns and rethrows when the circuit breaker is open', async () => {
    const { createProcessorCircuitBreaker } = await import(
      '@libs/utils/circuit-breaker/circuit-breaker.util'
    );
    const circuitError = new BrokenCircuitError('analytics-youtube', 5);
    (
      createProcessorCircuitBreaker as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({
      execute: vi.fn().mockRejectedValue(circuitError),
    });

    const module = await Test.createTestingModule({
      providers: [
        AnalyticsYouTubeProcessor,
        {
          provide: AnalyticsYouTubeJobService,
          useValue: analyticsYouTubeJobService,
        },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();
    const freshProcessor = module.get(AnalyticsYouTubeProcessor);

    await expect(freshProcessor.process(makeJob())).rejects.toBe(circuitError);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Circuit breaker open'),
    );
  });
});
