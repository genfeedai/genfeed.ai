import { SocialReplyCampaignDispatchService } from '@server/collections/social-inbox/services/social-reply-campaign-dispatch.service';
import type { SocialReplyCampaignJobData } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { BrokenCircuitError } from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Test } from '@nestjs/testing';
import { SocialReplyCampaignProcessor } from '@workers/processors/api/queues/social-reply-campaign/social-reply-campaign.processor';
import type { Job } from 'bullmq';

const JOB_DATA: SocialReplyCampaignJobData = {
  campaignId: 'campaign-1',
  dispatchCursor: 3,
  organizationId: 'org-1',
};

function buildJob(): Job<SocialReplyCampaignJobData> & {
  updateProgress: ReturnType<typeof vi.fn>;
} {
  return {
    data: JOB_DATA,
    updateProgress: vi.fn(),
  } as unknown as Job<SocialReplyCampaignJobData> & {
    updateProgress: ReturnType<typeof vi.fn>;
  };
}

describe('SocialReplyCampaignProcessor', () => {
  let processor: SocialReplyCampaignProcessor;
  let dispatchService: { dispatchTick: ReturnType<typeof vi.fn> };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    dispatchService = {
      dispatchTick: vi.fn().mockResolvedValue({ outcome: 'recipient-sent' }),
    };
    logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SocialReplyCampaignProcessor,
        {
          provide: SocialReplyCampaignDispatchService,
          useValue: dispatchService,
        },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    processor = module.get(SocialReplyCampaignProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('hands the whole tick payload to the dispatch service', async () => {
    const job = buildJob();

    const result = await processor.process(job);

    expect(dispatchService.dispatchTick).toHaveBeenCalledWith(JOB_DATA);
    expect(result).toEqual({ outcome: 'recipient-sent' });
    expect(job.updateProgress).toHaveBeenCalledWith(10);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('propagates a dispatch failure so BullMQ retries the same cursor', async () => {
    dispatchService.dispatchTick.mockRejectedValueOnce(
      new Error('Instagram API unavailable'),
    );

    await expect(processor.process(buildJob())).rejects.toThrow(
      'Instagram API unavailable',
    );
  });

  it('opens the circuit once the provider keeps failing', async () => {
    dispatchService.dispatchTick.mockRejectedValue(new Error('provider down'));

    // Five consecutive failures trip the breaker; the sixth tick is rejected
    // without touching the provider at all.
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(processor.process(buildJob())).rejects.toThrow(
        'provider down',
      );
    }

    dispatchService.dispatchTick.mockClear();

    await expect(processor.process(buildJob())).rejects.toThrow(
      BrokenCircuitError,
    );
    expect(dispatchService.dispatchTick).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
