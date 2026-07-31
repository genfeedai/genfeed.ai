import {
  buildSocialReplyCampaignJobId,
  SOCIAL_REPLY_CAMPAIGN_JOB_NAME,
  SocialReplyCampaignQueueService,
} from '@api/queues/social-reply-campaign/social-reply-campaign-queue.service';
import { SOCIAL_REPLY_CAMPAIGN_QUEUE } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';

interface MockQueue {
  add: ReturnType<typeof vi.fn>;
  getJob: ReturnType<typeof vi.fn>;
}

const TICK = {
  campaignId: 'campaign-1',
  dispatchCursor: 3,
  organizationId: 'org-1',
};

describe('SocialReplyCampaignQueueService', () => {
  let service: SocialReplyCampaignQueueService;
  let queue: MockQueue;

  beforeEach(async () => {
    queue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
      getJob: vi.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialReplyCampaignQueueService,
        {
          provide: getQueueToken(SOCIAL_REPLY_CAMPAIGN_QUEUE),
          useValue: queue,
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    service = module.get(SocialReplyCampaignQueueService);
  });

  it('derives the job id from the campaign and its dispatch cursor', () => {
    expect(buildSocialReplyCampaignJobId('campaign-1', 3)).toBe(
      'social-reply-campaign-campaign-1-3',
    );
    // A bumped cursor mints a different id, which is what makes a resumed
    // campaign immune to the tick its pause left behind.
    expect(buildSocialReplyCampaignJobId('campaign-1', 4)).not.toBe(
      buildSocialReplyCampaignJobId('campaign-1', 3),
    );
  });

  describe('enqueueTick', () => {
    it('enqueues an immediate tick under the deterministic id', async () => {
      await service.enqueueTick(TICK);

      expect(queue.add).toHaveBeenCalledWith(
        SOCIAL_REPLY_CAMPAIGN_JOB_NAME,
        TICK,
        expect.objectContaining({
          delay: 0,
          jobId: 'social-reply-campaign-campaign-1-3',
        }),
      );
    });

    it('converts the pacing delay to milliseconds', async () => {
      await service.enqueueTick(TICK, 90);

      expect(queue.add).toHaveBeenCalledWith(
        SOCIAL_REPLY_CAMPAIGN_JOB_NAME,
        TICK,
        expect.objectContaining({ delay: 90_000 }),
      );
    });

    it('never enqueues with a negative delay', async () => {
      await service.enqueueTick(TICK, -30);

      expect(queue.add).toHaveBeenCalledWith(
        SOCIAL_REPLY_CAMPAIGN_JOB_NAME,
        TICK,
        expect.objectContaining({ delay: 0 }),
      );
    });

    it('skips the enqueue when the same tick is still in flight', async () => {
      queue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('delayed'),
        remove: vi.fn(),
      });

      const jobId = await service.enqueueTick(TICK);

      expect(jobId).toBe('social-reply-campaign-campaign-1-3');
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('reclaims the id from a completed tick and re-adds', async () => {
      const remove = vi.fn().mockResolvedValue(undefined);
      queue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('completed'),
        remove,
      });

      await service.enqueueTick(TICK);

      expect(remove).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeTick', () => {
    it('drops a delayed tick that a pause orphaned', async () => {
      const remove = vi.fn().mockResolvedValue(undefined);
      queue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('delayed'),
        remove,
      });

      await service.removeTick('campaign-1', 3);

      expect(queue.getJob).toHaveBeenCalledWith(
        'social-reply-campaign-campaign-1-3',
      );
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('leaves a running tick alone — it short-circuits on campaign status', async () => {
      const remove = vi.fn();
      queue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('active'),
        remove,
      });

      await service.removeTick('campaign-1', 3);

      expect(remove).not.toHaveBeenCalled();
    });

    it('is a no-op when no job exists for the cursor', async () => {
      await expect(
        service.removeTick('campaign-1', 3),
      ).resolves.toBeUndefined();
    });
  });
});
