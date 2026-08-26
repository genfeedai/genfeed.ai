import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import type { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionPlan, SubscriptionStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionsController } from './subscriptions.controller';

type MockFn = ReturnType<typeof vi.fn>;

const ORGANIZATION_ID = 'org_1';

const defaultQuery: BaseQueryDto = {
  isDeleted: false,
  limit: 10,
  page: 1,
  sort: 'createdAt: -1',
};

const mockUser = {
  brandId: 'brand_1',
  id: 'user_1',
  organizationId: ORGANIZATION_ID,
  userId: 'user_1',
} satisfies User;

function contextRequest(organizationId?: string): RequestWithContext {
  return {
    context: organizationId ? { organizationId } : undefined,
  } as unknown as RequestWithContext;
}

/** Reads the structured payload an HttpException was constructed with. */
function payloadOf(error: unknown): Record<string, unknown> {
  expect(error).toBeInstanceOf(HttpException);
  const httpError = error as HttpException;
  expect(httpError.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  return httpError.getResponse() as Record<string, unknown>;
}

describe('SubscriptionsController — failure paths and plan/cycle mapping', () => {
  let controller: SubscriptionsController;
  let subscriptionsService: {
    changeSubscriptionPlan: MockFn;
    findAll: MockFn;
    findByOrganizationId: MockFn;
    previewSubscriptionChange: MockFn;
  };
  let creditsUtilsService: {
    getCycleRemainingMetrics: MockFn;
    getOrganizationCreditsBalance: MockFn;
    getOrganizationCreditsWithExpiration: MockFn;
  };
  let organizationsService: { find: MockFn };
  let loggerService: {
    debug: MockFn;
    error: MockFn;
    log: MockFn;
    warn: MockFn;
  };
  let creditGrantService: {
    logUnresolvedGrant: MockFn;
    resolveMonthlyCredits: MockFn;
    resolvePlanCredits: MockFn;
    resolveTierFromPriceId: MockFn;
  };

  beforeEach(async () => {
    subscriptionsService = {
      changeSubscriptionPlan: vi.fn(),
      findAll: vi.fn(),
      findByOrganizationId: vi.fn().mockResolvedValue(null),
      previewSubscriptionChange: vi.fn(),
    };
    creditsUtilsService = {
      getCycleRemainingMetrics: vi
        .fn()
        .mockResolvedValue({ cycleTotal: 0, remainingPercent: 0 }),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
      getOrganizationCreditsWithExpiration: vi
        .fn()
        .mockResolvedValue({ credits: [], total: 0 }),
    };
    organizationsService = { find: vi.fn().mockResolvedValue([]) };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    // Nothing resolves by default: the price decides the grant, and a price we
    // cannot read grants nothing rather than a deployment-wide allowance.
    creditGrantService = {
      logUnresolvedGrant: vi.fn(),
      resolveMonthlyCredits: vi.fn().mockResolvedValue(null),
      resolvePlanCredits: vi.fn().mockResolvedValue(null),
      resolveTierFromPriceId: vi.fn().mockReturnValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        { provide: SubscriptionsService, useValue: subscriptionsService },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
        { provide: OrganizationsService, useValue: organizationsService },
        {
          provide: SubscriptionCreditGrantService,
          useValue: creditGrantService,
        },
        { provide: LoggerService, useValue: loggerService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SubscriptionsController>(SubscriptionsController);
  });

  describe('error envelopes', () => {
    it('wraps a findAll failure in a 500 envelope', async () => {
      subscriptionsService.findAll.mockRejectedValue(new Error('db offline'));

      const error = await controller
        .findAll({} as Request, defaultQuery)
        .catch((caught: unknown) => caught);

      expect(payloadOf(error)).toEqual({
        error: 'db offline',
        message: 'Failed to retrieve subscriptions',
        success: false,
      });
    });

    it('wraps a plan-change failure in a 500 envelope', async () => {
      subscriptionsService.changeSubscriptionPlan.mockRejectedValue(
        new Error('card_declined'),
      );

      const error = await controller
        .changePlan(contextRequest(ORGANIZATION_ID), mockUser, {
          newPriceId: 'price_new',
        })
        .catch((caught: unknown) => caught);

      expect(payloadOf(error)).toEqual({
        error: 'card_declined',
        message: 'Failed to change subscription plan',
        success: false,
      });
    });

    it('falls back to token metadata when the request carries no context', async () => {
      subscriptionsService.changeSubscriptionPlan.mockResolvedValue({});

      await controller.changePlan(contextRequest(), mockUser, {
        newPriceId: 'price_new',
      });

      expect(subscriptionsService.changeSubscriptionPlan).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        'price_new',
      );
    });

    it('wraps a preview failure in a 500 envelope', async () => {
      subscriptionsService.previewSubscriptionChange.mockRejectedValue(
        new Error('stripe unavailable'),
      );

      const error = await controller
        .previewChange(mockUser, { price: 'price_new' })
        .catch((caught: unknown) => caught);

      expect(payloadOf(error)).toEqual({
        error: 'stripe unavailable',
        message: 'Failed to generate preview',
        success: false,
      });
    });

    it('wraps a credits-breakdown failure in a 500 envelope', async () => {
      creditsUtilsService.getOrganizationCreditsWithExpiration.mockRejectedValue(
        new Error('credits ledger unavailable'),
      );

      const error = await controller
        .getCreditsBreakdown(mockUser, contextRequest(ORGANIZATION_ID))
        .catch((caught: unknown) => caught);

      expect(payloadOf(error)).toEqual({
        error: 'credits ledger unavailable',
        message: 'Failed to get credits breakdown',
        success: false,
      });
    });

    it('refuses a credits breakdown with no resolvable organization', async () => {
      const anonymousUser = {
        ...mockUser,
        organizationId: '',
      };

      const error = await controller
        .getCreditsBreakdown(anonymousUser, contextRequest())
        .catch((caught: unknown) => caught);

      expect(payloadOf(error)).toEqual({
        error: 'Organization ID is required to retrieve credits',
        message: 'Failed to get credits breakdown',
        success: false,
      });
      expect(
        creditsUtilsService.getOrganizationCreditsWithExpiration,
      ).not.toHaveBeenCalled();
    });

    it('wraps an admin credit-usage failure in a 500 envelope', async () => {
      subscriptionsService.findAll.mockRejectedValue(new Error('timeout'));

      const error = await controller
        .getCreditUsage(defaultQuery)
        .catch((caught: unknown) => caught);

      expect(payloadOf(error)).toEqual({
        error: 'timeout',
        message: 'Failed to retrieve organization credit usage',
        success: false,
      });
    });
  });

  describe('plan limits and billing-cycle windows', () => {
    it('uses the yearly allocation from the price and a 12-month cycle window', async () => {
      creditGrantService.resolvePlanCredits.mockResolvedValue(600_000);
      creditsUtilsService.getOrganizationCreditsWithExpiration.mockResolvedValue(
        { credits: [], total: 120_000 },
      );
      creditsUtilsService.getCycleRemainingMetrics.mockResolvedValue({
        cycleTotal: 600_000,
        remainingPercent: 20,
      });
      subscriptionsService.findByOrganizationId.mockResolvedValue({
        currentPeriodEnd: new Date('2027-03-31T00:00:00.000Z'),
        id: 'sub_1',
        organizationId: ORGANIZATION_ID,
        plan: SubscriptionPlan.YEARLY,
        status: SubscriptionStatus.ACTIVE,
        stripePriceId: 'price_pro_yearly',
      });

      const result = await controller.getCreditsBreakdown(
        mockUser,
        contextRequest(ORGANIZATION_ID),
      );

      expect(creditGrantService.resolvePlanCredits).toHaveBeenCalledWith(
        SubscriptionPlan.YEARLY,
        'price_pro_yearly',
      );
      expect(creditsUtilsService.getCycleRemainingMetrics).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        new Date('2026-03-31T00:00:00.000Z'),
        new Date('2027-03-31T00:00:00.000Z'),
        120_000,
      );
      expect(result.data.planLimit).toBe(600_000);
      expect(result.data.cycleStartAt).toEqual(
        new Date('2026-03-31T00:00:00.000Z'),
      );
      expect(result.data.remainingPercent).toBe(20);
    });

    it('reports no plan limit when the yearly price carries no resolvable grant', async () => {
      subscriptionsService.findByOrganizationId.mockResolvedValue({
        currentPeriodEnd: null,
        id: 'sub_1',
        organizationId: ORGANIZATION_ID,
        plan: SubscriptionPlan.YEARLY,
        stripePriceId: 'price_unknown',
      });

      const result = await controller.getCreditsBreakdown(
        mockUser,
        contextRequest(ORGANIZATION_ID),
      );

      expect(result.data.planLimit).toBe(0);
      expect(
        creditsUtilsService.getCycleRemainingMetrics,
      ).not.toHaveBeenCalled();
    });

    it('reports no plan limit and no cycle window for a non-recurring plan', async () => {
      creditsUtilsService.getOrganizationCreditsWithExpiration.mockResolvedValue(
        { credits: [], total: 250 },
      );
      subscriptionsService.findByOrganizationId.mockResolvedValue({
        currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
        id: 'sub_1',
        organizationId: ORGANIZATION_ID,
        plan: SubscriptionPlan.PAYG,
      });

      const result = await controller.getCreditsBreakdown(
        mockUser,
        contextRequest(ORGANIZATION_ID),
      );

      expect(result.data.planLimit).toBe(0);
      expect(result.data.cycleStartAt).toBeUndefined();
      expect(result.data.cycleEndAt).toBeUndefined();
      expect(result.data.cycleTotal).toBe(250);
      expect(result.data.remainingPercent).toBe(100);
    });
  });

  describe('admin credit usage', () => {
    it('reports a null tier and no plan limit for a subscription with no Stripe price', async () => {
      subscriptionsService.findAll.mockResolvedValue({
        docs: [
          {
            currentPeriodEnd: null,
            id: 'sub_1',
            organizationId: ORGANIZATION_ID,
            status: SubscriptionStatus.ACTIVE,
            stripePriceId: null,
          },
        ],
        limit: 20,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });
      creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(
        35_000,
      );
      organizationsService.find.mockResolvedValue([
        { id: ORGANIZATION_ID, label: 'Acme Inc' },
      ]);

      const result = await controller.getCreditUsage(defaultQuery);

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          isUnderUsing: false,
          organizationName: 'Acme Inc',
          planLimit: 0,
          status: SubscriptionStatus.ACTIVE,
          tier: null,
          usedCredits: 0,
          usedPercent: 0,
        }),
      );
    });

    it('skips the organization lookup when no rows carry an organization', async () => {
      subscriptionsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'sub_orphan',
            organizationId: '',
            status: null,
            stripePriceId: null,
          },
        ],
        limit: 20,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      const result = await controller.getCreditUsage(defaultQuery);

      expect(organizationsService.find).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.getOrganizationCreditsBalance,
      ).not.toHaveBeenCalled();
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          balance: 0,
          currentPeriodEnd: null,
          isMaxedOut: false,
          isUnderUsing: false,
          organizationName: 'N/A',
          remainingPercent: 100,
          status: null,
          usedCredits: 0,
          usedPercent: 0,
        }),
      );
    });
  });
});
