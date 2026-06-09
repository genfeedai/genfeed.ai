import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import type { SubscriptionDocument } from '@genfeedai/ee-billing/subscriptions';

type NormalizeAccessor = {
  normalizeDocument(document: unknown): SubscriptionDocument;
};

describe('SubscriptionsService', () => {
  const prisma = {
    customer: { findUnique: vi.fn() },
    subscription: { findFirst: vi.fn() },
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  function buildService(): NormalizeAccessor {
    return new SubscriptionsService(
      prisma as never,
      logger as never,
      { get: vi.fn() } as never,
      { findOne: vi.fn() } as never,
      {} as never,
      { findByStripeCustomerId: vi.fn() } as never,
      { updateUserPublicMetadata: vi.fn() } as never,
    ) as unknown as NormalizeAccessor;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeDocument', () => {
    it('maps the persisted plan column onto the in-memory type field', () => {
      const service = buildService();

      const normalized = service.normalizeDocument({
        customerId: 'cus_local_1',
        id: 'sub_db_1',
        isDeleted: false,
        organizationId: 'org_1',
        plan: 'monthly',
        status: 'active',
        stripeSubscriptionId: 'sub_stripe_1',
        userId: 'user_1',
      });

      // type drives credit allocation in the Stripe invoice.paid handler —
      // every BaseService read path (findOne/findAll/patch) must populate it
      expect(normalized.type).toBe('monthly');
      expect(normalized.customer).toBe('cus_local_1');
      expect(normalized.organization).toBe('org_1');
    });

    it('keeps an explicit type value over the plan fallback', () => {
      const service = buildService();

      const normalized = service.normalizeDocument({
        id: 'sub_db_2',
        organizationId: 'org_1',
        plan: 'monthly',
        type: 'yearly',
        userId: 'user_1',
      });

      expect(normalized.type).toBe('yearly');
    });

    it('leaves type undefined when neither type nor plan is present', () => {
      const service = buildService();

      const normalized = service.normalizeDocument({
        id: 'sub_db_3',
        organizationId: 'org_1',
        userId: 'user_1',
      });

      expect(normalized.type).toBeUndefined();
    });
  });
});
