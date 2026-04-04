import { ConfigService } from '@api/config/config.service';
import { ListingsService } from '@api/marketplace/listings/services/listings.service';
import { CheckoutService } from '@api/marketplace/purchases/services/checkout.service';
import { PurchasesService } from '@api/marketplace/purchases/services/purchases.service';
import { SellersService } from '@api/marketplace/sellers/services/sellers.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { PurchaseStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('CheckoutService', () => {
  let service: CheckoutService;
  let listingsService: {
    getPublishedListing: ReturnType<typeof vi.fn>;
  };
  let purchasesService: {
    calculateCommission: ReturnType<typeof vi.fn>;
    completePurchase: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    hasAlreadyPurchased: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let sellersService: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let stripeSessionCreate: ReturnType<typeof vi.fn>;
  let stripeSessionRetrieve: ReturnType<typeof vi.fn>;
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  const sellerId = new Types.ObjectId();
  const listingId = new Types.ObjectId();

  const mockListing = {
    _id: listingId,
    currency: 'USD',
    price: 2500,
    pricingTier: 'standard',
    seller: sellerId,
    shortDescription: 'A test listing',
    thumbnail: 'https://example.com/thumb.jpg',
    title: 'Test Listing',
    type: 'template',
    version: 1,
  };

  beforeEach(() => {
    listingsService = { getPublishedListing: vi.fn() };
    purchasesService = {
      calculateCommission: vi.fn().mockReturnValue({
        platformFee: 250,
        sellerEarnings: 2250,
      }),
      completePurchase: vi.fn(),
      create: vi.fn(),
      hasAlreadyPurchased: vi.fn(),
      patch: vi.fn(),
    };
    sellersService = { findOne: vi.fn() };
    stripeSessionCreate = vi.fn();
    stripeSessionRetrieve = vi.fn();
    loggerService = { error: vi.fn(), log: vi.fn() };

    service = new CheckoutService(
      {} as ConfigService,
      loggerService as unknown as LoggerService,
      {
        stripe: {
          checkout: {
            sessions: {
              create: stripeSessionCreate,
              retrieve: stripeSessionRetrieve,
            },
          },
        },
      } as unknown as StripeService,
      listingsService as unknown as ListingsService,
      purchasesService as unknown as PurchasesService,
      sellersService as unknown as SellersService,
    );
  });

  const baseParams = {
    buyerId: new Types.ObjectId().toString(),
    cancelUrl: 'https://app.example.com/cancel',
    listingId: listingId.toString(),
    organizationId: new Types.ObjectId().toString(),
    successUrl: 'https://app.example.com/success',
  };

  describe('createCheckoutSession', () => {
    it('rejects when user has already purchased the item', async () => {
      purchasesService.hasAlreadyPurchased.mockResolvedValue(true);

      await expect(service.createCheckoutSession(baseParams)).rejects.toThrow(
        BadRequestException,
      );

      expect(listingsService.getPublishedListing).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when listing does not exist', async () => {
      purchasesService.hasAlreadyPurchased.mockResolvedValue(false);
      listingsService.getPublishedListing.mockResolvedValue(null);

      await expect(service.createCheckoutSession(baseParams)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects premium listings', async () => {
      purchasesService.hasAlreadyPurchased.mockResolvedValue(false);
      listingsService.getPublishedListing.mockResolvedValue({
        ...mockListing,
        pricingTier: 'premium',
      });

      await expect(service.createCheckoutSession(baseParams)).rejects.toThrow(
        BadRequestException,
      );

      expect(purchasesService.create).not.toHaveBeenCalled();
    });

    it('rejects free listings (price = 0)', async () => {
      purchasesService.hasAlreadyPurchased.mockResolvedValue(false);
      listingsService.getPublishedListing.mockResolvedValue({
        ...mockListing,
        price: 0,
      });

      await expect(service.createCheckoutSession(baseParams)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates purchase record, stripe session, and returns url', async () => {
      purchasesService.hasAlreadyPurchased.mockResolvedValue(false);
      listingsService.getPublishedListing.mockResolvedValue(mockListing);
      const purchaseId = new Types.ObjectId();
      purchasesService.create.mockResolvedValue({ _id: purchaseId });
      sellersService.findOne.mockResolvedValue(null); // no stripe connect
      stripeSessionCreate.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/session',
      });

      const result = await service.createCheckoutSession(baseParams);

      expect(purchasesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PurchaseStatus.PENDING,
          subtotal: 2500,
          total: 2500,
        }),
      );
      expect(stripeSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            listingId: listingId.toString(),
            type: 'marketplace',
          }),
          mode: 'payment',
        }),
      );
      expect(purchasesService.patch).toHaveBeenCalledWith(
        purchaseId.toString(),
        { stripeSessionId: 'cs_test_123' },
      );
      expect(result).toEqual({
        purchase: { _id: purchaseId },
        sessionId: 'cs_test_123',
        url: 'https://checkout.stripe.com/session',
      });
    });

    it('adds transfer_data for sellers with completed Stripe Connect', async () => {
      purchasesService.hasAlreadyPurchased.mockResolvedValue(false);
      listingsService.getPublishedListing.mockResolvedValue(mockListing);
      purchasesService.create.mockResolvedValue({
        _id: new Types.ObjectId(),
      });
      sellersService.findOne.mockResolvedValue({
        stripeAccountId: 'acct_seller_1',
        stripeOnboardingComplete: true,
      });
      stripeSessionCreate.mockResolvedValue({
        id: 'cs_test_456',
        url: 'https://checkout.stripe.com/session',
      });

      await service.createCheckoutSession(baseParams);

      expect(stripeSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent_data: {
            application_fee_amount: 250,
            transfer_data: { destination: 'acct_seller_1' },
          },
        }),
      );
    });

    it('does NOT add transfer_data when seller onboarding is incomplete', async () => {
      purchasesService.hasAlreadyPurchased.mockResolvedValue(false);
      listingsService.getPublishedListing.mockResolvedValue(mockListing);
      purchasesService.create.mockResolvedValue({
        _id: new Types.ObjectId(),
      });
      sellersService.findOne.mockResolvedValue({
        stripeAccountId: 'acct_seller_1',
        stripeOnboardingComplete: false,
      });
      stripeSessionCreate.mockResolvedValue({
        id: 'cs_test_789',
        url: 'https://checkout.stripe.com/session',
      });

      await service.createCheckoutSession(baseParams);

      expect(stripeSessionCreate).toHaveBeenCalledWith(
        expect.not.objectContaining({
          payment_intent_data: expect.anything(),
        }),
      );
    });
  });

  describe('handleSuccessfulCheckout', () => {
    it('completes purchase and records payment intent', async () => {
      const mockSession = {
        id: 'cs_test_100',
        metadata: {
          listingId: 'listing-1',
          purchaseId: 'purchase-1',
        },
        payment_intent: 'pi_abc123',
      };
      const completedPurchase = {
        _id: 'purchase-1',
        status: PurchaseStatus.PENDING,
      };
      purchasesService.completePurchase.mockResolvedValue(completedPurchase);

      const result = await service.handleSuccessfulCheckout(
        mockSession as unknown as import('stripe').Stripe.Checkout.Session,
      );

      expect(purchasesService.completePurchase).toHaveBeenCalledWith(
        'purchase-1',
      );
      expect(purchasesService.patch).toHaveBeenCalledWith('purchase-1', {
        stripePaymentIntentId: 'pi_abc123',
      });
      expect(result).toEqual({
        purchase: completedPurchase,
        success: true,
      });
    });

    it('returns failure when session has no purchaseId metadata', async () => {
      const mockSession = {
        id: 'cs_test_200',
        metadata: {},
      };

      const result = await service.handleSuccessfulCheckout(
        mockSession as unknown as import('stripe').Stripe.Checkout.Session,
      );

      expect(result.success).toBe(false);
      expect(purchasesService.completePurchase).not.toHaveBeenCalled();
    });
  });

  describe('handleFailedCheckout', () => {
    it('marks purchase as failed with reason', async () => {
      stripeSessionRetrieve.mockResolvedValue({
        id: 'cs_fail_1',
        metadata: { purchaseId: 'purchase-fail-1' },
      });

      await service.handleFailedCheckout('cs_fail_1', 'card_declined');

      expect(purchasesService.patch).toHaveBeenCalledWith('purchase-fail-1', {
        failureReason: 'card_declined',
        status: PurchaseStatus.FAILED,
      });
    });

    it('does nothing when session has no purchaseId', async () => {
      stripeSessionRetrieve.mockResolvedValue({
        id: 'cs_fail_2',
        metadata: {},
      });

      await service.handleFailedCheckout('cs_fail_2', 'expired');

      expect(purchasesService.patch).not.toHaveBeenCalled();
    });
  });

  describe('getCheckoutSession', () => {
    it('retrieves session from Stripe', async () => {
      const mockSession = { id: 'cs_get_1', status: 'complete' };
      stripeSessionRetrieve.mockResolvedValue(mockSession);

      const result = await service.getCheckoutSession('cs_get_1');

      expect(stripeSessionRetrieve).toHaveBeenCalledWith('cs_get_1');
      expect(result).toEqual(mockSession);
    });
  });
});
