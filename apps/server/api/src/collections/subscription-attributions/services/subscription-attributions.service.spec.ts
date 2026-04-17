import { TrackSubscriptionDto } from '@api/collections/subscription-attributions/dto/track-subscription.dto';
import { SubscriptionAttributionsService } from '@api/collections/subscription-attributions/services/subscription-attributions.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type SubscriptionAttribution } from '@genfeedai/prisma';
import { Test, TestingModule } from '@nestjs/testing';

describe('SubscriptionAttributionsService', () => {
  let service: SubscriptionAttributionsService;
  let model: Record<string, ReturnType<typeof vi.fn>>;

  const organizationId = 'test-object-id'.toString();
  const baseDto: TrackSubscriptionDto = {
    amount: 9900,
    currency: 'usd',
    email: 'user@example.com',
    plan: 'price_123',
    sessionId: 'session_1',
    sourceContentId: 'test-object-id'.toString(),
    sourceContentType: 'video',
    sourcePlatform: 'youtube',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    userId: 'test-object-id'.toString(),
    utm: {
      campaign: 'launch',
      medium: 'video',
      source: 'youtube',
    },
  };

  beforeEach(async () => {
    model = {
      aggregate: vi.fn(),
      create: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
      updateOne: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionAttributionsService,
        { provide: PrismaService, useValue: model },
      ],
    }).compile();

    service = module.get(SubscriptionAttributionsService);
  });

  describe('trackSubscription', () => {
    it('creates a new attribution when none exists', async () => {
      const createdDoc = { ...baseDto, currency: 'USD' };
      model.findOne.mockResolvedValue(null);
      model.create.mockResolvedValue(createdDoc);

      const result = await service.trackSubscription(baseDto, organizationId);

      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'USD',
          organization: organizationId,
          stripeSubscriptionId: baseDto.stripeSubscriptionId,
        }),
      );
      expect(result).toEqual(createdDoc);
    });

    it('updates an existing attribution when found', async () => {
      const existingDoc = {
        save: vi.fn().mockResolvedValue({
          ...baseDto,
          currency: 'EUR',
          email: 'updated@example.com',
        }),
        set: vi.fn(),
        subscribedAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      model.findOne.mockResolvedValue(existingDoc);

      const result = await service.trackSubscription(
        { ...baseDto, currency: 'eur', email: 'updated@example.com' },
        organizationId,
      );

      expect(existingDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'EUR',
          email: 'updated@example.com',
          subscribedAt: existingDoc.subscribedAt,
        }),
      );
      expect(result).toEqual({
        ...baseDto,
        currency: 'EUR',
        email: 'updated@example.com',
      });
      expect(model.create).not.toHaveBeenCalled();
    });
  });

  describe('getContentSubscriptionStats', () => {
    it('aggregates totals and includes currency', async () => {
      const contentId = 'test-object-id'.toString();
      const docs = [
        {
          amount: 9900,
          currency: 'USD',
          plan: 'price_123',
          source: { contentType: 'video' },
          subscribedAt: new Date('2024-01-01T00:00:00.000Z'),
        },
        {
          amount: 9900,
          currency: 'USD',
          plan: 'price_123',
          source: { contentType: 'video' },
          subscribedAt: new Date('2024-01-02T00:00:00.000Z'),
        },
      ];

      model.find.mockResolvedValue(docs);

      const result = await service.getContentSubscriptionStats(
        contentId,
        organizationId,
      );

      expect(result.totalSubscriptions).toBe(2);
      expect(result.totalRevenue).toBe(19800);
      expect(result.currency).toBe('USD');
      expect(result.byPlan.price_123.count).toBe(2);
      expect(result.timeline['2024-01-01']).toBe(1);
    });
  });

  describe('getTopContentBySubscriptions', () => {
    it('maps aggregation results to response format', async () => {
      model.aggregate.mockResolvedValue([
        {
          _id: 'content_1',
          contentType: 'video',
          currency: 'USD',
          revenue: 29700,
          subscriptions: 3,
        },
      ]);

      const result = await service.getTopContentBySubscriptions({
        organizationId,
      });

      expect(result).toEqual([
        {
          contentId: 'content_1',
          contentType: 'video',
          currency: 'USD',
          revenue: 29700,
          subscriptions: 3,
        },
      ]);
    });
  });
});
