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
        { detail: `${name} ${id} doesn't exist`, title: `${name} not found` },
        HttpStatus.NOT_FOUND,
      );
    }),
    serializeSingle: vi.fn(
      (_req: unknown, _serializer: unknown, data: unknown) => data,
    ),
  };
});

import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { StripeController } from '@api/services/integrations/stripe/controllers/stripe.controller';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('StripeController', () => {
  let controller: StripeController;
  let stripeService: {
    createPaymentSession: ReturnType<typeof vi.fn>;
    createSetupCheckoutSession: ReturnType<typeof vi.fn>;
    getBillingPortalUrl: ReturnType<typeof vi.fn>;
  };
  let subscriptionsService: {
    createForOrganization: ReturnType<typeof vi.fn>;
    findByOrganizationId: ReturnType<typeof vi.fn>;
  };
  let usersService: { findOne: ReturnType<typeof vi.fn> };
  let organizationsService: { findOne: ReturnType<typeof vi.fn> };

  const mockRequest = {
    headers: { origin: 'https://app.genfeed.ai' },
  } as unknown as Request;
  const mockRequestNoOrigin = { headers: {} } as unknown as Request;
  const orgId = '507f1f77bcf86cd799439011';
  const userId = new Types.ObjectId();
  const mockUser = {
    emailAddresses: [{ emailAddress: 'test@example.com' }],
    id: 'clerk_user_123',
    publicMetadata: { organization: orgId, user: userId.toString() },
  } as unknown as User;

  const mockSubscription = {
    _id: new Types.ObjectId(),
    stripeCustomerId: 'cus_test123',
  };

  beforeEach(async () => {
    stripeService = {
      createPaymentSession: vi
        .fn()
        .mockResolvedValue({ url: 'https://checkout.stripe.com/session' }),
      createSetupCheckoutSession: vi
        .fn()
        .mockResolvedValue({ url: 'https://checkout.stripe.com/setup' }),
      getBillingPortalUrl: vi
        .fn()
        .mockResolvedValue({ url: 'https://billing.stripe.com/portal' }),
    };

    subscriptionsService = {
      createForOrganization: vi.fn().mockResolvedValue(mockSubscription),
      findByOrganizationId: vi.fn().mockResolvedValue(mockSubscription),
    };

    usersService = {
      findOne: vi
        .fn()
        .mockResolvedValue({ _id: userId, clerkId: 'clerk_user_123' }),
    };

    organizationsService = {
      findOne: vi.fn().mockResolvedValue({ _id: new Types.ObjectId(orgId) }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeController],
      providers: [
        { provide: LoggerService, useValue: { error: vi.fn(), log: vi.fn() } },
        { provide: StripeService, useValue: stripeService },
        { provide: SubscriptionsService, useValue: subscriptionsService },
        { provide: UsersService, useValue: usersService },
        { provide: OrganizationsService, useValue: organizationsService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StripeController>(StripeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createCheckoutSession', () => {
    const dto = { quantity: 1, stripePriceId: 'price_abc123' };

    it('should create a checkout session successfully', async () => {
      const result = await controller.createCheckoutSession(
        mockUser,
        dto,
        mockRequest,
      );
      expect(result).toEqual({ url: 'https://checkout.stripe.com/session' });
      expect(stripeService.createPaymentSession).toHaveBeenCalledWith(
        'cus_test123',
        'price_abc123',
        'https://app.genfeed.ai',
        1,
        undefined,
      );
    });

    it('should throw BAD_REQUEST when origin header is missing', async () => {
      await expect(
        controller.createCheckoutSession(mockUser, dto, mockRequestNoOrigin),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BAD_REQUEST when user has no email', async () => {
      const noEmailUser = {
        ...mockUser,
        emailAddresses: [],
      } as unknown as User;
      await expect(
        controller.createCheckoutSession(noEmailUser, dto, mockRequest),
      ).rejects.toThrow(HttpException);
    });

    it('should throw NOT_FOUND when db user does not exist', async () => {
      usersService.findOne.mockResolvedValueOnce(null);
      await expect(
        controller.createCheckoutSession(mockUser, dto, mockRequest),
      ).rejects.toThrow(HttpException);
    });

    it('should create subscription if none exists and org is found', async () => {
      subscriptionsService.findByOrganizationId.mockResolvedValueOnce(null);
      const result = await controller.createCheckoutSession(
        mockUser,
        dto,
        mockRequest,
      );
      expect(subscriptionsService.createForOrganization).toHaveBeenCalled();
      expect(result).toEqual({ url: 'https://checkout.stripe.com/session' });
    });

    it('should throw NOT_FOUND if subscription missing and org not found', async () => {
      subscriptionsService.findByOrganizationId.mockResolvedValueOnce(null);
      organizationsService.findOne.mockResolvedValueOnce(null);
      await expect(
        controller.createCheckoutSession(mockUser, dto, mockRequest),
      ).rejects.toThrow(HttpException);
    });

    it('should use custom redirect URLs when provided', async () => {
      const dtoWithUrls = {
        ...dto,
        cancelUrl: 'https://cancel.url',
        successUrl: 'https://success.url',
      };
      await controller.createCheckoutSession(
        mockUser,
        dtoWithUrls,
        mockRequest,
      );
      expect(stripeService.createPaymentSession).toHaveBeenCalledWith(
        'cus_test123',
        'price_abc123',
        'https://app.genfeed.ai',
        1,
        { cancel: 'https://cancel.url', success: 'https://success.url' },
      );
    });

    it('should re-throw HttpExceptions from stripe service', async () => {
      stripeService.createPaymentSession.mockRejectedValueOnce(
        new HttpException('Stripe error', HttpStatus.PAYMENT_REQUIRED),
      );
      await expect(
        controller.createCheckoutSession(mockUser, dto, mockRequest),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('createSetupCheckout', () => {
    it('should create a setup checkout session', async () => {
      const result = await controller.createSetupCheckout(
        mockUser,
        mockRequest,
      );
      expect(result).toEqual({ url: 'https://checkout.stripe.com/setup' });
    });

    it('should throw BAD_REQUEST when origin missing', async () => {
      await expect(
        controller.createSetupCheckout(mockUser, mockRequestNoOrigin),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BAD_REQUEST when user email missing', async () => {
      const noEmailUser = {
        ...mockUser,
        emailAddresses: [],
      } as unknown as User;
      await expect(
        controller.createSetupCheckout(noEmailUser, mockRequest),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getBillingPortalUrl', () => {
    it('should return billing portal URL', async () => {
      const result = await controller.getBillingPortalUrl(
        mockUser,
        mockRequest,
      );
      expect(result).toEqual({ url: 'https://billing.stripe.com/portal' });
    });

    it('should throw BAD_REQUEST when origin missing', async () => {
      await expect(
        controller.getBillingPortalUrl(mockUser, mockRequestNoOrigin),
      ).rejects.toThrow(HttpException);
    });

    it('should throw NOT_FOUND when subscription not found', async () => {
      subscriptionsService.findByOrganizationId.mockResolvedValueOnce(null);
      await expect(
        controller.getBillingPortalUrl(mockUser, mockRequest),
      ).rejects.toThrow(HttpException);
    });

    it('should handle stripe service errors gracefully', async () => {
      stripeService.getBillingPortalUrl.mockRejectedValueOnce(
        new Error('Stripe is down'),
      );
      await expect(
        controller.getBillingPortalUrl(mockUser, mockRequest),
      ).rejects.toThrow(HttpException);
    });
  });
});
