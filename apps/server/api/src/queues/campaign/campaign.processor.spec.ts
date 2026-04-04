import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import {
  type CampaignProcessingJobData,
  CampaignProcessor,
} from '@api/queues/campaign/campaign.processor';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import { DmCampaignExecutorService } from '@api/services/campaign/dm-campaign-executor.service';
import { CampaignStatus, CampaignType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Job } from 'bullmq';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CampaignProcessor', () => {
  let processor: CampaignProcessor;
  let campaignsService: OutreachCampaignsService;
  let campaignExecutorService: CampaignExecutorService;
  let dmCampaignExecutorService: DmCampaignExecutorService;
  let logger: LoggerService;

  beforeEach(() => {
    campaignsService = {
      findOne: vi.fn(),
      findOneById: vi.fn(),
    } as any;

    campaignExecutorService = {
      processPendingTargets: vi.fn(),
    } as any;

    dmCampaignExecutorService = {
      processPendingDmTargets: vi.fn(),
    } as any;

    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as any;

    processor = new CampaignProcessor(
      campaignsService,
      campaignExecutorService,
      dmCampaignExecutorService,
      logger,
    );
  });

  describe('instantiation', () => {
    it('should be defined', () => {
      expect(processor).toBeDefined();
    });
  });

  describe('process', () => {
    it('should process active campaign successfully', async () => {
      const campaignId = new Types.ObjectId().toString();
      const organizationId = new Types.ObjectId().toString();

      const jobData: CampaignProcessingJobData = {
        campaignId,
        organizationId,
      };

      const job = {
        data: jobData,
        id: 'job-1',
        updateProgress: vi.fn(),
      } as unknown as Job<CampaignProcessingJobData>;

      const mockCampaign = {
        _id: new Types.ObjectId(campaignId),
        campaignType: CampaignType.REPLY,
        organization: new Types.ObjectId(organizationId),
        status: CampaignStatus.ACTIVE,
        targets: [],
      };

      vi.mocked(campaignsService.findOne).mockResolvedValue(
        mockCampaign as any,
      );

      vi.mocked(
        campaignExecutorService.processPendingTargets,
      ).mockResolvedValue({
        failed: 0,
        processed: 0,
        skipped: 0,
        successful: 0,
      } as any);

      vi.mocked(campaignsService.findOneById).mockResolvedValue(
        mockCampaign as any,
      );

      const result = await processor.process(job);

      expect(result).toHaveProperty('campaignId', campaignId);
      expect(result).toHaveProperty('processed');
      expect(result).toHaveProperty('successful');
      expect(result).toHaveProperty('failed');
      expect(campaignsService.findOne).toHaveBeenCalled();
    });

    it('should skip non-active campaign', async () => {
      const campaignId = new Types.ObjectId().toString();
      const organizationId = new Types.ObjectId().toString();

      const jobData: CampaignProcessingJobData = {
        campaignId,
        organizationId,
      };

      const job = {
        data: jobData,
        id: 'job-2',
        updateProgress: vi.fn(),
      } as unknown as Job<CampaignProcessingJobData>;

      const mockCampaign = {
        _id: new Types.ObjectId(campaignId),
        status: CampaignStatus.PAUSED,
      };

      vi.mocked(campaignsService.findOne).mockResolvedValue(
        mockCampaign as any,
      );

      const result = await processor.process(job);

      expect(result.skipped).toBe(0);
      expect(result.processed).toBe(0);
    });

    it('should throw error if campaign not found', async () => {
      const campaignId = new Types.ObjectId().toString();
      const organizationId = new Types.ObjectId().toString();

      const jobData: CampaignProcessingJobData = {
        campaignId,
        organizationId,
      };

      const job = {
        data: jobData,
        id: 'job-3',
        updateProgress: vi.fn(),
      } as unknown as Job<CampaignProcessingJobData>;

      vi.mocked(campaignsService.findOne).mockResolvedValue(null);

      await expect(processor.process(job)).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle circuit breaker errors', async () => {
      const campaignId = new Types.ObjectId().toString();
      const organizationId = new Types.ObjectId().toString();

      const jobData: CampaignProcessingJobData = {
        campaignId,
        organizationId,
      };

      const job = {
        data: jobData,
        id: 'job-4',
        updateProgress: vi.fn(),
      } as unknown as Job<CampaignProcessingJobData>;

      vi.mocked(campaignsService.findOne).mockRejectedValue(
        new Error('Service unavailable'),
      );

      await expect(processor.process(job)).rejects.toThrow();
    });
  });
});
