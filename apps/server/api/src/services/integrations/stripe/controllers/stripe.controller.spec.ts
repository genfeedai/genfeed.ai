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

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CustomersService } from '@api/collections/customers/services/customers.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { StripeController } from '@api/services/integrations/stripe/controllers/stripe.controller';
import { OrganizationBillingAccountService } from '@api/services/integrations/stripe/services/organization-billing-account.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/interfaces/billing';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('StripeController', () => {
  let controller: StripeController;
  let stripeService: {
    createOrganizationCustomer: ReturnType<typeof vi.fn>;
    createPaymentSession: ReturnType<typeof vi.fn>;
    createSetupCheckoutSession: ReturnType<typeof vi.fn>;
    getBillingPortalUrl: ReturnType<typeof vi.fn>;
    findOrganizationCustomers: ReturnType<typeof vi.fn>;
    retrieveCustomer: ReturnType<typeof vi.fn>;
  };
  let subscriptionsService: {
    createForOrganization: ReturnType<typeof vi.fn>;
    findByOrganizationId: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let usersService: { findOne: ReturnType<typeof vi.fn> };
  let organizationsService: { findOne: ReturnType<typeof vi.fn> };
  let lifecycleEmailService: {
    recordCheckoutStarted: ReturnType<typeof vi.fn>;
  };
  let customersService: {
    findByOrganizationId: ReturnType<typeof vi.fn>;
    provisionForOrganization: ReturnType<typeof vi.fn>;
    upsertForOrganization: ReturnType<typeof vi.fn>;
  };

  const mockRequest = {
    headers: { origin: 'https://app.genfeed.ai' },
  } as unknown as Request;
  const mockRequestNoOrigin = { headers: {} } as unknown as Request;
  const orgId = testId('org');
  const userId = 'test-object-id';
  // Better Auth: request.user.id is the Genfeed User.id (JWT sub), not a
  // legacy external auth-provider id.
  const mockUser = {
    emailAddresses: [{ emailAddress: 'test@example.com' }],
    id: userId,
    organizationId: orgId,
    userId: userId.toString(),
  } as unknown as User;

  const mockSubscription = {
    id: 'test-object-id',
    customerId: 'cust_row_1',
    stripeCustomerId: 'cus_test123',
  };

  beforeEach(async () => {
    stripeService = {
      createOrganizationCustomer: vi.fn().mockResolvedValue({
        id: 'cus_recreated',
      }),
      createPaymentSession: vi.fn().mockResolvedValue({
        id: 'cs_org_1',
        url: 'https://checkout.stripe.com/session',
      }),
      createSetupCheckoutSession: vi
        .fn()
        .mockResolvedValue({ url: 'https://checkout.stripe.com/setup' }),
      getBillingPortalUrl: vi
        .fn()
        .mockResolvedValue({ url: 'https://billing.stripe.com/portal' }),
      findOrganizationCustomers: vi.fn().mockResolvedValue([]),
      retrieveCustomer: vi.fn().mockResolvedValue({
        id: 'cus_test123',
        metadata: { organizationId: orgId, type: 'organization' },
      }),
    };

    subscriptionsService = {
      createForOrganization: vi.fn().mockResolvedValue(mockSubscription),
      findByOrganizationId: vi.fn().mockResolvedValue(mockSubscription),
      patch: vi.fn().mockResolvedValue(mockSubscription),
    };

    usersService = {
      // Post-cutover identity is the canonical Genfeed user id.
      findOne: vi.fn().mockResolvedValue({
        id: userId,
      }),
    };

    organizationsService = {
      findOne: vi.fn().mockResolvedValue({ id: orgId, label: 'Test Org' }),
    };
    lifecycleEmailService = {
      recordCheckoutStarted: vi.fn().mockResolvedValue(undefined),
    };

    const findByOrganizationId = vi.fn(async (_organizationId: string) => ({
      id: 'cust_row_1',
      stripeCustomerId: 'cus_test123',
    }));
    const upsertForOrganization = vi.fn(
      async (_organizationId: string, stripeCustomerId: string) => ({
        id: 'cust_row_1',
        stripeCustomerId,
      }),
    );

    customersService = {
      findByOrganizationId,
      provisionForOrganization: vi.fn(
        async (
          organizationId: string,
          provision: (current: string | null) => Promise<string>,
        ) => {
          const current = await findByOrganizationId(organizationId);
          const stripeCustomerId = await provision(
            current?.stripeCustomerId ?? null,
          );
          return await upsertForOrganization(organizationId, stripeCustomerId);
        },
      ),
      upsertForOrganization,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeController],
      providers: [
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: StripeService, useValue: stripeService },
        OrganizationBillingAccountService,
        { provide: SUBSCRIPTIONS_SERVICE, useValue: subscriptionsService },
        { provide: CustomersService, useValue: customersService },
        { provide: UsersService, useValue: usersService },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: LifecycleEmailService, useValue: lifecycleEmailService },
        {
          provide: BillingAccountsService,
          useValue: {
            ensureForOrganization: vi.fn().mockResolvedValue({ id: 'ba_1' }),
            requireRole: vi.fn().mockResolvedValue('OWNER'),
            resolveForOrganization: vi.fn().mockResolvedValue({ id: 'ba_1' }),
          },
        },
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
      expect(result).toEqual({
        id: 'cs_org_1',
        url: 'https://checkout.stripe.com/session',
      });
      // Regression (#1199): resolve the DB user by canonical Genfeed User.id.
      expect(usersService.findOne).toHaveBeenCalledWith({
        id: userId,
      });
      expect(lifecycleEmailService.recordCheckoutStarted).toHaveBeenCalledWith({
        checkoutSessionId: 'cs_org_1',
        checkoutUrl: 'https://checkout.stripe.com/session',
        organizationId: orgId,
        source: 'organization-checkout',
        userId,
      });
      expect(stripeService.createPaymentSession).toHaveBeenCalledWith(
        'cus_test123',
        'price_abc123',
        'https://app.genfeed.ai',
        1,
        undefined,
        { organizationId: orgId },
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
      expect(result).toEqual({
        id: 'cs_org_1',
        url: 'https://checkout.stripe.com/session',
      });
    });

    it('never creates a second Stripe customer for an org that already has one', async () => {
      // Regression: an organization owns exactly one Stripe customer. When the
      // subscription projection carries no stripeCustomerId, the org's customer
      // row is authoritative — treating the gap as "no customer" duplicated the
      // org on Stripe on every first checkout.
      subscriptionsService.findByOrganizationId.mockResolvedValueOnce(null);
      subscriptionsService.createForOrganization.mockResolvedValueOnce({
        customerId: 'cust_row_1',
        id: 'test-object-id',
        stripeCustomerId: undefined,
      });
      customersService.findByOrganizationId.mockResolvedValueOnce({
        id: 'cust_row_1',
        stripeCustomerId: 'cus_test123',
      });

      await controller.createCheckoutSession(mockUser, dto, mockRequest);

      expect(customersService.findByOrganizationId).toHaveBeenCalledWith(orgId);
      expect(stripeService.createOrganizationCustomer).not.toHaveBeenCalled();
      expect(stripeService.createPaymentSession).toHaveBeenCalledWith(
        'cus_test123',
        'price_abc123',
        'https://app.genfeed.ai',
        1,
        undefined,
        { organizationId: orgId },
      );
    });

    it('rebinds the single org customer row when the Stripe customer is stale', async () => {
      // Recreate path: the org's customer no longer resolves on the active
      // Stripe account. The replacement must converge on the org's ONE
      // customer row (upsert) and repoint the subscription at it — never
      // insert a second row.
      subscriptionsService.findByOrganizationId.mockResolvedValueOnce({
        customerId: 'cust_row_old',
        id: 'test-object-id',
        stripeCustomerId: 'cus_stale',
      });
      customersService.findByOrganizationId.mockResolvedValueOnce({
        id: 'cust_row_old',
        stripeCustomerId: 'cus_stale',
      });
      stripeService.retrieveCustomer.mockResolvedValueOnce(null);
      organizationsService.findOne.mockResolvedValueOnce({
        id: orgId,
        label: 'Acme Inc',
      });
      customersService.upsertForOrganization.mockResolvedValueOnce({
        id: 'cust_row_1',
        stripeCustomerId: 'cus_recreated',
      });

      await controller.createCheckoutSession(mockUser, dto, mockRequest);

      expect(customersService.upsertForOrganization).toHaveBeenCalledWith(
        orgId,
        'cus_recreated',
      );
      expect(stripeService.createOrganizationCustomer).toHaveBeenCalledWith(
        'Acme Inc',
        'test@example.com',
        orgId,
        userId,
        'cus_stale',
      );
      expect(subscriptionsService.patch).toHaveBeenCalledWith(
        'test-object-id',
        { customerId: 'cust_row_1' },
      );
      expect(stripeService.createPaymentSession).toHaveBeenCalledWith(
        'cus_recreated',
        'price_abc123',
        'https://app.genfeed.ai',
        1,
        undefined,
        { organizationId: orgId },
      );
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
        { organizationId: orgId },
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
    it('blocks a conflicting organization customer projection', async () => {
      subscriptionsService.findByOrganizationId.mockResolvedValueOnce({
        ...mockSubscription,
        stripeCustomerId: 'cus_stale_projection',
      });
      customersService.findByOrganizationId.mockResolvedValueOnce({
        id: 'cust_row_1',
        stripeCustomerId: 'cus_authoritative',
      });

      await expect(
        controller.createSetupCheckout(mockUser, mockRequest),
      ).rejects.toThrow(HttpException);
      expect(stripeService.createSetupCheckoutSession).not.toHaveBeenCalled();
    });

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

    it('should return to the origin root when no returnPath is given', async () => {
      await controller.getBillingPortalUrl(mockUser, mockRequest);

      expect(stripeService.getBillingPortalUrl).toHaveBeenCalledWith(
        'cus_test123',
        'https://app.genfeed.ai',
      );
    });

    it('should append a relative returnPath to the request origin', async () => {
      await controller.getBillingPortalUrl(
        mockUser,
        mockRequest,
        '/acme/~/settings/organization/subscription',
      );

      expect(stripeService.getBillingPortalUrl).toHaveBeenCalledWith(
        'cus_test123',
        'https://app.genfeed.ai/acme/~/settings/organization/subscription',
      );
    });

    it.each([
      'https://evil.example.com',
      '//evil.example.com',
      '\\\\evil.example.com',
      'settings/organization/subscription',
    ])('should discard the off-origin returnPath %s', async (returnPath) => {
      await controller.getBillingPortalUrl(mockUser, mockRequest, returnPath);

      expect(stripeService.getBillingPortalUrl).toHaveBeenCalledWith(
        'cus_test123',
        'https://app.genfeed.ai',
      );
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
    });
  });
});
