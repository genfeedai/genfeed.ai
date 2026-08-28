import type { TrackSubscriptionDto } from '@api/collections/subscription-attributions/dto/track-subscription.dto';
import type { SubscriptionAttributionDocument } from '@api/collections/subscription-attributions/schemas/subscription-attribution.schema';
import { Timeframe } from '@genfeedai/enums';
import type { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionAttributionsService } from './subscription-attributions.service';

type MockFn = ReturnType<typeof vi.fn>;

interface AttributionDelegate {
  create: MockFn;
  findFirst: MockFn;
  findMany: MockFn;
  update: MockFn;
}

const ORGANIZATION_ID = 'org_1';

/**
 * Prisma types `metadata` as `JsonValue`; specs hand in loose records (and a
 * bad-data string) on purpose, so the override drops the strict shape.
 */
type AttributionOverrides = Partial<
  Omit<SubscriptionAttributionDocument, 'metadata'>
> & {
  metadata?: Record<string, unknown> | string | null;
};

function buildAttribution(
  overrides: AttributionOverrides = {},
): SubscriptionAttributionDocument {
  const { metadata, ...rest } = overrides;

  return {
    channel: null,
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    id: 'attr_1',
    metadata: (metadata ?? null) as SubscriptionAttributionDocument['metadata'],
    organizationId: ORGANIZATION_ID,
    referrer: null,
    sourceContentId: null,
    sourceLinkId: null,
    updatedAt: new Date('2026-01-10T00:00:00.000Z'),
    userId: 'user_1',
    ...rest,
  };
}

function buildDto(
  overrides: Partial<TrackSubscriptionDto> = {},
): TrackSubscriptionDto {
  return {
    amount: 49,
    email: 'billing@example.com',
    plan: 'pro',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    userId: 'user_1',
    ...overrides,
  };
}

/** Reads back the `metadata` payload the service handed to Prisma. */
function metadataFromCall(call: unknown): Record<string, unknown> {
  const args = call as [{ data: { metadata: Record<string, unknown> } }];
  return args[0].data.metadata;
}

