import type { TwitterAnalyticsJobData } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { BrokenCircuitError } from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Test } from '@nestjs/testing';
import { AnalyticsTwitterJobService } from '@server-domain/analytics/services/analytics-twitter-job.service';
import { AnalyticsTwitterProcessor } from '@workers/processors/api/queues/analytics-twitter/analytics-twitter.processor';
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

const makeJob = (
  data: Partial<TwitterAnalyticsJobData> = {},
): Job<TwitterAnalyticsJobData> =>
  ({
    data: {
      credentialId: 'cred_123',
      posts: [],
      ...data,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  }) as unknown as Job<TwitterAnalyticsJobData>;

describe('AnalyticsTwitterProcessor', () => {
  let processor: AnalyticsTwitterProcessor;
  let analyticsTwitterJobService: {
    process: ReturnType<typeof vi.fn>;
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    analyticsTwitterJobService = {
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
        AnalyticsTwitterProcessor,
        {
          provide: AnalyticsTwitterJobService,
          useValue: analyticsTwitterJobService,
        },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    processor = module.get(AnalyticsTwitterProcessor);
  });

  afterEach(() => vi.clearAllMocks());

  it('delegates processing to the domain job service', async () => {
    const job = makeJob({
      posts: [
        {
          brand: 'brand_1',
          externalId: 'tweet_111',
          id: 'post_1',
          organization: 'org_1',
        },
      ],
    });

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(analyticsTwitterJobService.process).toHaveBeenCalledWith(job);
  });

  it('propagates domain job service errors', async () => {
    analyticsTwitterJobService.process.mockRejectedValue(
      new Error('Twitter API failed'),
    );

    await expect(processor.process(makeJob())).rejects.toThrow(
      'Twitter API failed',
    );
  });

  it('warns and rethrows when the circuit breaker is open', async () => {
    const { createProcessorCircuitBreaker } = await import(
      '@libs/utils/circuit-breaker/circuit-breaker.util'
    );
    const circuitError = new BrokenCircuitError('analytics-twitter', 5);
    (
      createProcessorCircuitBreaker as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({
      execute: vi.fn().mockRejectedValue(circuitError),
    });

    const module = await Test.createTestingModule({
      providers: [
        AnalyticsTwitterProcessor,
        {
          provide: AnalyticsTwitterJobService,
          useValue: analyticsTwitterJobService,
        },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();
    const freshProcessor = module.get(AnalyticsTwitterProcessor);

    await expect(freshProcessor.process(makeJob())).rejects.toBe(circuitError);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Circuit breaker open'),
    );
  });
});
