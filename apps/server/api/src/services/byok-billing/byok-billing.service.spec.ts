import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import type { ConfigService } from '@api/config/config.service';
import { ByokBillingService } from '@api/services/byok-billing/byok-billing.service';
import type { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import type { LoggerService } from '@libs/logger/logger.service';

const orgId = 'test-object-id';

describe('ByokBillingService', () => {
  let service: ByokBillingService;
  let mockCreditTransactionsModel: { aggregate: ReturnType<typeof vi.fn> };
  let mockConfigService: { get: ReturnType<typeof vi.fn> };
  let mockLoggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let mockStripeService: {
    stripe: {
      invoiceItems: {
        create: ReturnType<typeof vi.fn>;
        del: ReturnType<typeof vi.fn>;
      };
      invoices: {
        create: ReturnType<typeof vi.fn>;
        finalizeInvoice: ReturnType<typeof vi.fn>;
        list: ReturnType<typeof vi.fn>;
      };
    };
  };
  let mockSubscriptionsService: {
    findByOrganizationId: ReturnType<typeof vi.fn>;
  };
  let mockOrgSettingsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockCreditTransactionsModel = {
      aggregate: vi.fn().mockResolvedValue([]),
    };
    mockConfigService = {
      get: vi.fn().mockReturnValue(undefined),
    };
    mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    mockStripeService = {
      stripe: {
        invoiceItems: {
          create: vi.fn().mockResolvedValue({ id: 'ii_123' }),
          del: vi.fn().mockResolvedValue({}),
        },
        invoices: {
          create: vi.fn().mockResolvedValue({ id: 'inv_123' }),
          finalizeInvoice: vi.fn().mockResolvedValue({}),
          list: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
    };
    mockSubscriptionsService = {
      findByOrganizationId: vi.fn().mockResolvedValue(null),
    };
    mockOrgSettingsService = {
      findOne: vi.fn().mockResolvedValue(null),
      patch: vi.fn().mockResolvedValue({}),
    };

    service = new ByokBillingService(
      mockCreditTransactionsModel as never,
      mockConfigService as unknown as ConfigService,
      mockLoggerService as unknown as LoggerService,
      mockStripeService as unknown as StripeService,
      mockSubscriptionsService as unknown as SubscriptionsService,
      mockOrgSettingsService as unknown as OrganizationSettingsService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('aggregateByokUsage returns 0 when no transactions', async () => {
    const result = await service.aggregateByokUsage(
      orgId,
      new Date('2025-01-01'),
      new Date('2025-01-31'),
    );
    expect(result).toBe(0);
  });

  it('aggregateByokUsage returns sum from aggregate', async () => {
    mockCreditTransactionsModel.aggregate.mockResolvedValue([
      { totalAmount: 150 },
    ]);
    const result = await service.aggregateByokUsage(
      orgId,
      new Date('2025-01-01'),
      new Date('2025-01-31'),
    );
    expect(result).toBe(150);
  });

  it('calculateFee returns 0 when under threshold', () => {
    const fee = service.calculateFee(100, 500, 5);
    expect(fee).toBe(0);
  });

  it('calculateFee calculates correct amount for billable credits', () => {
    // 1000 total - 500 free = 500 billable
    // 500 * $0.01 * (5/100) = $0.25 = 25 cents
    const fee = service.calculateFee(1000, 500, 5);
    expect(fee).toBe(25);
  });

  it('calculateFee with zero threshold bills everything', () => {
    // 200 * $0.01 * (10/100) = $0.20 = 20 cents
    const fee = service.calculateFee(200, 0, 10);
    expect(fee).toBe(20);
  });

  it('createByokInvoice returns skipped when no Stripe customer', async () => {
    mockSubscriptionsService.findByOrganizationId.mockResolvedValue(null);
    const result = await service.createByokInvoice(orgId);
    expect(result.skipped).toBe(true);
    expect(result.invoiceId).toBeNull();
  });

  it('createByokInvoice returns skipped when no billable usage', async () => {
    mockSubscriptionsService.findByOrganizationId.mockResolvedValue({
      stripeCustomerId: 'cus_123',
    });
    mockCreditTransactionsModel.aggregate.mockResolvedValue([]);
    const result = await service.createByokInvoice(orgId);
    expect(result.skipped).toBe(true);
  });

  it('getByokUsageSummary returns correct summary shape', async () => {
    mockCreditTransactionsModel.aggregate.mockResolvedValue([]);
    const result = await service.getByokUsageSummary(orgId);
    expect(result).toHaveProperty('totalUsage');
    expect(result).toHaveProperty('freeThreshold');
    expect(result).toHaveProperty('billableUsage');
    expect(result).toHaveProperty('projectedFee');
    expect(result).toHaveProperty('billingStatus');
    expect(result).toHaveProperty('periodStart');
    expect(result).toHaveProperty('periodEnd');
  });

  it('getByokUsageSummary uses org override for threshold', async () => {
    mockOrgSettingsService.findOne.mockResolvedValue({
      byokBillingRollover: 0,
      byokBillingStatus: 'active',
      byokFreeThresholdOverride: 1000,
    });
    mockCreditTransactionsModel.aggregate.mockResolvedValue([
      { totalAmount: 500 },
    ]);
    const result = await service.getByokUsageSummary(orgId);
    expect(result.freeThreshold).toBe(1000);
    expect(result.freeRemaining).toBe(500);
  });

  it('calculateFee rounds to nearest cent', () => {
    // 501 - 500 = 1 billable
    // 1 * 0.01 * 0.05 = 0.0005 = 0.05 cents → rounds to 0
    const fee = service.calculateFee(501, 500, 5);
    expect(fee).toBe(0);
  });
});
