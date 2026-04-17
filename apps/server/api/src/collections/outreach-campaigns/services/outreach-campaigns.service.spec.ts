import { OutreachCampaign } from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CampaignStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('OutreachCampaignsService', () => {
  let service: OutreachCampaignsService;

  const orgId = 'test-object-id';
  const campaignId = 'test-object-id';

  const mockCampaign = {
    _id: campaignId,
    isDeleted: false,
    label: 'Test Campaign',
    organization: orgId,
    rateLimits: {
      currentDayCount: 0,
      currentHourCount: 0,
      dayResetAt: null,
      delayBetweenRepliesSeconds: 60,
      hourResetAt: null,
      maxPerDay: 50,
      maxPerHour: 10,
    },
    startedAt: new Date('2026-01-01'),
    status: CampaignStatus.ACTIVE,
    totalDmsSent: 0,
    totalFailed: 0,
    totalReplies: 10,
    totalSkipped: 0,
    totalSuccessful: 8,
    totalTargets: 10,
  };

  const mockModel: Record<string, any> = Object.assign(
    vi.fn().mockImplementation((dto: Record<string, unknown>) => ({
      ...dto,
      save: vi.fn().mockResolvedValue({ _id: 'test-object-id', ...dto }),
    })),
    {
      aggregate: vi
        .fn()
        .mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
      aggregatePaginate: vi.fn().mockResolvedValue({
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 20,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: 0,
        totalPages: 1,
      }),
      collection: { name: 'outreach-campaigns' },
      deleteMany: vi.fn(),
      find: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([mockCampaign]),
        lean: vi
          .fn()
          .mockReturnValue({ exec: vi.fn().mockResolvedValue([mockCampaign]) }),
        populate: vi.fn().mockReturnThis(),
      }),
      findById: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockCampaign),
        populate: vi
          .fn()
          .mockReturnValue({ exec: vi.fn().mockResolvedValue(mockCampaign) }),
      }),
      findByIdAndDelete: vi.fn(),
      findByIdAndUpdate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockCampaign),
        populate: vi
          .fn()
          .mockReturnValue({ exec: vi.fn().mockResolvedValue(mockCampaign) }),
      }),
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockCampaign),
        populate: vi.fn().mockReturnThis(),
      }),
      modelName: 'OutreachCampaign',
      updateMany: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
      }),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    },
  );

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutreachCampaignsService,
        { provide: PrismaService, useValue: mockModel },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<OutreachCampaignsService>(OutreachCampaignsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOneById', () => {
    it('should find campaign by id and organization', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(mockCampaign as never);

      const result = await service.findOneById(
        campaignId.toString(),
        orgId.toString(),
      );

      expect(result).toEqual(mockCampaign);
      expect(service.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(string),
          isDeleted: false,
          organization: expect.any(string),
        }),
      );
    });

    it('should include brand filter when provided', async () => {
      const brandId = 'test-object-id'.toString();
      vi.spyOn(service, 'findOne').mockResolvedValue(mockCampaign as never);

      await service.findOneById(
        campaignId.toString(),
        orgId.toString(),
        brandId,
      );

      expect(service.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: new string(brandId),
        }),
      );
    });

    it('should return null when campaign not found', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(null);

      const result = await service.findOneById(
        'test-object-id'.toString(),
        orgId.toString(),
      );

      expect(result).toBeNull();
    });
  });

  describe('findByOrganization', () => {
    it('should return campaigns for organization', async () => {
      const result = await service.findByOrganization(orgId.toString());

      expect(result).toEqual([mockCampaign]);
      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
          organization: expect.any(string),
        }),
      );
    });
  });

  describe('findActive', () => {
    it('should return only active campaigns', async () => {
      const result = await service.findActive(orgId.toString());

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
          status: CampaignStatus.ACTIVE,
        }),
      );
      expect(result).toEqual([mockCampaign]);
    });
  });

  describe('findByStatus', () => {
    it('should filter by status', async () => {
      await service.findByStatus(orgId.toString(), CampaignStatus.PAUSED);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: CampaignStatus.PAUSED }),
      );
    });
  });

  describe('start', () => {
    it('should start a draft campaign', async () => {
      const draftCampaign = { ...mockCampaign, status: CampaignStatus.DRAFT };
      vi.spyOn(service, 'findOneById').mockResolvedValue(
        draftCampaign as never,
      );
      vi.spyOn(service, 'patch').mockResolvedValue({
        ...draftCampaign,
        status: CampaignStatus.ACTIVE,
      } as never);

      const result = await service.start(
        campaignId.toString(),
        orgId.toString(),
      );

      expect(service.patch).toHaveBeenCalledWith(
        campaignId.toString(),
        expect.objectContaining({ status: CampaignStatus.ACTIVE }),
      );
      expect(result.status).toBe(CampaignStatus.ACTIVE);
    });

    it('should return campaign as-is if already active', async () => {
      vi.spyOn(service, 'findOneById').mockResolvedValue(mockCampaign as never);

      const result = await service.start(
        campaignId.toString(),
        orgId.toString(),
      );

      expect(result).toEqual(mockCampaign);
    });

    it('should throw NotFoundException if campaign not found', async () => {
      vi.spyOn(service, 'findOneById').mockResolvedValue(null);

      await expect(
        service.start('test-object-id'.toString(), orgId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('pause', () => {
    it('should pause an active campaign', async () => {
      vi.spyOn(service, 'findOneById').mockResolvedValue(mockCampaign as never);
      vi.spyOn(service, 'patch').mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.PAUSED,
      } as never);

      const result = await service.pause(
        campaignId.toString(),
        orgId.toString(),
      );

      expect(result.status).toBe(CampaignStatus.PAUSED);
    });

    it('should return campaign as-is if not active', async () => {
      const paused = { ...mockCampaign, status: CampaignStatus.PAUSED };
      vi.spyOn(service, 'findOneById').mockResolvedValue(paused as never);

      const result = await service.pause(
        campaignId.toString(),
        orgId.toString(),
      );

      expect(result.status).toBe(CampaignStatus.PAUSED);
    });

    it('should throw NotFoundException if campaign not found', async () => {
      vi.spyOn(service, 'findOneById').mockResolvedValue(null);

      await expect(
        service.pause('test-object-id'.toString(), orgId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('complete', () => {
    it('should complete a campaign and set completedAt', async () => {
      vi.spyOn(service, 'findOneById').mockResolvedValue(mockCampaign as never);
      vi.spyOn(service, 'patch').mockResolvedValue({
        ...mockCampaign,
        completedAt: expect.any(Date),
        status: CampaignStatus.COMPLETED,
      } as never);

      const result = await service.complete(
        campaignId.toString(),
        orgId.toString(),
      );

      expect(service.patch).toHaveBeenCalledWith(
        campaignId.toString(),
        expect.objectContaining({ status: CampaignStatus.COMPLETED }),
      );
      expect(result.status).toBe(CampaignStatus.COMPLETED);
    });
  });

  describe('incrementReplyCounters', () => {
    it('should call updateOne with $inc for reply counters', async () => {
      await service.incrementReplyCounters(campaignId.toString());

      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(string) },
        expect.objectContaining({
          $inc: expect.objectContaining({
            'rateLimits.currentDayCount': 1,
            'rateLimits.currentHourCount': 1,
            totalReplies: 1,
            totalSuccessful: 1,
          }),
        }),
      );
    });
  });

  describe('incrementFailedCounter', () => {
    it('should increment totalFailed', async () => {
      await service.incrementFailedCounter(campaignId.toString());

      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(string) },
        expect.objectContaining({
          $inc: expect.objectContaining({ totalFailed: 1 }),
        }),
      );
    });
  });

  describe('incrementSkippedCounter', () => {
    it('should increment totalSkipped', async () => {
      await service.incrementSkippedCounter(campaignId.toString());

      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(string) },
        expect.objectContaining({
          $inc: expect.objectContaining({ totalSkipped: 1 }),
        }),
      );
    });
  });

  describe('incrementTargetsCount', () => {
    it('should increment totalTargets by count', async () => {
      await service.incrementTargetsCount(campaignId.toString(), 5);

      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(string) },
        expect.objectContaining({
          $inc: expect.objectContaining({ totalTargets: 5 }),
        }),
      );
    });

    it('should default to increment by 1', async () => {
      await service.incrementTargetsCount(campaignId.toString());

      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(string) },
        expect.objectContaining({
          $inc: expect.objectContaining({ totalTargets: 1 }),
        }),
      );
    });
  });

  describe('getAnalytics', () => {
    it('should return analytics with success rate', async () => {
      vi.spyOn(service, 'findOneById').mockResolvedValue({
        ...mockCampaign,
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
      } as never);

      const analytics = await service.getAnalytics(
        campaignId.toString(),
        orgId.toString(),
      );

      expect(analytics.campaign).toEqual(
        expect.objectContaining({
          _id: mockCampaign._id,
          totalReplies: mockCampaign.totalReplies,
          totalSuccessful: mockCampaign.totalSuccessful,
        }),
      );
      expect(analytics.successRate).toBe(80);
      expect(analytics.repliesPerHour).toBeGreaterThan(0);
    });

    it('should return 0 success rate when no replies', async () => {
      const noReplies = {
        ...mockCampaign,
        totalReplies: 0,
        totalSuccessful: 0,
      };
      vi.spyOn(service, 'findOneById').mockResolvedValue(noReplies as never);

      const analytics = await service.getAnalytics(
        campaignId.toString(),
        orgId.toString(),
      );

      expect(analytics.successRate).toBe(0);
    });

    it('should throw NotFoundException for missing campaign', async () => {
      vi.spyOn(service, 'findOneById').mockResolvedValue(null);

      await expect(
        service.getAnalytics('test-object-id'.toString(), orgId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('canReply', () => {
    it('should return false when campaign not found', async () => {
      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.canReply(
        campaignId.toString(),
        orgId.toString(),
      );

      expect(result).toBe(false);
    });

    it('should return false when campaign is not active', async () => {
      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...mockCampaign,
          status: CampaignStatus.PAUSED,
        }),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.canReply(
        campaignId.toString(),
        orgId.toString(),
      );

      expect(result).toBe(false);
    });

    it('should return true when hourly counter is expired (resets)', async () => {
      const pastHour = new Date();
      pastHour.setHours(pastHour.getHours() - 1);
      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...mockCampaign,
          rateLimits: {
            ...mockCampaign.rateLimits,
            currentHourCount: 100,
            hourResetAt: pastHour,
          },
        }),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.canReply(
        campaignId.toString(),
        orgId.toString(),
      );

      expect(result).toBe(true);
    });

    it('should return false when hourly limit exceeded', async () => {
      const futureHour = new Date();
      futureHour.setHours(futureHour.getHours() + 1);
      const futureDay = new Date();
      futureDay.setDate(futureDay.getDate() + 1);
      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...mockCampaign,
          rateLimits: {
            ...mockCampaign.rateLimits,
            currentDayCount: 5,
            currentHourCount: 10,
            dayResetAt: futureDay,
            hourResetAt: futureHour,
            maxPerDay: 50,
            maxPerHour: 10,
          },
        }),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.canReply(
        campaignId.toString(),
        orgId.toString(),
      );

      expect(result).toBe(false);
    });
  });
});
