import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { CreateSubscriptionPreviewDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import type { SubscriptionDocument } from '@api/collections/subscriptions/schemas/subscription.schema';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import type { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionPlan, SubscriptionStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { SubscriptionsController } from './subscriptions.controller';

const defaultQuery: BaseQueryDto = {
  isDeleted: false,
  limit: 10,
  page: 1,
  sort: 'createdAt: -1',
};

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;
  let subscriptionsService: SubscriptionsService;
  let creditsUtilsService: CreditsUtilsService;

  const mockUser: User = {
    brandId: 'b00000000000000000000000',
    id: 'user_123',
    organizationId: 'o11111111111111111111111',
    userId: 'u22222222222222222222222',
  };

  const mockSubscription = {
    billingAccountId: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date(),
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
    customerId: null,
    id: 's33333333333333333333333',
    isDeleted: false,
    organizationId: 'o11111111111111111111111',
    plan: SubscriptionPlan.MONTHLY,
    status: SubscriptionStatus.ACTIVE,
    stripePriceId: 'price_monthly',
    stripeSubscriptionId: 'sub_123',
    updatedAt: new Date(),
    userId: 'u22222222222222222222222',
  } satisfies SubscriptionDocument;

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

  // Credit grants resolve from the subscription's own Stripe price, so the
  // spec fixes what each price includes rather than a global env allowance.
  const mockCreditGrantService = {
    logUnresolvedGrant: vi.fn(),
    resolveMonthlyCredits: vi.fn().mockResolvedValue(null),
    resolvePlanCredits: vi.fn().mockResolvedValue(null),
    resolveTierFromPriceId: vi.fn().mockReturnValue(null),
  };

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
          provide: SubscriptionCreditGrantService,
          useValue: mockCreditGrantService,
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
    mockCreditGrantService.resolveMonthlyCredits.mockResolvedValue(null);
    mockCreditGrantService.resolvePlanCredits.mockResolvedValue(null);
    mockCreditGrantService.resolveTierFromPriceId.mockReturnValue(null);
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

      const result = await controller.findAll(request, defaultQuery);

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
          organizationId: mockUser.organizationId,
        },
      } as unknown as RequestWithContext;

      mockSubscriptionsService.changeSubscriptionPlan.mockResolvedValue(
        updatedSubscription,
      );

      const result = await controller.changePlan(
        mockRequest,
        mockUser,
        changeData,
      );

      expect(subscriptionsService.changeSubscriptionPlan).toHaveBeenCalledWith(
        mockUser.organizationId,
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
      ).toHaveBeenCalledWith(mockUser.organizationId, dto.price);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(preview);
    });
  });

  describe('getCreditsBreakdown', () => {
    it('should return credits breakdown with cycle metrics', async () => {
      const request = {
        context: { organizationId: mockUser.organizationId },
      } as unknown as RequestWithContext;
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
        plan: SubscriptionPlan.MONTHLY,
      });
      mockCreditGrantService.resolvePlanCredits.mockResolvedValue(5_900);

      const result = await controller.getCreditsBreakdown(mockUser, request);

      expect(
        creditsUtilsService.getOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith(mockUser.organizationId);
      expect(
        mockCreditsUtilsService.getCycleRemainingMetrics,
      ).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          ...creditsData,
          ...cycleMetrics,
          planLimit: 5_900,
        }),
      );
    });

    it('should fallback to total-based percentage when cycle window is unavailable', async () => {
      const request = {
        context: { organizationId: mockUser.organizationId },
      } as unknown as RequestWithContext;
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
      } as unknown as RequestWithContext;
      const userWithoutOrganization = {
        ...mockUser,
        organizationId: '',
      };
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

    const creditsByPrice: Record<string, number> = {
      price_pro_monthly: 5_900,
      price_pro_yearly: 5_900,
      price_scale_monthly: 60_000,
    };
    const tiersByPrice: Record<string, string> = {
      price_enterprise_monthly: 'enterprise',
      price_pro_monthly: 'pro',
      price_pro_yearly: 'pro',
      price_scale_monthly: 'scale',
    };

    beforeEach(() => {
      mockCreditGrantService.resolveMonthlyCredits.mockImplementation(
        async (stripePriceId: string) => creditsByPrice[stripePriceId] ?? null,
      );
      mockCreditGrantService.resolveTierFromPriceId.mockImplementation(
        (stripePriceId: string) => tiersByPrice[stripePriceId] ?? null,
      );

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
        2_950,
      );

      const result = await controller.getCreditUsage(defaultQuery);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          balance: 2_950,
          isMaxedOut: false,
          isUnderUsing: false,
          organizationId: 'org_1',
          organizationName: 'Acme Inc',
          planLimit: 5_900,
          tier: 'pro',
          usedCredits: 2_950,
        }),
      );
      expect(result.data[0]?.usedPercent).toBeCloseTo(50, 5);
      expect(result.data[0]?.remainingPercent).toBeCloseTo(50, 5);
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
        60_000,
      );

      const result = await controller.getCreditUsage(defaultQuery);

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          balance: 60_000,
          isUnderUsing: true,
          planLimit: 60_000,
          tier: 'scale',
          usedCredits: 0,
          usedPercent: 0,
        }),
      );
    });

    it('reports a zero plan limit when the price carries no resolvable grant', async () => {
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

      const result = await controller.getCreditUsage(defaultQuery);

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          isMaxedOut: false,
          planLimit: 0,
          tier: null,
          usedCredits: 0,
          usedPercent: 0,
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

      const result = await controller.getCreditUsage(defaultQuery);

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
        2_950,
      );

      const result = await controller.getCreditUsage(defaultQuery);

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          balance: 2_950,
          currentPeriodEnd: null,
          planLimit: 5_900,
          usedCredits: 2_950,
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

      await controller.getCreditUsage(defaultQuery);

      // No explicit `isDeleted: false` — #2429 moved soft-delete scoping into
      // the service layer, so call sites pass the filter alone. The guarantee
      // itself is covered by `base.service.spec.ts` / `scoped-where.spec.ts`.
      expect(mockOrganizationsService.find).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.find).toHaveBeenCalledWith({
        id: { in: ['org_a', 'org_b'] },
      });
    });
  });
});
