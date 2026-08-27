import { OutreachCampaignsService } from '@server/collections/outreach-campaigns/services/outreach-campaigns.service';
import { CampaignExecutorService } from '@server/services/campaign/campaign-executor.service';
import { DmCampaignExecutorService } from '@server/services/campaign/dm-campaign-executor.service';
import {
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
} from '@genfeedai/enums';
import type { CampaignProcessingJobData } from '@genfeedai/queue-contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { CampaignProcessor } from '@workers/processors/api/queues/campaign/campaign.processor';
import { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type CampaignRow = {
  campaignType?: string;
  id: string;
  isDeleted?: boolean;
  organizationId: string;
  platform?: string;
  status: string;
};

function createJob(
  data: CampaignProcessingJobData,
  id = 'job-1',
): Job<CampaignProcessingJobData> {
  return {
    data,
    id,
    updateProgress: vi.fn(),
  } as unknown as Job<CampaignProcessingJobData>;
}

describe('CampaignProcessor', () => {
  let processor: CampaignProcessor;
  const campaignsService = {
    findOneById: vi.fn(),
  };
  const campaignExecutorService = {
    processPendingTargets: vi.fn(),
  };
  const dmCampaignExecutorService = {
    processPendingDmTargets: vi.fn(),
  };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new CampaignProcessor(
      campaignsService as unknown as OutreachCampaignsService,
      campaignExecutorService as unknown as CampaignExecutorService,
      dmCampaignExecutorService as unknown as DmCampaignExecutorService,
      logger as unknown as LoggerService,
    );
  });

  describe('process', () => {
    it('reloads the campaign with organization, active, and non-deleted scope', async () => {
      const campaignId = testId('campaign');
      const organizationId = testId('organization');
      const campaign: CampaignRow = {
        campaignType: CampaignType.MANUAL,
        id: campaignId,
        isDeleted: false,
        organizationId,
        platform: CampaignPlatform.TWITTER,
        status: CampaignStatus.ACTIVE,
      };

      campaignsService.findOneById.mockResolvedValue(campaign);
      campaignExecutorService.processPendingTargets.mockResolvedValue({
        failed: 0,
        processed: 1,
        skipped: 0,
        successful: 1,
      });

      const result = await processor.process(
        createJob({ campaignId, organizationId, scheduleVersion: 1 }),
      );

      expect(campaignsService.findOneById).toHaveBeenCalledWith(
        campaignId,
        organizationId,
      );
      expect(
        campaignExecutorService.processPendingTargets,
      ).toHaveBeenCalledWith(campaign, 10);
      expect(result).toMatchObject({
        campaignId,
        processed: 1,
        successful: 1,
      });
    });

    it('skips a paused campaign before generation or provider calls', async () => {
      const campaignId = testId('campaign');
      const organizationId = testId('organization');
      campaignsService.findOneById.mockResolvedValue({
        id: campaignId,
        isDeleted: false,
        organizationId,
        status: CampaignStatus.PAUSED,
      });

      const result = await processor.process(
        createJob({ campaignId, organizationId, scheduleVersion: 1 }, 'job-2'),
      );

      expect(result).toEqual({
        campaignId,
        failed: 0,
        processed: 0,
        skipped: 1,
        successful: 0,
      });
      expect(
        campaignExecutorService.processPendingTargets,
      ).not.toHaveBeenCalled();
      expect(
        dmCampaignExecutorService.processPendingDmTargets,
      ).not.toHaveBeenCalled();
    });

    it('skips a deleted campaign before reading targets', async () => {
      const campaignId = testId('campaign');
      const organizationId = testId('organization');
      campaignsService.findOneById.mockResolvedValue(null);

      const result = await processor.process(
        createJob({ campaignId, organizationId, scheduleVersion: 1 }, 'job-3'),
      );

      expect(campaignsService.findOneById).toHaveBeenCalledWith(
        campaignId,
        organizationId,
      );
      expect(result.skipped).toBe(1);
      expect(
        campaignExecutorService.processPendingTargets,
      ).not.toHaveBeenCalled();
    });

    it('skips an unavailable pair before calling executors', async () => {
      const campaignId = testId('campaign');
      const organizationId = testId('organization');
      campaignsService.findOneById.mockResolvedValue({
        campaignType: CampaignType.MANUAL,
        id: campaignId,
        isDeleted: false,
        organizationId,
        platform: CampaignPlatform.REDDIT,
        status: CampaignStatus.ACTIVE,
      });

      const result = await processor.process(
        createJob(
          { campaignId, organizationId, scheduleVersion: 1 },
          'job-unavailable',
        ),
      );

      expect(result).toEqual({
        campaignId,
        failed: 0,
        processed: 0,
        skipped: 1,
        successful: 0,
      });
      expect(
        campaignExecutorService.processPendingTargets,
      ).not.toHaveBeenCalled();
      expect(
        dmCampaignExecutorService.processPendingDmTargets,
      ).not.toHaveBeenCalled();
    });

    it('fails closed on a cross-organization job before reading targets', async () => {
      const campaignId = testId('campaign');
      const organizationId = testId('organization');
      campaignsService.findOneById.mockResolvedValue({
        id: campaignId,
        isDeleted: false,
        organizationId: testId('other-org'),
        status: CampaignStatus.ACTIVE,
      });

      const result = await processor.process(
        createJob({ campaignId, organizationId, scheduleVersion: 1 }, 'job-4'),
      );

      expect(result.skipped).toBe(1);
      expect(
        campaignExecutorService.processPendingTargets,
      ).not.toHaveBeenCalled();
      expect(
        dmCampaignExecutorService.processPendingDmTargets,
      ).not.toHaveBeenCalled();
    });

    it('skips a stale schedule version before generation or provider calls', async () => {
      const campaignId = testId('campaign');
      const organizationId = testId('organization');
      campaignsService.findOneById.mockResolvedValue({
        campaignType: CampaignType.SCHEDULED_BLAST,
        id: campaignId,
        isDeleted: false,
        organizationId,
        platform: CampaignPlatform.TWITTER,
        schedule: {
          dueAt: '2026-08-24T12:00:00.000Z',
          version: 2,
        },
        status: CampaignStatus.ACTIVE,
      });

      const result = await processor.process(
        createJob(
          { campaignId, organizationId, scheduleVersion: 1 },
          'job-stale',
        ),
      );

      expect(result.skipped).toBe(1);
      expect(
        campaignExecutorService.processPendingTargets,
      ).not.toHaveBeenCalled();
    });

    it('skips a Scheduled Blast that is not yet due', async () => {
      const campaignId = testId('campaign');
      const organizationId = testId('organization');
      campaignsService.findOneById.mockResolvedValue({
        campaignType: CampaignType.SCHEDULED_BLAST,
        id: campaignId,
        isDeleted: false,
        organizationId,
        platform: CampaignPlatform.TWITTER,
        schedule: {
          dueAt: '2099-01-01T00:00:00.000Z',
          version: 1,
        },
        status: CampaignStatus.ACTIVE,
      });

      const result = await processor.process(
        createJob(
          { campaignId, organizationId, scheduleVersion: 1 },
          'job-early',
        ),
      );

      expect(result.skipped).toBe(1);
      expect(
        campaignExecutorService.processPendingTargets,
      ).not.toHaveBeenCalled();
    });

    it('rethrows transient failures so retries preserve target-level claims', async () => {
      const campaignId = testId('campaign');
      const organizationId = testId('organization');
      campaignsService.findOneById.mockRejectedValue(
        new Error('Service unavailable'),
      );

      await expect(
        processor.process(
          createJob(
            { campaignId, organizationId, scheduleVersion: 1 },
            'job-5',
          ),
        ),
      ).rejects.toThrow('Service unavailable');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.objectContaining({
          campaignId,
          organizationId,
          reason: 'campaign_processing_failed',
        }),
      );
    });
  });
});
