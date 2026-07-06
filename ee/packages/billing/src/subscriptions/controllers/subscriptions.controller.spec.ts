import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { ConfigService } from '@api/config/config.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionPlan } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import type { CreateSubscriptionPreviewDto } from '../dto/create-subscription.dto';
import { SubscriptionsService } from '../services/subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;
  let subscriptionsService: SubscriptionsService;
  let creditsUtilsService: CreditsUtilsService;

  const mockUser: User = {
    id: 'user_123',
    organizationId: '507f1f77bcf86cd799439012',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockSubscription = {
    _id: '507f1f77bcf86cd799439014',
    createdAt: new Date(),
    currentPeriodEnd: new Date(),
    organization: '507f1f77bcf86cd799439012',
    status: 'active',
    stripeSubscriptionId: 'sub_123',
    type: SubscriptionPlan.MONTHLY,
    updatedAt: new Date(),
  };

  const mockSubscriptionsService = {
    changeSubscriptionPlan: vi.fn(),
    findAll: vi.fn(),
    findByOrganizationId: vi.fn().mockResolvedValue(null),
    previewSubscriptionChange: vi.fn(),
  };

  const mockCreditsUtilsService = {
    getCycleRemainingMetrics: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
    getOrganizationCreditsWithExpiration: vi.fn(),
  };

  const mockOrganizationsService = {
    find: vi.fn().mockResolvedValue([]),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockConfigGet = vi.fn().mockReturnValue('');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        {
          provide: SubscriptionsService,
          useValue: mockSubscriptionsService,
        },
        {
          provide: CreditsUtilsService,
          useValue: mockCreditsUtilsService,
        },
        {
          provide: OrganizationsService,
          useValue: mockOrganizationsService,
        },
        {
          provide: ConfigService,
          useValue: { get: mockConfigGet },
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SubscriptionsController>(SubscriptionsController);
    subscriptionsService =
      module.get<SubscriptionsService>(SubscriptionsService);
    creditsUtilsService = module.get<CreditsUtilsService>(CreditsUtilsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockConfigGet.mockReturnValue('');
    mockOrganizationsService.find.mockResolvedValue([]);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all subscriptions', async () => {
      const request = {} as Request;
      const subscriptions = [mockSubscription];

      mockSubscriptionsService.findAll.mockResolvedValue({
        docs: subscriptions,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      const result = await controller.findAll(request, {});

      expect(subscriptionsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('changePlan', () => {
    it('should change subscription plan', async () => {
      const changeData = { newPriceId: 'price_new' };
      const updatedSubscription = {
        ...mockSubscription,
        priceId: 'price_new',
      };
      const mockRequest = {
        context: {
          organizationId: mockUser.publicMetadata.organization as string,
        },
      } as RequestWithContext;

      mockSubscriptionsService.changeSubscriptionPlan.mockResolvedValue(
        updatedSubscription,
      );

      const result = await controller.changePlan(
        mockRequest,
        mockUser,
        changeData,
      );

      expect(subscriptionsService.changeSubscriptionPlan).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        changeData.newPriceId,
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(updatedSubscription);
    });
  });

  describe('previewChange', () => {
    it('should preview subscription change', async () => {
      const dto: CreateSubscriptionPreviewDto = {
        price: 'price_new',
      };

      const preview = {
        currentPlan: 'pro',
        newPlan: 'enterprise',
        nextBillingDate: new Date(),
        proratedAmount: 50.0,
      };

      mockSubscriptionsService.previewSubscriptionChange.mockResolvedValue(
        preview,
      );

      const result = await controller.previewChange(mockUser, dto);

      expect(
        subscriptionsService.previewSubscriptionChange,
      ).toHaveBeenCalledWith(mockUser.publicMetadata.organization, dto.price);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(preview);
    });
  });

  describe('getCreditsBreakdown', () => {
    it('should return credits breakdown with cycle metrics', async () => {
      const request = {
        context: { organizationId: mockUser.publicMetadata.organization },
      } as Request;
      const creditsData = {
        credits: [
          {
            balance: 1000,
            source: 'credits-subscription',
          },
        ],
        total: 1000,
      };
      const cycleMetrics = {
        cycleTotal: 1500,
        remainingPercent: 66.67,
      };

      mockCreditsUtilsService.getOrganizationCreditsWithExpiration.mockResolvedValue(
        creditsData,
      );
      mockCreditsUtilsService.getCycleRemainingMetrics.mockResolvedValue(
        cycleMetrics,
      );
      mockSubscriptionsService.findByOrganizationId.mockResolvedValue({
        ...mockSubscription,
        currentPeriodEnd: new Date('2026-03-31T00:00:00.000Z'),
        type: SubscriptionPlan.MONTHLY,
      });

      const result = await controller.getCreditsBreakdown(mockUser, request);

      expect(
        creditsUtilsService.getOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith(mockUser.publicMetadata.organization);
      expect(
        mockCreditsUtilsService.getCycleRemainingMetrics,
      ).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          ...creditsData,
          ...cycleMetrics,
          planLimit: 35_000,
        }),
      );
    });

    it('should fallback to total-based percentage when cycle window is unavailable', async () => {
      const request = {
        context: { organizationId: mockUser.publicMetadata.organization },
      } as Request;
      const creditsData = {
        credits: [],
        total: 420,
      };

      mockCreditsUtilsService.getOrganizationCreditsWithExpiration.mockResolvedValue(
        creditsData,
      );
      mockSubscriptionsService.findByOrganizationId.mockResolvedValue(null);

      const result = await controller.getCreditsBreakdown(mockUser, request);

      expect(
        mockCreditsUtilsService.getCycleRemainingMetrics,
      ).not.toHaveBeenCalled();
      expect(result.data.cycleTotal).toBe(420);
      expect(result.data.remainingPercent).toBe(100);
    });

    it('should use request context organizationId when user metadata is missing', async () => {
      const request = {
        context: { organizationId: 'org_from_context' },
      } as Request;
      const userWithoutOrganization = {
        ...mockUser,
        publicMetadata: {
          user: '507f1f77bcf86cd799439011',
        },
      } as unknown as User;
      const creditsData = {
        credits: [],
        total: 0,
      };

      mockCreditsUtilsService.getOrganizationCreditsWithExpiration.mockResolvedValue(
        creditsData,
      );
      mockSubscriptionsService.findByOrganizationId.mockResolvedValue(null);

      await controller.getCreditsBreakdown(userWithoutOrganization, request);

      expect(
        creditsUtilsService.getOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith('org_from_context');
    });
  });

  describe('getCreditUsage', () => {
    const buildSubscription = (
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      currentPeriodEnd: new Date('2026-03-31T00:00:00.000Z'),
      id: 'sub_1',
      organizationId: 'org_1',
      status: 'active',
      stripePriceId: 'price_pro_monthly',
      ...overrides,
    });

    beforeEach(() => {
      mockConfigGet.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          STRIPE_MONTHLY_CREDITS: '35000',
          STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY:
            'price_enterprise_monthly',
          STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: 'price_pro_monthly',
          STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY: 'price_pro_yearly',
          STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: 'price_scale_monthly',
        };
        return map[key] ?? '';
      });

      mockOrganizationsService.find.mockResolvedValue([
        { id: 'org_1', name: 'Acme Inc' },
      ]);
    });

    it('resolves the pro tier plan limit from the Stripe price id', async () => {
      mockSubscriptionsService.findAll.mockResolvedValue({
        docs: [buildSubscription({ stripePriceId: 'price_pro_monthly' })],
        limit: 20,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });
      mockCreditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(
        6_000,
      );

      const result = await controller.getCreditUsage({});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          balance: 6_000,
          isMaxedOut: false,
          isUnderUsing: false,
          organizationId: 'org_1',
          organizationName: 'Acme Inc',
          planLimit: 8_000,
          tier: 'pro',
          usedCredits: 2_000,
        }),
      );
      expect(result.data[0]?.usedPercent).toBeCloseTo(25, 5);
      expect(result.data[0]?.remainingPercent).toBeCloseTo(75, 5);
    });

    it('resolves the scale tier plan limit from the Stripe price id', async () => {
      mockSubscriptionsService.findAll.mockResolvedValue({
        docs: [
          buildSubscription({
            organizationId: 'org_2',
            stripePriceId: 'price_scale_monthly',
          }),
        ],
        limit: 20,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });
      mockOrganizationsService.find.mockResolvedValue([
        { id: 'org_2', name: 'Scale Co' },
      ]);
      mockCreditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(
        80_000,
      );

      const result = await controller.getCreditUsage({});

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          balance: 80_000,
          isUnderUsing: true,
          planLimit: 80_000,
          tier: 'scale',
          usedCredits: 0,
          usedPercent: 0,
        }),
      );
    });

    it('falls back to the configured monthly credits when the tier cannot be resolved', async () => {
      mockSubscriptionsService.findAll.mockResolvedValue({
        docs: [
          buildSubscription({
            organizationId: 'org_3',
            stripePriceId: 'price_unknown',
          }),
        ],
        limit: 20,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });
      mockOrganizationsService.find.mockResolvedValue([
        { id: 'org_3', name: 'Unknown Org' },
      ]);
      mockCreditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(
        0,
      );

      const result = await controller.getCreditUsage({});

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          isMaxedOut: true,
          planLimit: 35_000,
          tier: null,
          usedCredits: 35_000,
          usedPercent: 100,
        }),
      );
    });

    it('flags maxed-out orgs at >= 90% usage and under-using orgs at <= 10% usage', async () => {
      mockSubscriptionsService.findAll.mockResolvedValue({
        docs: [
          buildSubscription({ organizationId: 'org_maxed' }),
          buildSubscription({ organizationId: 'org_under' }),
        ],
        limit: 20,
        page: 1,
        totalDocs: 2,
        totalPages: 1,
      });
      mockOrganizationsService.find.mockResolvedValue([
        { id: 'org_maxed', name: 'Maxed Org' },
        { id: 'org_under', name: 'Under Org' },
      ]);
      mockCreditsUtilsService.getOrganizationCreditsBalance.mockImplementation(
        (organizationId: string) =>
          Promise.resolve(organizationId === 'org_maxed' ? 400 : 7_600),
      );

      const result = await controller.getCreditUsage({});

      const maxedRow = result.data.find(
        (row) => row.organizationId === 'org_maxed',
      );
      const underRow = result.data.find(
        (row) => row.organizationId === 'org_under',
      );

      expect(maxedRow?.isMaxedOut).toBe(true);
      expect(maxedRow?.isUnderUsing).toBe(false);
      expect(underRow?.isUnderUsing).toBe(true);
      expect(underRow?.isMaxedOut).toBe(false);
    });

    it('still returns balance/planLimit/usedPercent when currentPeriodEnd is missing', async () => {
      mockSubscriptionsService.findAll.mockResolvedValue({
        docs: [
          buildSubscription({
            currentPeriodEnd: null,
            organizationId: 'org_no_cycle',
          }),
        ],
        limit: 20,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });
      mockOrganizationsService.find.mockResolvedValue([
        { id: 'org_no_cycle', name: 'No Cycle Org' },
      ]);
      mockCreditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(
        4_000,
      );

      const result = await controller.getCreditUsage({});

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          balance: 4_000,
          currentPeriodEnd: null,
          planLimit: 8_000,
          usedCredits: 4_000,
        }),
      );
      expect(result.data[0]?.usedPercent).toBeCloseTo(50, 5);
    });

    it('batches organization lookups via find({ id: { in: [...] } }) instead of per-row calls', async () => {
      mockSubscriptionsService.findAll.mockResolvedValue({
        docs: [
          buildSubscription({ organizationId: 'org_a' }),
          buildSubscription({ organizationId: 'org_b' }),
        ],
        limit: 20,
        page: 1,
        totalDocs: 2,
        totalPages: 1,
      });
      mockOrganizationsService.find.mockResolvedValue([
        { id: 'org_a', name: 'Org A' },
        { id: 'org_b', name: 'Org B' },
      ]);
      mockCreditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(
        1_000,
      );

      await controller.getCreditUsage({});

      expect(mockOrganizationsService.find).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.find).toHaveBeenCalledWith({
        id: { in: ['org_a', 'org_b'] },
        isDeleted: false,
      });
    });
  });
});