describe('SubscriptionAttributionsService', () => {
  let delegate: AttributionDelegate;
  let service: SubscriptionAttributionsService;

  beforeEach(() => {
    delegate = {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    };
    service = new SubscriptionAttributionsService({
      subscriptionAttribution: delegate,
    } as unknown as PrismaService);
    // Silence the Nest logger this service constructs internally.
    Object.defineProperty(service, 'logger', {
      configurable: true,
      value: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    });
  });

  describe('trackSubscription', () => {
    it('creates a tenant-scoped attribution and normalizes the currency to upper case', async () => {
      delegate.create.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
          Promise.resolve(
            buildAttribution({
              metadata: args.data.metadata as Record<string, unknown>,
            }),
          ),
      );

      const result = await service.trackSubscription(
        buildDto({ currency: 'eur' }),
        ORGANIZATION_ID,
      );

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: {
          metadata: {
            equals: 'sub_1',
            path: ['stripeSubscriptionId'],
          },
          organizationId: ORGANIZATION_ID,
        },
      });
      const metadata = metadataFromCall(delegate.create.mock.calls[0]);
      expect(metadata).toEqual(
        expect.objectContaining({
          amount: 49,
          currency: 'EUR',
          email: 'billing@example.com',
          plan: 'pro',
          status: 'active',
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_1',
        }),
      );
      expect(typeof metadata.subscribedAt).toBe('string');
      expect(result.currency).toBe('EUR');
      expect(result.amount).toBe(49);
      expect(result.plan).toBe('pro');
      expect(result.stripeSubscriptionId).toBe('sub_1');
    });

    it('defaults the currency to USD when the DTO omits it', async () => {
      delegate.create.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
          Promise.resolve(
            buildAttribution({
              metadata: args.data.metadata as Record<string, unknown>,
            }),
          ),
      );

      const result = await service.trackSubscription(
        buildDto(),
        ORGANIZATION_ID,
      );

      expect(result.currency).toBe('USD');
    });

    it('records the content source and UTM parameters on the created row', async () => {
      delegate.create.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
          Promise.resolve(
            buildAttribution({
              metadata: args.data.metadata as Record<string, unknown>,
              sourceContentId: 'post_1',
            }),
          ),
      );

      const result = await service.trackSubscription(
        buildDto({
          sessionId: 'sess_1',
          sourceContentId: 'post_1',
          sourceContentType: 'post',
          sourceLinkId: 'link_1',
          sourcePlatform: 'instagram',
          utm: {
            campaign: 'spring',
            content: 'hero',
            medium: 'social',
            source: 'ig',
          },
        }),
        ORGANIZATION_ID,
      );

      const createArgs = delegate.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(createArgs[0].data).toEqual(
        expect.objectContaining({
          channel: 'instagram',
          organizationId: ORGANIZATION_ID,
          referrer: 'ig',
          sourceContentId: 'post_1',
          sourceLinkId: 'link_1',
          userId: 'user_1',
        }),
      );
      expect(result.source).toEqual({
        content: 'post_1',
        contentType: 'post',
        link: 'link_1',
        platform: 'instagram',
        sessionId: 'sess_1',
      });
      expect(result.utm).toEqual({
        campaign: 'spring',
        content: 'hero',
        medium: 'social',
        source: 'ig',
      });
    });

    it('falls back to an unknown source built from the session id', async () => {
      delegate.create.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
          Promise.resolve(
            buildAttribution({
              metadata: args.data.metadata as Record<string, unknown>,
            }),
          ),
      );

      const result = await service.trackSubscription(
        buildDto({ sessionId: 'sess_9' }),
        ORGANIZATION_ID,
      );

      expect(result.source).toEqual({
        content: 'unknown',
        contentType: 'unknown',
        link: undefined,
        platform: 'unknown',
        sessionId: 'sess_9',
      });
    });

    it('drops an all-empty UTM block instead of persisting empty keys', async () => {
      delegate.create.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
          Promise.resolve(
            buildAttribution({
              metadata: args.data.metadata as Record<string, unknown>,
            }),
          ),
      );

      const result = await service.trackSubscription(
        buildDto({ utm: {} }),
        ORGANIZATION_ID,
      );

      expect(result.utm).toBeUndefined();
    });

    it('is idempotent for a repeated Stripe subscription: updates in place and keeps the original subscribedAt', async () => {
      const existing = buildAttribution({
        channel: 'youtube',
        id: 'attr_existing',
        metadata: {
          amount: 10,
          currency: 'USD',
          stripeSubscriptionId: 'sub_1',
          subscribedAt: '2026-01-05T00:00:00.000Z',
        },
        referrer: 'yt',
        sourceContentId: 'post_old',
        sourceLinkId: 'link_old',
      });
      delegate.findFirst.mockResolvedValue(existing);
      delegate.update.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
          Promise.resolve(
            buildAttribution({
              id: 'attr_existing',
              metadata: args.data.metadata as Record<string, unknown>,
            }),
          ),
      );

      const result = await service.trackSubscription(
        buildDto({ amount: 99 }),
        ORGANIZATION_ID,
      );

      expect(delegate.create).not.toHaveBeenCalled();
      const updateArgs = delegate.update.mock.calls[0] as [
        { data: Record<string, unknown>; where: { id: string } },
      ];
      expect(updateArgs[0].where).toEqual({ id: 'attr_existing' });
      // Unchanged DTO fields fall back to the stored attribution values.
      expect(updateArgs[0].data).toEqual(
        expect.objectContaining({
          channel: 'youtube',
          referrer: 'yt',
          sourceContentId: 'post_old',
          sourceLinkId: 'link_old',
        }),
      );
      const metadata = metadataFromCall(delegate.update.mock.calls[0]);
      expect(metadata.subscribedAt).toBe('2026-01-05T00:00:00.000Z');
      expect(metadata.amount).toBe(99);
      expect(result.amount).toBe(99);
    });

    it('stamps subscribedAt on an existing row that never had one', async () => {
      delegate.findFirst.mockResolvedValue(
        buildAttribution({
          id: 'attr_existing',
          metadata: { stripeSubscriptionId: 'sub_1' },
        }),
      );
      delegate.update.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
          Promise.resolve(
            buildAttribution({
              metadata: args.data.metadata as Record<string, unknown>,
            }),
          ),
      );

      await service.trackSubscription(buildDto(), ORGANIZATION_ID);

      const metadata = metadataFromCall(delegate.update.mock.calls[0]);
      expect(typeof metadata.subscribedAt).toBe('string');
      expect(Number.isNaN(Date.parse(String(metadata.subscribedAt)))).toBe(
        false,
      );
    });

    it('creates a new row when no matching subscription exists', async () => {
      delegate.create.mockResolvedValue(buildAttribution());

      await service.trackSubscription(buildDto(), ORGANIZATION_ID);

      expect(delegate.create).toHaveBeenCalledTimes(1);
      expect(delegate.update).not.toHaveBeenCalled();
    });
  });

  describe('getContentSubscriptionStats', () => {
    it('aggregates revenue, average order value, plan split and timeline', async () => {
      delegate.findMany.mockResolvedValue([
        buildAttribution({
          id: 'a1',
          metadata: {
            amount: 100,
            currency: 'USD',
            plan: 'pro',
            source: { content: 'post_1', contentType: 'post', platform: 'x' },
            subscribedAt: '2026-02-01T10:00:00.000Z',
          },
          sourceContentId: 'post_1',
        }),
        buildAttribution({
          id: 'a2',
          metadata: {
            amount: 50,
            currency: 'USD',
            plan: 'pro',
            subscribedAt: '2026-02-01T18:00:00.000Z',
          },
          sourceContentId: 'post_1',
        }),
        buildAttribution({
          id: 'a3',
          metadata: {
            currency: 'USD',
            subscribedAt: '2026-02-02T09:00:00.000Z',
          },
          sourceContentId: 'post_1',
        }),
      ]);

      const stats = await service.getContentSubscriptionStats(
        'post_1',
        ORGANIZATION_ID,
      );

      expect(delegate.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORGANIZATION_ID, sourceContentId: 'post_1' },
      });
      expect(stats.totalSubscriptions).toBe(3);
      expect(stats.totalRevenue).toBe(150);
      expect(stats.avgOrderValue).toBe(50);
      expect(stats.byPlan).toEqual({
        pro: { count: 2, revenue: 150 },
        unknown: { count: 1, revenue: 0 },
      });
      expect(stats.timeline).toEqual({
        '2026-02-01': 2,
        '2026-02-02': 1,
      });
      expect(stats.contentType).toBe('post');
      expect(stats.currency).toBe('USD');
    });

    it('returns zeroed stats and a null currency for content with no subscriptions', async () => {
      delegate.findMany.mockResolvedValue([]);

      const stats = await service.getContentSubscriptionStats(
        'post_empty',
        ORGANIZATION_ID,
      );

      expect(stats).toEqual({
        avgOrderValue: 0,
        byPlan: {},
        contentId: 'post_empty',
        contentType: 'unknown',
        currency: null,
        timeline: {},
        totalRevenue: 0,
        totalSubscriptions: 0,
      });
    });

    it('falls back to createdAt when the stored subscribedAt is unparseable', async () => {
      delegate.findMany.mockResolvedValue([
        buildAttribution({
          createdAt: new Date('2026-03-03T00:00:00.000Z'),
          metadata: { amount: 5, subscribedAt: 'not-a-date' },
          sourceContentId: 'post_1',
        }),
      ]);

      const stats = await service.getContentSubscriptionStats(
        'post_1',
        ORGANIZATION_ID,
      );

      expect(stats.timeline).toEqual({ '2026-03-03': 1 });
    });
  });

  describe('getTopContentBySubscriptions', () => {
    it('groups by content, sorts by subscription count and applies the limit', async () => {
      delegate.findMany.mockResolvedValue([
        buildAttribution({
          id: 'a1',
          metadata: {
            amount: 10,
            currency: 'USD',
            source: { content: 'post_1', contentType: 'post', platform: 'x' },
            subscribedAt: new Date().toISOString(),
          },
          sourceContentId: 'post_1',
        }),
        buildAttribution({
          id: 'a2',
          metadata: {
            amount: 15,
            currency: 'USD',
            subscribedAt: new Date().toISOString(),
          },
          sourceContentId: 'post_1',
        }),
        buildAttribution({
          id: 'a3',
          metadata: {
            amount: 40,
            currency: 'EUR',
            subscribedAt: new Date().toISOString(),
          },
          sourceContentId: 'post_2',
        }),
      ]);

      const rows = await service.getTopContentBySubscriptions({
        organizationId: ORGANIZATION_ID,
      });

      expect(delegate.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORGANIZATION_ID,
          sourceContentId: { not: null },
        },
      });
      expect(rows).toEqual([
        {
          contentId: 'post_1',
          contentType: 'post',
          currency: 'USD',
          revenue: 25,
          subscriptions: 2,
        },
        {
          contentId: 'post_2',
          contentType: 'unknown',
          currency: 'EUR',
          revenue: 40,
          subscriptions: 1,
        },
      ]);

      const limited = await service.getTopContentBySubscriptions({
        limit: 1,
        organizationId: ORGANIZATION_ID,
      });
      expect(limited).toHaveLength(1);
      expect(limited[0]?.contentId).toBe('post_1');
    });

    it('skips rows whose sourceContentId is null', async () => {
      delegate.findMany.mockResolvedValue([
        buildAttribution({ metadata: { amount: 10 }, sourceContentId: null }),
      ]);

      await expect(
        service.getTopContentBySubscriptions({
          organizationId: ORGANIZATION_ID,
        }),
      ).resolves.toEqual([]);
    });

    it('filters out subscriptions older than the requested period', async () => {
      const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const stale = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      delegate.findMany.mockResolvedValue([
        buildAttribution({
          id: 'recent',
          metadata: { amount: 10, subscribedAt: recent.toISOString() },
          sourceContentId: 'post_recent',
        }),
        buildAttribution({
          id: 'stale',
          metadata: { amount: 10, subscribedAt: stale.toISOString() },
          sourceContentId: 'post_stale',
        }),
      ]);

      const weekly = await service.getTopContentBySubscriptions({
        organizationId: ORGANIZATION_ID,
        period: Timeframe.D7,
      });
      expect(weekly.map((row) => row.contentId)).toEqual(['post_recent']);

      const quarterly = await service.getTopContentBySubscriptions({
        organizationId: ORGANIZATION_ID,
        period: Timeframe.D90,
      });
      expect(quarterly.map((row) => row.contentId).sort()).toEqual([
        'post_recent',
        'post_stale',
      ]);

      const monthly = await service.getTopContentBySubscriptions({
        organizationId: ORGANIZATION_ID,
        period: Timeframe.D30,
      });
      expect(monthly.map((row) => row.contentId)).toEqual(['post_recent']);
    });
  });
});
