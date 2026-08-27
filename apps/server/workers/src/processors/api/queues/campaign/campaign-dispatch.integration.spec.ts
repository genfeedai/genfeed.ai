import { OutreachCampaignsService } from '@server/collections/outreach-campaigns/services/outreach-campaigns.service';
import { CampaignQueueService } from '@server/queues/campaign/campaign-queue.service';
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
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { CampaignProcessor } from '@workers/processors/api/queues/campaign/campaign.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('outreach campaign dispatch integration', () => {
  const organizationId = testId('organization');
  const campaignId = testId('campaign');
  const campaign = {
    campaignType: CampaignType.MANUAL,
    id: campaignId,
    isDeleted: false,
    organizationId,
    platform: CampaignPlatform.TWITTER,
    status: CampaignStatus.ACTIVE,
  };

  const mockCampaignQueue = {
    add: vi.fn(),
    getJob: vi.fn(),
  };
  const mockOutreachCampaignsService = {
    findActiveForDispatch: vi.fn(),
    findOneById: vi.fn(),
  };
  const mockCampaignExecutorService = {
    processPendingTargets: vi.fn(),
  };
  const mockDmCampaignExecutorService = {
    processPendingDmTargets: vi.fn(),
  };
  const mockLogger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let queueService: CampaignQueueService;
  let processor: CampaignProcessor;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCampaignQueue.getJob.mockResolvedValue(null);
    mockCampaignQueue.add.mockImplementation(
      async (
        _name: string,
        data: CampaignProcessingJobData,
        options: { jobId: string },
      ) => ({
        data,
        id: options.jobId,
      }),
    );
    mockOutreachCampaignsService.findActiveForDispatch.mockResolvedValue([
      campaign,
    ]);
    mockOutreachCampaignsService.findOneById.mockResolvedValue(campaign);
    mockCampaignExecutorService.processPendingTargets.mockResolvedValue({
      failed: 0,
      processed: 1,
      skipped: 0,
      successful: 1,
    });

    const module = await Test.createTestingModule({
      providers: [
        CampaignQueueService,
        {
          provide: getQueueToken('campaign-processing'),
          useValue: mockCampaignQueue,
        },
        {
          provide: OutreachCampaignsService,
          useValue: mockOutreachCampaignsService,
        },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    queueService = module.get(CampaignQueueService);
    processor = new CampaignProcessor(
      mockOutreachCampaignsService as unknown as OutreachCampaignsService,
      mockCampaignExecutorService as unknown as CampaignExecutorService,
      mockDmCampaignExecutorService as unknown as DmCampaignExecutorService,
      mockLogger as unknown as LoggerService,
    );
  });

  it('takes an eligible started campaign from dispatch through the worker to the executor', async () => {
    const dispatch = await queueService.dispatchActiveCampaigns(organizationId);

    expect(dispatch).toMatchObject({
      enqueued: 1,
      organizationId,
      status: 'completed',
    });
    expect(mockCampaignQueue.add).toHaveBeenCalledWith(
      'process',
      { campaignId, organizationId, scheduleVersion: 1 },
      expect.objectContaining({ jobId: `campaign-${campaignId}` }),
    );

    const queued = mockCampaignQueue.add.mock.calls[0] as [
      string,
      CampaignProcessingJobData,
      { jobId: string },
    ];
    expect(queued[1]).toEqual({
      campaignId,
      organizationId,
      scheduleVersion: 1,
    });
    const job = {
      data: queued[1],
      id: queued[2].jobId,
      updateProgress: vi.fn(),
    } as unknown as Job<CampaignProcessingJobData>;

    const result = await processor.process(job);

    expect(mockOutreachCampaignsService.findOneById).toHaveBeenCalledWith(
      campaignId,
      organizationId,
    );
    expect(
      mockCampaignExecutorService.processPendingTargets,
    ).toHaveBeenCalledWith(campaign, 10);
    expect(
      mockDmCampaignExecutorService.processPendingDmTargets,
    ).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      campaignId,
      processed: 1,
      successful: 1,
    });
  });

  it('takes a due Scheduled Blast from dispatch through the worker to one executor call', async () => {
    const scheduledCampaign = {
      ...campaign,
      campaignType: CampaignType.SCHEDULED_BLAST,
      schedule: {
        dueAt: '2026-08-24T12:00:00.000Z',
        version: 1,
      },
    };
    mockOutreachCampaignsService.findActiveForDispatch.mockResolvedValue([
      scheduledCampaign,
    ]);
    mockOutreachCampaignsService.findOneById.mockResolvedValue(
      scheduledCampaign,
    );

    const dispatch = await queueService.dispatchActiveCampaigns(organizationId);

    expect(dispatch.enqueued).toBe(1);
    expect(mockCampaignQueue.add).toHaveBeenCalledWith(
      'process',
      { campaignId, organizationId, scheduleVersion: 1 },
      expect.objectContaining({ jobId: `campaign-${campaignId}` }),
    );

    const result = await processor.process({
      data: { campaignId, organizationId, scheduleVersion: 1 },
      id: `campaign-${campaignId}`,
      updateProgress: vi.fn(),
    } as unknown as Job<CampaignProcessingJobData>);

    expect(
      mockCampaignExecutorService.processPendingTargets,
    ).toHaveBeenCalledWith(scheduledCampaign, 10);
    expect(result.successful).toBe(1);
  });
});
