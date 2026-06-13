import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SubscriptionAttributionsService } from './subscription-attributions.service';

type MockPrisma = {
  subscriptionAttribution: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

function buildService(): {
  service: SubscriptionAttributionsService;
  prisma: MockPrisma;
} {
  const prisma: MockPrisma = {
    subscriptionAttribution: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };

  // Plain service — instantiate directly with the mocked Prisma. No Nest DI
  // container needed; the constructor takes a single PrismaService dependency.
  const service = new SubscriptionAttributionsService(
    prisma as unknown as PrismaService,
  );

  return { prisma, service };
}

describe('SubscriptionAttributionsService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('updateSubscriptionStatus', () => {
    it('scopes findMany to the stripeSubscriptionId JSON metadata — never reads all rows', async () => {
      const { prisma, service } = buildService();
      prisma.subscriptionAttribution.findMany.mockResolvedValue([]);

      await service.updateSubscriptionStatus('sub_abc123', 'canceled');

      expect(prisma.subscriptionAttribution.findMany).toHaveBeenCalledWith({
        where: {
          metadata: {
            path: ['stripeSubscriptionId'],
            equals: 'sub_abc123',
          },
        },
      });

      // Critically: no bare findMany() — a non-empty where clause is always present
      const [call] = prisma.subscriptionAttribution.findMany.mock.calls;
      expect(call[0]).toHaveProperty('where');
      expect(call[0].where).not.toEqual({});
    });

    it('updates only the attributions returned by the scoped query', async () => {
      const { prisma, service } = buildService();
      const attribution = {
        channel: null,
        createdAt: new Date('2024-01-01'),
        id: 'attr_1',
        metadata: { stripeSubscriptionId: 'sub_abc123', status: 'active' },
        organizationId: 'org_1',
        referrer: null,
        sourceContentId: null,
        sourceLinkId: null,
        updatedAt: new Date('2024-01-01'),
        userId: 'user_1',
      };

      prisma.subscriptionAttribution.findMany.mockResolvedValue([attribution]);
      prisma.subscriptionAttribution.update.mockResolvedValue(attribution);

      await service.updateSubscriptionStatus('sub_abc123', 'canceled');

      expect(prisma.subscriptionAttribution.update).toHaveBeenCalledTimes(1);
      expect(prisma.subscriptionAttribution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({ status: 'canceled' }),
          }),
          where: { id: 'attr_1' },
        }),
      );
    });

    it('does not call update when no attributions match', async () => {
      const { prisma, service } = buildService();
      prisma.subscriptionAttribution.findMany.mockResolvedValue([]);

      await service.updateSubscriptionStatus('sub_nonexistent', 'canceled');

      expect(prisma.subscriptionAttribution.update).not.toHaveBeenCalled();
    });
  });

  describe('trackSubscription — findMany scopes by organizationId', () => {
    it('passes organizationId in the where clause', async () => {
      const { prisma, service } = buildService();
      prisma.subscriptionAttribution.findMany.mockResolvedValue([]);
      prisma.subscriptionAttribution.create.mockResolvedValue({
        channel: null,
        createdAt: new Date(),
        id: 'attr_new',
        metadata: {},
        organizationId: 'org_1',
        referrer: null,
        sourceContentId: null,
        sourceLinkId: null,
        updatedAt: new Date(),
        userId: 'user_1',
      });

      await service.trackSubscription(
        {
          amount: 10,
          currency: 'usd',
          email: 'test@example.com',
          plan: 'pro',
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_xyz',
          userId: 'user_1',
        },
        'org_1',
      );

      expect(prisma.subscriptionAttribution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org_1' }),
        }),
      );
    });
  });
});
