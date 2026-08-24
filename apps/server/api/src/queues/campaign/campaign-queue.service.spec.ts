import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { CampaignStatus } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCampaignProcessingJobId,
  CampaignQueueService,
  MAX_ACTIVE_CAMPAIGNS_PER_DISPATCH,
} from './campaign-queue.service';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('dispatchActiveCampaigns'),
  },
}));

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const organizationId = testId('organization');
const campaignId = testId('campaign');

const makeCampaign = (overrides: Record<string, unknown> = {}) => ({
  id: campaignId,
  isDeleted: false,
  organizationId,
  status: CampaignStatus.ACTIVE,
  ...overrides,
});

describe('CampaignQueueService', () => {
  let service: CampaignQueueService;

  const mockCampaignQueue = {
    add: vi.fn(),
    getActiveCount: vi.fn(),
    getCompletedCount: vi.fn(),
    getFailedCount: vi.fn(),
    getJob: vi.fn(),
    getWaitingCount: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };

  const mockOutreachCampaignsService = {
    findActiveForDispatch: vi.fn(),
    findOneById: vi.fn(),
  };

  const mockLogger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
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

    service = module.get<CampaignQueueService>(CampaignQueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('production reachability', () => {
    it('does not schedule product dispatch with a static @Cron decorator', () => {
      const source = readFileSync(
        path.join(SPEC_DIR, 'campaign-queue.service.ts'),
        'utf8',
      );

      expect(source).not.toMatch(/@Cron\s*\(/);
      expect(source).not.toContain('CronExpression');
    });

    it('is not called from outreach campaign Start (Start only flips status)', () => {
      const startSource = readFileSync(
        path.resolve(
          SPEC_DIR,
          '../../collections/outreach-campaigns/services/outreach-campaigns.service.ts',
        ),
        'utf8',
      );
      const startMethod = startSource.slice(
        startSource.indexOf('async start('),
        startSource.indexOf('async pause('),
      );

      expect(startMethod).not.toContain('triggerProcessing');
      expect(startMethod).not.toContain('dispatchActiveCampaigns');
      expect(startMethod).not.toContain('CampaignQueueService');
      expect(startMethod).toContain('status: CampaignStatus.ACTIVE');
    });
  });

  describe('onModuleInit()', () => {
    it('should log initialization', () => {
      service.onModuleInit();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('initialized'),
      );
    });
  });

  describe('dispatchActiveCampaigns()', () => {
    it('queues jobs for eligible active campaigns in the organization', async () => {
      const secondCampaignId = testId('campaign-two');
      mockOutreachCampaignsService.findActiveForDispatch.mockResolvedValue([
        makeCampaign(),
        makeCampaign({ id: secondCampaignId }),
      ]);
      mockCampaignQueue.getJob.mockResolvedValue(null);
      mockCampaignQueue.add.mockResolvedValue({ id: 'job-1' });

      const result = await service.dispatchActiveCampaigns(organizationId);

      expect(
        mockOutreachCampaignsService.findActiveForDispatch,
      ).toHaveBeenCalledWith(organizationId);
      expect(mockCampaignQueue.add).toHaveBeenCalledTimes(2);
      expect(mockCampaignQueue.add).toHaveBeenCalledWith(
        'process',
        {
          campaignId,
          organizationId,
          scheduleVersion: 1,
        },
        expect.objectContaining({
          jobId: buildCampaignProcessingJobId(campaignId),
        }),
      );
      expect(result).toMatchObject({
        enqueued: 2,
        failed: 0,
        organizationId,
        status: 'completed',
      });
    });

    it('completes without creating jobs when no eligible campaigns exist', async () => {
      mockOutreachCampaignsService.findActiveForDispatch.mockResolvedValue([]);

      const result = await service.dispatchActiveCampaigns(organizationId);

      expect(mockCampaignQueue.add).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        enqueued: 0,
        organizationId,
        reason: 'no_active_campaigns',
        status: 'skipped',
      });
    });

    it('does not enqueue paused, deleted, or moved campaigns', async () => {
      mockOutreachCampaignsService.findActiveForDispatch.mockResolvedValue([
        makeCampaign({ isDeleted: true }),
        makeCampaign({ organizationId: testId('other-org') }),
        makeCampaign({ id: '' }),
      ]);

      const result = await service.dispatchActiveCampaigns(organizationId);

      expect(mockCampaignQueue.add).not.toHaveBeenCalled();
      expect(result.skipped).toBe(3);
      expect(result.enqueued).toBe(0);
    });

    it('produces one logical processing claim when two ticks overlap', async () => {
      mockOutreachCampaignsService.findActiveForDispatch.mockResolvedValue([
        makeCampaign(),
      ]);
      mockCampaignQueue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('active'),
        remove: vi.fn(),
      });

      const first = await service.dispatchActiveCampaigns(organizationId);
      const second = await service.dispatchActiveCampaigns(organizationId);

      expect(mockCampaignQueue.add).not.toHaveBeenCalled();
      expect(first.alreadyQueued).toBe(1);
      expect(second.alreadyQueued).toBe(1);
    });

    it('reclaims a completed job id so the next tick can enqueue again', async () => {
      const remove = vi.fn().mockResolvedValue(undefined);
      mockOutreachCampaignsService.findActiveForDispatch.mockResolvedValue([
        makeCampaign(),
      ]);
      mockCampaignQueue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('completed'),
        remove,
      });
      mockCampaignQueue.add.mockResolvedValue({
        id: buildCampaignProcessingJobId(campaignId),
      });

      const result = await service.dispatchActiveCampaigns(organizationId);

      expect(remove).toHaveBeenCalledTimes(1);
      expect(mockCampaignQueue.add).toHaveBeenCalledTimes(1);
      expect(result.enqueued).toBe(1);
    });

    it('emits a sanitized diagnostic and does not mark delivery successful when enqueue fails', async () => {
      mockOutreachCampaignsService.findActiveForDispatch.mockResolvedValue([
        makeCampaign(),
      ]);
      mockCampaignQueue.getJob.mockResolvedValue(null);
      mockCampaignQueue.add.mockRejectedValue(
        new Error('redis token=sk-secret message=hello'),
      );

      const result = await service.dispatchActiveCampaigns(organizationId);

      expect(result).toMatchObject({
        enqueued: 0,
        failed: 1,
        reason: 'campaign_enqueue_failed',
        status: 'failed',
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('enqueue failed'),
        expect.objectContaining({
          campaignId,
          organizationId,
          reason: 'campaign_enqueue_failed',
        }),
      );
      const diagnostic = JSON.stringify(mockLogger.error.mock.calls);
      expect(diagnostic).not.toContain('sk-secret');
      expect(diagnostic).not.toContain('hello');
    });

    it('bounds a large active-campaign set', async () => {
      const campaigns = Array.from(
        { length: MAX_ACTIVE_CAMPAIGNS_PER_DISPATCH + 5 },
        (_, index) => makeCampaign({ id: `campaign-${index}` }),
      );
      mockOutreachCampaignsService.findActiveForDispatch.mockResolvedValue(
        campaigns,
      );
      mockCampaignQueue.getJob.mockResolvedValue(null);
      mockCampaignQueue.add.mockResolvedValue({ id: 'job-1' });

      const result = await service.dispatchActiveCampaigns(organizationId);

      expect(mockCampaignQueue.add).toHaveBeenCalledTimes(
        MAX_ACTIVE_CAMPAIGNS_PER_DISPATCH,
      );
      expect(result.skipped).toBe(5);
    });
  });

  describe('triggerProcessing()', () => {
    it('should add job to queue and return deterministic job id', async () => {
      mockCampaignQueue.getJob.mockResolvedValue(null);
      mockCampaignQueue.add.mockResolvedValue({
        id: buildCampaignProcessingJobId('campaign-abc'),
      });

      const jobId = await service.triggerProcessing('campaign-abc', 'org-123');

      expect(jobId).toBe(buildCampaignProcessingJobId('campaign-abc'));
    });

    it('should use deterministic job id format', async () => {
      mockCampaignQueue.getJob.mockResolvedValue(null);
      mockCampaignQueue.add.mockResolvedValue({ id: 'campaign-xyz' });

      await service.triggerProcessing('xyz', 'org-456');

      expect(mockCampaignQueue.getJob).toHaveBeenCalledWith('campaign-xyz');
    });

    it('surfaces queue failures instead of presenting a false success', async () => {
      mockCampaignQueue.getJob.mockRejectedValue(new Error('Queue error'));

      await expect(
        service.triggerProcessing('campaign-fail', 'org-123'),
      ).rejects.toThrow('Queue error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.objectContaining({
          reason: 'campaign_enqueue_failed',
        }),
      );
    });
  });

  describe('getQueueStatus()', () => {
    it('should return queue counts from all states', async () => {
      mockCampaignQueue.getWaitingCount.mockResolvedValue(3);
      mockCampaignQueue.getActiveCount.mockResolvedValue(1);
      mockCampaignQueue.getCompletedCount.mockResolvedValue(50);
      mockCampaignQueue.getFailedCount.mockResolvedValue(2);

      const status = await service.getQueueStatus();

      expect(status).toEqual({
        active: 1,
        completed: 50,
        failed: 2,
        waiting: 3,
      });
    });
  });

  describe('pauseProcessing()', () => {
    it('should pause the queue', async () => {
      mockCampaignQueue.pause.mockResolvedValue(undefined);

      await service.pauseProcessing();

      expect(mockCampaignQueue.pause).toHaveBeenCalledTimes(1);
    });

    it('should log pause action', async () => {
      mockCampaignQueue.pause.mockResolvedValue(undefined);

      await service.pauseProcessing();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('paused'),
      );
    });
  });

  describe('resumeProcessing()', () => {
    it('should resume the queue', async () => {
      mockCampaignQueue.resume.mockResolvedValue(undefined);

      await service.resumeProcessing();

      expect(mockCampaignQueue.resume).toHaveBeenCalledTimes(1);
    });

    it('should log resume action', async () => {
      mockCampaignQueue.resume.mockResolvedValue(undefined);

      await service.resumeProcessing();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('resumed'),
      );
    });
  });
});
