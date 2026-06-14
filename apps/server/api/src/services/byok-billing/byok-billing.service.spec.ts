import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { ConfigService } from '@api/config/config.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SubscriptionsService } from '@genfeedai/ee-billing/subscriptions';
import { LoggerService } from '@libs/logger/logger.service';
import { InternalServerErrorException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ByokBillingService } from './byok-billing.service';

const makeConfigService = (
  overrides: Record<string, string | undefined> = {},
) => ({
  get: vi.fn((key: string) => overrides[key]),
});

const makeLoggerService = () => ({
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
});

describe('ByokBillingService', () => {
  let service: ByokBillingService;
  let configService: ReturnType<typeof makeConfigService>;
  let loggerService: ReturnType<typeof makeLoggerService>;
  let organizationSettingsService: { findOne: ReturnType<typeof vi.fn> };
  let prismaService: {
    creditTransaction: { findMany: ReturnType<typeof vi.fn> };
  };
  let subscriptionsService: { findByOrganizationId: ReturnType<typeof vi.fn> };
  let stripeService: {
    stripe: {
      invoices: {
        list: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        finalizeInvoice: ReturnType<typeof vi.fn>;
      };
      invoiceItems: {
        create: ReturnType<typeof vi.fn>;
        del: ReturnType<typeof vi.fn>;
      };
    };
  };

  async function buildModule(
    configOverrides: Record<string, string | undefined> = {},
  ) {
    configService = makeConfigService(configOverrides);
    loggerService = makeLoggerService();
    organizationSettingsService = { findOne: vi.fn().mockResolvedValue(null) };
    prismaService = {
      creditTransaction: { findMany: vi.fn().mockResolvedValue([]) },
    };
    subscriptionsService = {
      findByOrganizationId: vi.fn().mockResolvedValue(null),
    };
    stripeService = {
      stripe: {
        invoices: {
          list: vi.fn().mockResolvedValue({ data: [] }),
          create: vi.fn(),
          finalizeInvoice: vi.fn(),
        },
        invoiceItems: {
          create: vi.fn(),
          del: vi.fn(),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ByokBillingService,
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: loggerService },
        {
          provide: OrganizationSettingsService,
          useValue: organizationSettingsService,
        },
        { provide: PrismaService, useValue: prismaService },
        { provide: SubscriptionsService, useValue: subscriptionsService },
        { provide: StripeService, useValue: stripeService },
      ],
    }).compile();

    service = module.get(ByokBillingService);
  }

  afterEach(() => vi.clearAllMocks());

  it('should be defined', async () => {
    await buildModule({
      STRIPE_BYOK_FEE_PERCENTAGE: '5',
      STRIPE_BYOK_FREE_THRESHOLD: '10000',
    });
    expect(service).toBeDefined();
  });

  // ── calculateFee ───────────────────────────────────────────────────────────

  describe('calculateFee', () => {
    beforeEach(() => buildModule());

    it('returns 0 when usage is below the free threshold', () => {
      expect(service.calculateFee(5000, 10000, 5)).toBe(0);
    });

    it('computes fee in cents correctly', () => {
      // 15000 credits - 10000 threshold = 5000 billable
      // 5000 * $0.01 * 5% = $2.50 → 250 cents
      expect(service.calculateFee(15000, 10000, 5)).toBe(250);
    });
  });

  // ── parseRequiredNumberConfig (via createByokInvoice / getByokUsageSummary) ─

  describe('config validation — malformed env throws InternalServerErrorException', () => {
    it('createByokInvoice throws when STRIPE_BYOK_FEE_PERCENTAGE is missing', async () => {
      await buildModule({ STRIPE_BYOK_FREE_THRESHOLD: '10000' }); // FEE_PERCENTAGE missing → undefined → NaN
      await expect(service.createByokInvoice('org-1')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('STRIPE_BYOK_FEE_PERCENTAGE'),
        expect.objectContaining({ key: 'STRIPE_BYOK_FEE_PERCENTAGE' }),
      );
    });

    it('createByokInvoice throws when STRIPE_BYOK_FREE_THRESHOLD is malformed', async () => {
      await buildModule({
        STRIPE_BYOK_FEE_PERCENTAGE: '5',
        STRIPE_BYOK_FREE_THRESHOLD: 'bad',
      });
      await expect(service.createByokInvoice('org-1')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('STRIPE_BYOK_FREE_THRESHOLD'),
        expect.objectContaining({ key: 'STRIPE_BYOK_FREE_THRESHOLD' }),
      );
    });

    it('getByokUsageSummary throws when STRIPE_BYOK_FEE_PERCENTAGE is missing', async () => {
      await buildModule({ STRIPE_BYOK_FREE_THRESHOLD: '10000' });
      await expect(service.getByokUsageSummary('org-1')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('STRIPE_BYOK_FEE_PERCENTAGE'),
        expect.objectContaining({ key: 'STRIPE_BYOK_FEE_PERCENTAGE' }),
      );
    });

    it('getByokUsageSummary throws when STRIPE_BYOK_FREE_THRESHOLD is malformed', async () => {
      await buildModule({
        STRIPE_BYOK_FEE_PERCENTAGE: '5',
        STRIPE_BYOK_FREE_THRESHOLD: 'not-a-number',
      });
      await expect(service.getByokUsageSummary('org-1')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('STRIPE_BYOK_FREE_THRESHOLD'),
        expect.objectContaining({ key: 'STRIPE_BYOK_FREE_THRESHOLD' }),
      );
    });
  });
});
