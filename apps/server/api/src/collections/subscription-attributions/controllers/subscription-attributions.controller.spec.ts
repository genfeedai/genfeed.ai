vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { TrackSubscriptionDto } from '@api/collections/subscription-attributions/dto/track-subscription.dto';
import { SubscriptionAttributionsService } from '@api/collections/subscription-attributions/services/subscription-attributions.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { Timeframe } from '@genfeedai/contracts';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { SubscriptionAttributionsController } from './subscription-attributions.controller';

describe('SubscriptionAttributionsController', () => {
  let controller: SubscriptionAttributionsController;
  let service: SubscriptionAttributionsService;

  const mockUser: User = {
    brandId: 'b00000000000000000000001',
    id: 'u00000000000000000000001',
    organizationId: 'o00000000000000000000001',
    userId: 'u00000000000000000000001',
  };

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
        amount: 2900,
        email: 'subscriber@example.com',
        plan: 'pro',
        sourceContentId: 'content123',
        sourcePlatform: 'youtube',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        userId: mockUser.userId,
      };

      const tracked = {
        id: 'attribution123',
        sourceContentId: dto.sourceContentId,
        sourcePlatform: dto.sourcePlatform,
        stripeSubscriptionId: dto.stripeSubscriptionId,
        trackedAt: new Date(),
      };

      mockSubscriptionAttributionsService.trackSubscription.mockResolvedValue(
        tracked,
      );

      const result = await controller.trackSubscription(mockReq, dto, mockUser);

      expect(service.trackSubscription).toHaveBeenCalledWith(
        dto,
        mockUser.organizationId,
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
        mockUser.organizationId,
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
        organizationId: mockUser.organizationId,
        period: Timeframe.D30,
      });
      expect(result).toEqual(topContent);
    });

    it('should accept custom limit and period', async () => {
      const topContent = { data: [] };
      mockSubscriptionAttributionsService.getTopContentBySubscriptions.mockResolvedValue(
        topContent,
      );

      await controller.getTopContent('20', Timeframe.D7, mockUser);

      expect(service.getTopContentBySubscriptions).toHaveBeenCalledWith({
        limit: 20,
        organizationId: mockUser.organizationId,
        period: Timeframe.D7,
      });
    });
  });
});
