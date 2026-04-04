vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { SubscriptionAttributionsController } from '@api/collections/subscription-attributions/controllers/subscription-attributions.controller';
import { TrackSubscriptionDto } from '@api/collections/subscription-attributions/dto/track-subscription.dto';
import { SubscriptionAttributionsService } from '@api/collections/subscription-attributions/services/subscription-attributions.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('SubscriptionAttributionsController', () => {
  let controller: SubscriptionAttributionsController;
  let service: SubscriptionAttributionsService;

  const mockUser: User = {
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockReq = {} as Request;

  const mockSubscriptionAttributionsService = {
    getContentSubscriptionStats: vi.fn(),
    getTopContentBySubscriptions: vi.fn(),
    trackSubscription: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionAttributionsController],
      providers: [
        {
          provide: SubscriptionAttributionsService,
          useValue: mockSubscriptionAttributionsService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SubscriptionAttributionsController>(
      SubscriptionAttributionsController,
    );
    service = module.get<SubscriptionAttributionsService>(
      SubscriptionAttributionsService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('trackSubscription', () => {
    it('should track a subscription attribution', async () => {
      const dto: TrackSubscriptionDto = {
        contentId: 'content123',
        platform: 'youtube',
        subscriberId: 'sub123',
      };

      const tracked = {
        contentId: dto.contentId,
        id: 'attribution123',
        platform: dto.platform,
        subscriberId: dto.subscriberId,
        trackedAt: new Date(),
      };

      mockSubscriptionAttributionsService.trackSubscription.mockResolvedValue(
        tracked,
      );

      const result = await controller.trackSubscription(mockReq, dto, mockUser);

      expect(service.trackSubscription).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual(tracked);
    });
  });

  describe('getContentSubscriptionStats', () => {
    it('should return subscription stats for content', async () => {
      const contentId = 'content123';
      const stats = {
        contentId,
        platforms: {
          instagram: 50,
          youtube: 100,
        },
        subscriptionRate: 0.15,
        totalSubscriptions: 150,
      };

      mockSubscriptionAttributionsService.getContentSubscriptionStats.mockResolvedValue(
        stats,
      );

      const result = await controller.getContentSubscriptionStats(
        contentId,
        mockUser,
      );

      expect(service.getContentSubscriptionStats).toHaveBeenCalledWith(
        contentId,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual(stats);
    });
  });

  describe('getTopContent', () => {
    it('should return top content by subscriptions', async () => {
      const topContent = {
        data: [
          { contentId: 'content1', subscriptions: 200 },
          { contentId: 'content2', subscriptions: 150 },
          { contentId: 'content3', subscriptions: 100 },
        ],
      };

      mockSubscriptionAttributionsService.getTopContentBySubscriptions.mockResolvedValue(
        topContent,
      );

      const result = await controller.getTopContent(
        undefined,
        undefined,
        mockUser,
      );

      expect(service.getTopContentBySubscriptions).toHaveBeenCalledWith({
        limit: 10,
        organizationId: mockUser.publicMetadata.organization,
        period: '30d',
      });
      expect(result).toEqual(topContent);
    });

    it('should accept custom limit and period', async () => {
      const topContent = { data: [] };
      mockSubscriptionAttributionsService.getTopContentBySubscriptions.mockResolvedValue(
        topContent,
      );

      await controller.getTopContent('20', '7d', mockUser);

      expect(service.getTopContentBySubscriptions).toHaveBeenCalledWith({
        limit: 20,
        organizationId: mockUser.publicMetadata.organization,
        period: '7d',
      });
    });
  });
});
