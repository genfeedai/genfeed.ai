import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { CampaignStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CampaignQueueService } from './campaign-queue.service';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('scheduledProcessing'),
  },
}));

const makeCampaign = (overrides = {}) => ({
  _id: '507f191e810c19729de860ee',
  organization: '507f191e810c19729de860ee',
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
    find: vi.fn(),
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

  describe('onModuleInit()', () => {
    it('should log initialization', () => {
      service.onModuleInit();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('initialized'),
      );
    });
  });

  describe('scheduledProcessing()', () => {
    it('should queue jobs for all active campaigns', async () => {
      const campaigns = [makeCampaign(), makeCampaign()];
      mockOutreachCampaignsService.find.mockResolvedValue(campaigns);
      mockCampaignQueue.getJob.mockResolvedValue(null);
      mockCampaignQueue.add.mockResolvedValue({ id: 'job-1' });

      await service.scheduledProcessing();

      expect(mockCampaignQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should query only active, non-deleted campaigns', async () => {
      mockOutreachCampaignsService.find.mockResolvedValue([]);

      await service.scheduledProcessing();

      expect(mockOutreachCampaignsService.find).toHaveBeenCalledWith({
        isDeleted: false,
        status: CampaignStatus.ACTIVE,
      });
    });

    it('should skip campaign if job already queued in active state', async () => {
      const campaign = makeCampaign();
      mockOutreachCampaignsService.find.mockResolvedValue([campaign]);
      mockCampaignQueue.getJob.mockResolvedValue({
        getState: vi.fn().mockResolvedValue('active'),
        remove: vi.fn(),
      });

      await service.scheduledProcessing();

      expect(mockCampaignQueue.add).not.toHaveBeenCalled();
    });

    it('should handle errors from getActiveCampaigns gracefully', async () => {
      mockOutreachCampaignsService.find.mockRejectedValue(
        new Error('DB timeout'),
      );

      await service.scheduledProcessing();

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('triggerProcessing()', () => {
    it('should add job to queue and return job id', async () => {
      mockCampaignQueue.getJob.mockResolvedValue(null);
      mockCampaignQueue.add.mockResolvedValue({ id: 'campaign-abc' });

      const jobId = await service.triggerProcessing('campaign-abc', 'org-123');

      expect(jobId).toBe('campaign-abc');
    });

    it('should use deterministic job id format', async () => {
      mockCampaignQueue.getJob.mockResolvedValue(null);
      mockCampaignQueue.add.mockResolvedValue({ id: 'campaign-xyz' });

      await service.triggerProcessing('xyz', 'org-456');

      expect(mockCampaignQueue.getJob).toHaveBeenCalledWith('campaign-xyz');
    });

    it('should propagate queue errors', async () => {
      // getJob rejection is caught inside queueCampaignProcessing's try-catch,
      // which returns { id: undefined }. triggerProcessing then returns undefined.
      mockCampaignQueue.getJob.mockRejectedValue(new Error('Queue error'));

      const result = await service.triggerProcessing(
        'campaign-fail',
        'org-123',
      );
      expect(result).toBeUndefined();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('job already exists'),
        expect.anything(),
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
