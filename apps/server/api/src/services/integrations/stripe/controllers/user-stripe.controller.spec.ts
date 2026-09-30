vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();
  return {
    ...actual,
    returnBadRequest: vi.fn((data: unknown) => {
      throw new HttpException(data as string, HttpStatus.BAD_REQUEST);
    }),
    returnInternalServerError: vi.fn((msg: string) => {
      throw new HttpException(msg, HttpStatus.INTERNAL_SERVER_ERROR);
    }),
    returnNotFound: vi.fn((name: string, id: string) => {
      throw new HttpException(
        { detail: `${name} ${id} not found` },
        HttpStatus.NOT_FOUND,
      );
    }),
    serializeSingle: vi.fn(
      (_req: unknown, _serializer: unknown, data: unknown) => data,
    ),
  };
});

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { UserStripeController } from '@api/services/integrations/stripe/controllers/user-stripe.controller';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import { USER_SUBSCRIPTIONS_SERVICE } from '@genfeedai/contracts/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('UserStripeController', () => {
  let controller: UserStripeController;
  let stripeService: {
    createUserCustomer: ReturnType<typeof vi.fn>;
    createUserPaymentSession: ReturnType<typeof vi.fn>;
    getUserBillingPortalUrl: ReturnType<typeof vi.fn>;
    retrieveCustomer: ReturnType<typeof vi.fn>;
  };
  let usersService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let userSubscriptionsService: {
    findByUser: ReturnType<typeof vi.fn>;
    getOrCreateSubscription: ReturnType<typeof vi.fn>;
  };
  let creditsUtilsService: {
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };
  let organizationsService: { findOne: ReturnType<typeof vi.fn> };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let lifecycleEmailService: {
    recordCheckoutStarted: ReturnType<typeof vi.fn>;
  };

  const dbUserId = 'test-object-id';
  const mockRequest = {
    headers: { origin: 'https://app.genfeed.ai' },
  } as unknown as Request;
  const mockRequestNoOrigin = { headers: {} } as unknown as Request;
  // Better Auth: request.user.id is the Genfeed User.id (JWT sub), not a
  // legacy external auth-provider id.
  const mockUser = {
    emailAddresses: [{ emailAddress: 'user@test.com' }],
    firstName: 'John',
    id: dbUserId,
    lastName: 'Doe',
  } as unknown as User;

  // Post-cutover identity is the canonical Genfeed user id.
  const mockDbUser = {
    id: dbUserId,
    stripeCustomerId: 'cus_existing',
  };

  beforeEach(async () => {
    stripeService = {
      createUserCustomer: vi.fn().mockResolvedValue({ id: 'cus_new123' }),
      createUserPaymentSession: vi.fn().mockResolvedValue({
        id: 'cs_user_1',
        url: 'https://checkout.stripe.com/pay',
      }),
      getUserBillingPortalUrl: vi
        .fn()
        .mockResolvedValue({ url: 'https://billing.stripe.com' }),
      retrieveCustomer: vi.fn().mockResolvedValue({
        id: 'cus_existing',
        metadata: { type: 'user', userId: dbUserId },
      }),
    };

    usersService = {
      findOne: vi.fn().mockResolvedValue(mockDbUser),
      patch: vi.fn().mockResolvedValue(mockDbUser),
    };

    userSubscriptionsService = {
      findByUser: vi.fn().mockResolvedValue({
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date(),
        id: 'user-subscription-1',
        isDeleted: false,
        plan: 'pro',
        status: 'active',
        stripeSubscriptionId: 'sub_1',
        userId: dbUserId,
      }),
      getOrCreateSubscription: vi.fn().mockResolvedValue({ id: 'sub_1' }),
    };

    creditsUtilsService = {
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(500),
    };

    organizationsService = {
      findOne: vi.fn().mockResolvedValue({ id: 'test-object-id' }),
    };
    lifecycleEmailService = {
      recordCheckoutStarted: vi.fn().mockResolvedValue(undefined),
    };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserStripeController],
      providers: [
        { provide: StripeService, useValue: stripeService },
        { provide: UsersService, useValue: usersService },
        {
          provide: USER_SUBSCRIPTIONS_SERVICE,
          useValue: userSubscriptionsService,
        },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: LoggerService, useValue: loggerService },
        { provide: LifecycleEmailService, useValue: lifecycleEmailService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UserStripeController>(UserStripeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createCheckoutSession', () => {
    const dto = { stripePriceId: 'price_credits_100' };

    it('should create checkout session for existing stripe customer', async () => {
      const result = await controller.createCheckoutSession(
        mockUser,
        dto,
        mockRequest,
      );
      expect(result).toEqual({
        id: 'cs_user_1',
        url: 'https://checkout.stripe.com/pay',
      });
      // Regression (#1199): resolve the DB user by canonical Genfeed User.id.
      expect(usersService.findOne).toHaveBeenCalledWith({
        id: dbUserId,
      });
      expect(stripeService.createUserCustomer).not.toHaveBeenCalled();
      expect(lifecycleEmailService.recordCheckoutStarted).toHaveBeenCalledWith({
        checkoutSessionId: 'cs_user_1',
        checkoutUrl: 'https://checkout.stripe.com/pay',
        source: 'user-checkout',
        userId: dbUserId,
      });
    });

    it('returns the created session when lifecycle recording fails', async () => {
      lifecycleEmailService.recordCheckoutStarted.mockRejectedValueOnce(
        new Error('lifecycle unavailable'),
      );

      const result = await controller.createCheckoutSession(
        mockUser,
        dto,
        mockRequest,
      );

      expect(result).toEqual({
        id: 'cs_user_1',
        url: 'https://checkout.stripe.com/pay',
      });
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'lifecycle email checkout-started recording skipped',
        ),
        {
          checkoutSessionId: 'cs_user_1',
          error: 'lifecycle unavailable',
        },
      );
      expect(loggerService.error).not.toHaveBeenCalled();
    });

    it('should create stripe customer if user has no stripeCustomerId', async () => {
      usersService.findOne.mockResolvedValueOnce({
        ...mockDbUser,
        stripeCustomerId: undefined,
      });
      await controller.createCheckoutSession(mockUser, dto, mockRequest);
      expect(stripeService.createUserCustomer).toHaveBeenCalledWith(
        dbUserId.toString(),
        'user@test.com',
        'John Doe',
      );
      expect(usersService.patch).toHaveBeenCalled();
    });

    it('should throw BAD_REQUEST when origin missing', async () => {
      await expect(
        controller.createCheckoutSession(mockUser, dto, mockRequestNoOrigin),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BAD_REQUEST when user email missing', async () => {
      const noEmailUser = {
        ...mockUser,
        emailAddresses: [],
      } as unknown as User;
      await expect(
        controller.createCheckoutSession(noEmailUser, dto, mockRequest),
      ).rejects.toThrow(HttpException);
    });

    it('should throw NOT_FOUND when db user not found', async () => {
      usersService.findOne.mockResolvedValueOnce(null);
      await expect(
        controller.createCheckoutSession(mockUser, dto, mockRequest),
      ).rejects.toThrow(HttpException);
    });

    it('should use default quantity=1 and mode=payment', async () => {
      await controller.createCheckoutSession(mockUser, dto, mockRequest);
      expect(stripeService.createUserPaymentSession).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'payment', quantity: 1 }),
      );
    });

    it('should pass custom quantity and mode', async () => {
      const customDto = {
        mode: 'subscription' as const,
        quantity: 5,
        stripePriceId: 'price_x',
      };
      await controller.createCheckoutSession(mockUser, customDto, mockRequest);
      expect(stripeService.createUserPaymentSession).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'subscription', quantity: 5 }),
      );
    });

    it('should re-throw HttpExceptions from service', async () => {
      stripeService.createUserPaymentSession.mockRejectedValueOnce(
        new HttpException('Payment error', HttpStatus.PAYMENT_REQUIRED),
      );
      await expect(
        controller.createCheckoutSession(mockUser, dto, mockRequest),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getBillingPortalUrl', () => {
    it('should return billing portal URL', async () => {
      const result = await controller.getBillingPortalUrl(
        mockUser,
        mockRequest,
      );
      expect(result).toEqual({ url: 'https://billing.stripe.com' });
    });

    it('should throw BAD_REQUEST when origin missing', async () => {
      await expect(
        controller.getBillingPortalUrl(mockUser, mockRequestNoOrigin),
      ).rejects.toThrow(HttpException);
    });

    it('should throw NOT_FOUND when user not found', async () => {
      usersService.findOne.mockResolvedValueOnce(null);
      await expect(
        controller.getBillingPortalUrl(mockUser, mockRequest),
      ).rejects.toThrow(HttpException);
    });

    it('should return a client error when user has no stripeCustomerId', async () => {
      usersService.findOne.mockResolvedValueOnce({
        ...mockDbUser,
        stripeCustomerId: undefined,
      });
      await expect(
        controller.getBillingPortalUrl(mockUser, mockRequest),
      ).rejects.toThrow(HttpException);
    });

    it('returns a sanitized service-unavailable response for provider failures', async () => {
      stripeService.retrieveCustomer.mockRejectedValueOnce(
        new Error('raw provider payload'),
      );

      const error = await controller
        .getBillingPortalUrl(mockUser, mockRequest)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(
        JSON.stringify((error as HttpException).getResponse()),
      ).not.toContain('raw provider payload');
      expect(JSON.stringify(loggerService.error.mock.calls)).not.toContain(
        'raw provider payload',
      );
    });
  });

  describe('getSubscription', () => {
    it('should return subscription with credits balance', async () => {
      const result = await controller.getSubscription(mockUser, mockRequest);
      expect(result).toEqual({
        data: {
          credits: { balance: 500 },
          hasSubscription: true,
          subscription: expect.objectContaining({
            plan: 'pro',
            status: 'active',
          }),
        },
        success: true,
      });
    });

    it('should return hasSubscription false when no subscription', async () => {
      userSubscriptionsService.findByUser.mockResolvedValueOnce(null);
      const result = await controller.getSubscription(mockUser, mockRequest);
      expect(result).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            hasSubscription: false,
            subscription: null,
          }),
        }),
      );
    });

    it('should return zero balance when no creator org', async () => {
      organizationsService.findOne.mockResolvedValueOnce(null);
      const result = await controller.getSubscription(mockUser, mockRequest);
      expect(result).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ credits: { balance: 0 } }),
        }),
      );
    });

    it('should throw NOT_FOUND when db user not found', async () => {
      usersService.findOne.mockResolvedValueOnce(null);
      await expect(
        controller.getSubscription(mockUser, mockRequest),
      ).rejects.toThrow(HttpException);
    });

    it('should handle service errors', async () => {
      userSubscriptionsService.findByUser.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(
        controller.getSubscription(mockUser, mockRequest),
      ).rejects.toThrow(HttpException);
    });
  });
});
