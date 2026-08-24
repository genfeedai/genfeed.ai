import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { CampaignQueueService } from '@api/queues/campaign/campaign-queue.service';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import { DmCampaignExecutorService } from '@api/services/campaign/dm-campaign-executor.service';
import { CampaignStatus, CampaignType } from '@genfeedai/enums';
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
    campaignType: CampaignType.REPLY,
    id: campaignId,
    isDeleted: false,
    organizationId,
    status: CampaignStatus.ACTIVE,
  };

  const mockCampaignQueue = {
    add: vi.fn(),
    getJob: vi.fn(),
  };
  const mockOutreachCampaignsService = {
    find: vi.fn(),
    findOne: vi.fn(),
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
    mockOutreachCampaignsService.find.mockResolvedValue([campaign]);
    mockOutreachCampaignsService.findOne.mockResolvedValue(campaign);
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
      { campaignId, organizationId },
      expect.objectContaining({ jobId: `campaign-${campaignId}` }),
    );

    const queued = mockCampaignQueue.add.mock.calls[0] as [
      string,
      CampaignProcessingJobData,
      { jobId: string },
    ];
    const job = {
      data: queued[1],
      id: queued[2].jobId,
      updateProgress: vi.fn(),
    } as unknown as Job<CampaignProcessingJobData>;

    const result = await processor.process(job);

    expect(mockOutreachCampaignsService.findOne).toHaveBeenCalledWith({
      id: campaignId,
      isDeleted: false,
      organizationId,
    });
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
});
