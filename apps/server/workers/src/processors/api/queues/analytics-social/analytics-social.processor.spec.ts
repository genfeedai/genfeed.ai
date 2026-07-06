import { CredentialPlatform } from '@genfeedai/enums';
import type { SocialAnalyticsJobData } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { AnalyticsSocialJobService } from '@server-domain/analytics/services/analytics-social-job.service';
import { AnalyticsSocialProcessor } from '@workers/processors/api/queues/analytics-social/analytics-social.processor';
import type { Job } from 'bullmq';

function makeJob(
  data: Partial<SocialAnalyticsJobData> = {},
): Job<SocialAnalyticsJobData> {
  return {
    data: {
      posts: [],
      ...data,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<SocialAnalyticsJobData>;
}

describe('AnalyticsSocialProcessor', () => {
  let processor: AnalyticsSocialProcessor;
  let analyticsSocialJobService: {
    process: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    analyticsSocialJobService = {
      process: vi.fn().mockResolvedValue(undefined),
    };
    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AnalyticsSocialProcessor,
        {
          provide: AnalyticsSocialJobService,
          useValue: analyticsSocialJobService,
        },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    processor = module.get(AnalyticsSocialProcessor);
  });

  it('delegates processing to the domain job service', async () => {
    const job = makeJob({
      posts: [
        {
          brand: 'brand-1',
          externalId: 'ig-123',
          id: 'post-1',
          organization: 'org-1',
          platform: CredentialPlatform.INSTAGRAM,
        },
      ],
    });

    await processor.process(job);

    expect(analyticsSocialJobService.process).toHaveBeenCalledWith(job);
  });

  it('propagates domain job service errors', async () => {
    analyticsSocialJobService.process.mockRejectedValue(
      new Error('Social analytics failed'),
    );

    await expect(processor.process(makeJob())).rejects.toThrow(
      'Social analytics failed',
    );
  });
});
