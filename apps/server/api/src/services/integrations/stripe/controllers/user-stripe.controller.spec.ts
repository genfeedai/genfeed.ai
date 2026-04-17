vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: '507f1f77bcf86cd799439011',
    user: '507f1f77bcf86cd799439013',
  })),
}));

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

import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UserSubscriptionsService } from '@api/collections/user-subscriptions/services/user-subscriptions.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { UserStripeController } from '@api/services/integrations/stripe/controllers/user-stripe.controller';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import type { User } from '@clerk/backend';
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

  const dbUserId = new Types.ObjectId();
  const mockRequest = {
    headers: { origin: 'https://app.genfeed.ai' },
  } as unknown as Request;
  const mockRequestNoOrigin = { headers: {} } as unknown as Request;
  const mockUser = {
    emailAddresses: [{ emailAddress: 'user@test.com' }],
    firstName: 'John',
    id: 'clerk_user_1',
    lastName: 'Doe',
  } as unknown as User;

  const mockDbUser = {
    _id: dbUserId,
    clerkId: 'clerk_user_1',
    stripeCustomerId: 'cus_existing',
  };

  beforeEach(async () => {
    stripeService = {
      createUserCustomer: vi.fn().mockResolvedValue({ id: 'cus_new123' }),
      createUserPaymentSession: vi
        .fn()
        .mockResolvedValue({ url: 'https://checkout.stripe.com/pay' }),
      getUserBillingPortalUrl: vi
        .fn()
        .mockResolvedValue({ url: 'https://billing.stripe.com' }),
    };

    usersService = {
      findOne: vi.fn().mockResolvedValue(mockDbUser),
      patch: vi.fn().mockResolvedValue(mockDbUser),
    };

    userSubscriptionsService = {
      findByUser: vi.fn().mockResolvedValue({
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date(),
        status: 'active',
        type: 'pro',
      }),
      getOrCreateSubscription: vi.fn().mockResolvedValue({ id: 'sub_1' }),
    };

    creditsUtilsService = {
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(500),
    };

    organizationsService = {
      findOne: vi.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserStripeController],
      providers: [
        { provide: StripeService, useValue: stripeService },
        { provide: UsersService, useValue: usersService },
        {
          provide: UserSubscriptionsService,
          useValue: userSubscriptionsService,
        },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
        { provide: OrganizationsService, useValue: organizationsService },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
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
      expect(result).toEqual({ url: 'https://checkout.stripe.com/pay' });
      expect(stripeService.createUserCustomer).not.toHaveBeenCalled();
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

    it('should throw NOT_FOUND when user has no stripeCustomerId', async () => {
      usersService.findOne.mockResolvedValueOnce({
        ...mockDbUser,
        stripeCustomerId: undefined,
      });
      await expect(
        controller.getBillingPortalUrl(mockUser, mockRequest),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getSubscription', () => {
    it('should return subscription with credits balance', async () => {
      const result = await controller.getSubscription(mockUser, mockRequest);
      expect(result).toEqual({
        data: {
          credits: { balance: 500 },
          hasSubscription: true,
          subscription: expect.objectContaining({ status: 'active' }),
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
