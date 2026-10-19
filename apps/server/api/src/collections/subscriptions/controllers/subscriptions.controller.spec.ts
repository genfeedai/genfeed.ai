import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { CreateSubscriptionPreviewDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import type { SubscriptionDocument } from '@api/collections/subscriptions/schemas/subscription.schema';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import type { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { TENANT_READ_POLICY } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { getTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { SubscriptionPlan, SubscriptionStatus } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  getTenantContext,
  isCrossOrgUnsafe,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { defer, firstValueFrom } from 'rxjs';
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
    findAdminBilling: vi.fn(),
    findAll: vi.fn(),
    findByOrganizationId: vi.fn().mockResolvedValue(null),
    previewSubscriptionChange: vi.fn(),
  };

  const mockCreditsUtilsService = {
    getCycleRemainingMetrics: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
    getOrganizationCreditsWithExpiration: vi.fn(),
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
          provide: SubscriptionCreditGrantService,
          useValue: mockCreditGrantService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        // The preview route's method filter reads the Sentry environment.
        { provide: ConfigService, useValue: { get: () => 'development' } },
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

    it('reads every organization instead of the superadmin request tenant', async () => {
      let isCrossOrgDuringRead = false;
      mockSubscriptionsService.findAll.mockImplementation(async () => {
        isCrossOrgDuringRead = isCrossOrgUnsafe();
        return {
          docs: [mockSubscription],
          limit: 10,
          page: 1,
          totalDocs: 1,
          totalPages: 1,
        };
      });

      await runWithTenantContext(
        { organizationId: mockUser.organizationId },
        () => controller.findAll({} as Request, defaultQuery),
      );

      expect(isCrossOrgDuringRead).toBe(true);
      expect(isCrossOrgUnsafe()).toBe(false);
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

      const request = {
        context: { organizationId: mockUser.organizationId },
      } as unknown as RequestWithContext;

      const result = await controller.previewChange(request, mockUser, dto);

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

  describe('current credits mutating tenant boundary', () => {
    const boundary = new TenantContextInterceptor(new Reflector());
    const contextOrg = testId('org', 2);
    const foreignOrg = testId('org', 3);
    const buildRequest = (
      user: User,
      query: Record<string, unknown>,
      organizationId = contextOrg,
    ) =>
      ({
        method: 'GET',
        query,
        user,
        context: {
          organizationId,
          userId: user.userId,
          brandId: user.brandId,
          isSuperAdmin: user.isSuperAdmin === true,
          subscriptionTier: '',
          stripeSubscriptionStatus: '',
          hydratedAt: 1,
        },
      }) as unknown as RequestWithContext;
    const execute = (request: RequestWithContext): ExecutionContext =>
      ({
        getClass: () => SubscriptionsController,
        getHandler: () => SubscriptionsController.prototype.getCreditsBreakdown,
        switchToHttp: () => ({ getRequest: () => request }),
      }) as unknown as ExecutionContext;
    beforeEach(() => {
      mockCreditsUtilsService.getOrganizationCreditsWithExpiration.mockResolvedValue(
        { total: 120, credits: [] },
      );
      mockCreditsUtilsService.getCycleRemainingMetrics.mockResolvedValue({
        cycleTotal: 240,
        remainingPercent: 50,
      });
      mockSubscriptionsService.findByOrganizationId.mockResolvedValue({
        ...mockSubscription,
        currentPeriodStart: new Date('2026-04-01'),
        currentPeriodEnd: new Date('2026-05-01'),
      });
      mockCreditGrantService.resolvePlanCredits.mockResolvedValue(5900);
    });
    afterEach(() => {
      mockCreditsUtilsService.getOrganizationCreditsWithExpiration.mockReset();
      mockCreditsUtilsService.getCycleRemainingMetrics.mockReset();
      mockSubscriptionsService.findByOrganizationId
        .mockReset()
        .mockResolvedValue(null);
    });
    it('marks the actual wrapped current credits GET mutating', () => {
      expect(
        Reflect.getMetadata(
          TENANT_READ_POLICY,
          SubscriptionsController.prototype.getCreditsBreakdown,
        ),
      ).toBe('mutating');
    });
    it.each([true, false])(
      'foreign selection refuses before wallet initialization and both parallel branches (superadmin=%s)',
      (isSuperAdmin) => {
        const user = { ...mockUser, isSuperAdmin };
        const request = buildRequest(user, { organizationId: foreignOrg });
        const walletInitialize = vi.fn();
        mockCreditsUtilsService.getOrganizationCreditsWithExpiration.mockImplementation(
          (organizationId: string) => {
            walletInitialize(organizationId);
            return Promise.resolve({ total: 0, credits: [] });
          },
        );
        const handle = vi.fn(() =>
          defer(() => controller.getCreditsBreakdown(user, request)),
        );
        expect(() => boundary.intercept(execute(request), { handle })).toThrow(
          expect.objectContaining({ status: 403 }),
        );
        expect(handle).not.toHaveBeenCalled();
        expect(walletInitialize).not.toHaveBeenCalled();
        expect(
          mockCreditsUtilsService.getOrganizationCreditsWithExpiration,
        ).not.toHaveBeenCalled();
        expect(
          mockSubscriptionsService.findByOrganizationId,
        ).not.toHaveBeenCalled();
        expect(
          mockCreditGrantService.resolvePlanCredits,
        ).not.toHaveBeenCalled();
        expect(
          mockCreditsUtilsService.getCycleRemainingMetrics,
        ).not.toHaveBeenCalled();
        expect(request.user).toBe(user);
        expect(request.context?.organizationId).toBe(contextOrg);
      },
    );
    it('invalid and array selectors cannot reach billing work', () => {
      for (const organizationId of ['', [], [foreignOrg], {}, 7]) {
        const user = { ...mockUser, isSuperAdmin: true };
        const request = buildRequest(user, { organizationId });
        const handle = vi.fn(() =>
          defer(() => controller.getCreditsBreakdown(user, request)),
        );
        expect(() => boundary.intercept(execute(request), { handle })).toThrow(
          expect.objectContaining({ status: 403 }),
        );
        expect(handle).not.toHaveBeenCalled();
      }
      expect(
        mockCreditsUtilsService.getOrganizationCreditsWithExpiration,
      ).not.toHaveBeenCalled();
      expect(
        mockSubscriptionsService.findByOrganizationId,
      ).not.toHaveBeenCalled();
    });
    it('same/no selection keeps context precedence, original identity and existing wallet initialization', async () => {
      const user = { ...mockUser, isSuperAdmin: true };
      const walletInitialize = vi.fn();
      mockCreditsUtilsService.getOrganizationCreditsWithExpiration.mockImplementation(
        (organizationId: string) => {
          expect(getTenantContext()?.organizationId).toBe(contextOrg);
          expect(getTenantReadScope()).toBeUndefined();
          walletInitialize(organizationId);
          return Promise.resolve({ total: 120, credits: [] });
        },
      );
      for (const query of [{}, { organizationId: contextOrg }]) {
        const request = buildRequest(user, query);
        const context = request.context;
        const original = { ...context };
        const handle = vi.fn(() =>
          defer(() => controller.getCreditsBreakdown(user, request)),
        );
        const result = await firstValueFrom(
          boundary.intercept(execute(request), { handle }),
        );
        expect(handle).toHaveBeenCalledTimes(1);
        expect(result).toEqual({
          success: true,
          data: {
            total: 120,
            credits: [],
            cycleTotal: 240,
            remainingPercent: 50,
            planLimit: 5900,
            cycleStartAt: new Date('2026-04-01'),
            cycleEndAt: new Date('2026-05-01'),
          },
        });
        expect(request.user).toBe(user);
        expect(request.context).toBe(context);
        expect(request.context).toEqual(original);
      }
      expect(walletInitialize.mock.calls).toEqual([[contextOrg], [contextOrg]]);
      expect(mockSubscriptionsService.findByOrganizationId.mock.calls).toEqual([
        [contextOrg],
        [contextOrg],
      ]);
      expect(
        mockCreditsUtilsService.getCycleRemainingMetrics,
      ).toHaveBeenNthCalledWith(
        1,
        contextOrg,
        new Date('2026-04-01'),
        new Date('2026-05-01'),
        120,
      );
      expect(user.organizationId).toBe(mockUser.organizationId);
    });
    it('user-only fallback and missing both retain original outcomes', async () => {
      const request = buildRequest(mockUser, {}, '');
      delete request.context;
      mockSubscriptionsService.findByOrganizationId.mockResolvedValue(null);
      const handle = vi.fn(() =>
        defer(() => controller.getCreditsBreakdown(mockUser, request)),
      );
      await expect(
        firstValueFrom(boundary.intercept(execute(request), { handle })),
      ).resolves.toEqual(expect.objectContaining({ success: true }));
      expect(
        mockCreditsUtilsService.getOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith(mockUser.organizationId);
      expect(
        mockSubscriptionsService.findByOrganizationId,
      ).toHaveBeenCalledWith(mockUser.organizationId);
      mockCreditsUtilsService.getOrganizationCreditsWithExpiration.mockClear();
      mockSubscriptionsService.findByOrganizationId.mockClear();
      const user = { ...mockUser, organizationId: '' };
      const missing = buildRequest(user, {}, '');
      await expect(
        firstValueFrom(
          boundary.intercept(execute(missing), {
            handle: () =>
              defer(() => controller.getCreditsBreakdown(user, missing)),
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(
        mockCreditsUtilsService.getOrganizationCreditsWithExpiration,
      ).not.toHaveBeenCalled();
      expect(
        mockSubscriptionsService.findByOrganizationId,
      ).not.toHaveBeenCalled();
    });
  });

  describe('getAdminBilling', () => {
    const billingRow = {
      balance: 30_000,
      currentPeriodEnd: null,
      hasSubscription: false,
      isMaxedOut: false,
      isUnderUsing: false,
      organizationId: 'org_1',
      organizationName: 'Acme Inc',
      ownerEmail: 'owner@example.com',
      plan: null,
      planLimit: 0,
      remainingPercent: 100,
      status: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      tier: 'free',
      usedCredits: 0,
      usedPercent: 0,
    };

    it('returns the requested page of organizations with pagination totals', async () => {
      mockSubscriptionsService.findAdminBilling.mockResolvedValue({
        docs: [billingRow],
        limit: 15,
        page: 2,
        totalDocs: 51,
        totalPages: 4,
      });

      const result = await controller.getAdminBilling({
        ...defaultQuery,
        limit: 15,
        page: 2,
      });

      expect(mockSubscriptionsService.findAdminBilling).toHaveBeenCalledWith({
        limit: 15,
        page: 2,
      });
      expect(result).toEqual({
        data: [billingRow],
        limit: 15,
        page: 2,
        success: true,
        totalDocs: 51,
        totalPages: 4,
      });
    });

    it('reads organizations, subscriptions and wallets outside the superadmin request tenant', async () => {
      let isCrossOrg = false;
      mockSubscriptionsService.findAdminBilling.mockImplementation(async () => {
        isCrossOrg = isCrossOrgUnsafe();
        return { docs: [], limit: 15, page: 1, totalDocs: 0, totalPages: 1 };
      });

      await runWithTenantContext({ organizationId: 'org_admin' }, () =>
        controller.getAdminBilling(defaultQuery),
      );

      expect(isCrossOrg).toBe(true);
    });
  });
});
