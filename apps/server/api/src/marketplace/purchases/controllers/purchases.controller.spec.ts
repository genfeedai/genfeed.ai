vi.mock('@api/helpers/guards/clerk/clerk.guard', () => ({
  ClerkGuard: vi.fn().mockImplementation(function () {
    return { canActivate: vi.fn().mockReturnValue(true) };
  }),
}));

vi.mock('@api/helpers/guards/roles/roles.guard', () => ({
  RolesGuard: vi.fn().mockImplementation(function () {
    return { canActivate: vi.fn().mockReturnValue(true) };
  }),
}));

vi.mock('@api/helpers/decorators/user/current-user.decorator', () => ({
  CurrentUser:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
}));

vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => (target: unknown) => target,
}));

vi.mock('@api/helpers/decorators/roles/roles.decorator', () => ({
  RolesDecorator: () => () => undefined,
}));

vi.mock('@genfeedai/serializers', () => ({
  MarketplaceAnalyticsOverviewSerializer: {},
  MarketplacePurchaseSerializer: {},
  PurchaseSerializer: {},
  SellerSerializer: {},
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((_ctx: string, id: string) => ({
    data: null,
    errors: [{ detail: `${id} not found`, status: '404' }],
  })),
  serializeCollection: vi.fn((_req: unknown, _s: unknown, data: unknown) => ({
    data,
  })),
  serializeSingle: vi.fn((_req: unknown, _s: unknown, data: unknown) => ({
    data: { attributes: data, id: 'mock-id', type: 'purchase' },
  })),
}));

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: 'org-123',
    user: 'user-abc',
  })),
}));

import { ListingsService } from '@api/marketplace/listings/services/listings.service';
import {
  AdminMarketplaceController,
  AdminMarketplacePurchasesController,
  PurchasesController,
} from '@api/marketplace/purchases/controllers/purchases.controller';
import { CheckoutService } from '@api/marketplace/purchases/services/checkout.service';
import { InstallService } from '@api/marketplace/purchases/services/install.service';
import { PurchasesService } from '@api/marketplace/purchases/services/purchases.service';
import { SellersService } from '@api/marketplace/sellers/services/sellers.service';
import type { User } from '@clerk/backend';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const mockUser = { id: 'clerk-user' } as User;
const mockRequest = { headers: {}, url: '/test' } as unknown as Request;

const makeObjectId = (id: string) => ({
  toString: () => id,
});

describe('PurchasesController', () => {
  let controller: PurchasesController;
  let purchasesService: Record<string, ReturnType<typeof vi.fn>>;
  let checkoutService: Record<string, ReturnType<typeof vi.fn>>;
  let listingsService: Record<string, ReturnType<typeof vi.fn>>;
  let installService: Record<string, ReturnType<typeof vi.fn>>;
  let sellersService: Record<string, ReturnType<typeof vi.fn>>;

  const mockPurchase = {
    _id: makeObjectId('purchase-1'),
    listing: makeObjectId('listing-1'),
    status: 'completed',
  };

  const mockListing = {
    _id: makeObjectId('listing-1'),
    downloadData: { url: 'https://cdn.example.com/file.zip' },
    type: 'workflow',
  };

  const mockSeller = {
    _id: makeObjectId('seller-1'),
    badgeTier: 'gold',
    displayName: 'John Doe',
    payoutEnabled: true,
    slug: 'john-doe',
    status: 'active',
    stripeOnboardingComplete: true,
    totalEarnings: 1000,
    totalSales: 42,
  };

  beforeEach(async () => {
    purchasesService = {
      checkListingOwnership: vi
        .fn()
        .mockResolvedValue({ owned: true, purchase: mockPurchase }),
      claimFreeItem: vi.fn().mockResolvedValue(mockPurchase),
      getAdminAnalyticsOverview: vi
        .fn()
        .mockResolvedValue({ totalRevenue: 9999 }),
      getAdminPurchaseById: vi.fn().mockResolvedValue(mockPurchase),
      getAdminPurchases: vi.fn().mockResolvedValue([mockPurchase]),
      getBuyerPurchases: vi.fn().mockResolvedValue([mockPurchase]),
      getSellerAnalytics: vi
        .fn()
        .mockResolvedValue({ revenue: 500, sales: 10 }),
      getSellerSales: vi.fn().mockResolvedValue([mockPurchase]),
      trackDownload: vi.fn().mockResolvedValue(undefined),
      verifyOwnership: vi
        .fn()
        .mockResolvedValue({ owned: true, purchase: mockPurchase }),
    };
    checkoutService = {
      createCheckoutSession: vi.fn().mockResolvedValue({
        purchase: mockPurchase,
        sessionId: 'sess_123',
        url: 'https://stripe.com/checkout/sess_123',
      }),
      getCheckoutSession: vi.fn().mockResolvedValue({
        amount_total: 4900,
        currency: 'usd',
        payment_status: 'paid',
        status: 'complete',
      }),
    };
    listingsService = {
      findOne: vi.fn().mockResolvedValue(mockListing),
      incrementInstallCount: vi.fn().mockResolvedValue(undefined),
    };
    installService = {
      installToWorkspace: vi.fn().mockResolvedValue({
        resourceId: 'resource-1',
        resourceType: 'workflow',
        title: 'Cool Workflow',
      }),
    };
    sellersService = {
      findByUserId: vi.fn().mockResolvedValue(mockSeller),
      getAdminPayouts: vi.fn().mockResolvedValue([mockSeller]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        PurchasesController,
        AdminMarketplacePurchasesController,
        AdminMarketplaceController,
      ],
      providers: [
        { provide: PurchasesService, useValue: purchasesService },
        { provide: CheckoutService, useValue: checkoutService },
        { provide: ListingsService, useValue: listingsService },
        { provide: InstallService, useValue: installService },
        { provide: SellersService, useValue: sellersService },
      ],
    }).compile();

    controller = module.get<PurchasesController>(PurchasesController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── createCheckoutSession ──────────────────────────────────────────────

  describe('createCheckoutSession', () => {
    it('returns sessionId, url, and purchaseId', async () => {
      const reqWithOrigin = {
        ...mockRequest,
        headers: { origin: 'https://marketplace.genfeed.ai' },
      } as unknown as Request;

      const result = await controller.createCheckoutSession(
        reqWithOrigin,
        'listing-1',
        {
          cancelUrl: 'https://marketplace.genfeed.ai/cancel',
          successUrl: 'https://marketplace.genfeed.ai/success',
        },
        mockUser,
      );

      expect(result.data.attributes.sessionId).toBe('sess_123');
      expect(result.data.attributes.url).toContain('stripe.com');
    });

    it('uses origin header as URL base when no successUrl provided', async () => {
      const req = {
        ...mockRequest,
        headers: { origin: 'https://marketplace.genfeed.ai' },
      } as unknown as Request;
      await controller.createCheckoutSession(req, 'listing-1', {}, mockUser);
      expect(checkoutService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          successUrl: expect.stringContaining('marketplace.genfeed.ai'),
        }),
      );
    });
  });

  // ─── getCheckoutSession ─────────────────────────────────────────────────

  describe('getCheckoutSession', () => {
    it('returns session status and payment details', async () => {
      const result = await controller.getCheckoutSession('sess_123', mockUser);
      expect(result.data.attributes.paymentStatus).toBe('paid');
      expect(result.data.attributes.status).toBe('complete');
    });
  });

  // ─── claimFreeListing ───────────────────────────────────────────────────

  describe('claimFreeListing', () => {
    it('calls claimFreeItem with listingId and user metadata', async () => {
      await controller.claimFreeListing(mockRequest, 'listing-1', mockUser);
      expect(purchasesService.claimFreeItem).toHaveBeenCalledWith(
        'listing-1',
        'user-abc',
        'org-123',
      );
    });
  });

  // ─── getMyPurchases ─────────────────────────────────────────────────────

  describe('getMyPurchases', () => {
    it('calls getBuyerPurchases with user metadata', async () => {
      await controller.getMyPurchases(mockRequest, {}, mockUser);
      expect(purchasesService.getBuyerPurchases).toHaveBeenCalledWith(
        'user-abc',
        'org-123',
        {},
      );
    });
  });

  // ─── getPurchase ────────────────────────────────────────────────────────

  describe('getPurchase', () => {
    it('returns serialized purchase when owned', async () => {
      const result = await controller.getPurchase(
        mockRequest,
        'purchase-1',
        mockUser,
      );
      expect(result).toHaveProperty('data');
    });

    it('returns not-found response when not owned', async () => {
      purchasesService.verifyOwnership.mockResolvedValue({
        owned: false,
        purchase: null,
      });
      const result = await controller.getPurchase(
        mockRequest,
        'purchase-1',
        mockUser,
      );
      expect(result).toMatchObject({ data: null });
    });
  });

  // ─── getDownloadUrl ─────────────────────────────────────────────────────

  describe('getDownloadUrl', () => {
    it('calls trackDownload and returns download data', async () => {
      const result = await controller.getDownloadUrl('purchase-1', mockUser);
      expect(purchasesService.trackDownload).toHaveBeenCalledWith('purchase-1');
      expect(result.data.attributes.downloadData).toBeDefined();
    });

    it('returns not-found when listing is not found', async () => {
      listingsService.findOne.mockResolvedValue(null);
      const result = await controller.getDownloadUrl('purchase-1', mockUser);
      expect(result).toMatchObject({ data: null });
    });

    it('returns not-found when purchase not owned', async () => {
      purchasesService.verifyOwnership.mockResolvedValue({
        owned: false,
        purchase: null,
      });
      const result = await controller.getDownloadUrl('purchase-1', mockUser);
      expect(result).toMatchObject({ data: null });
    });
  });

  // ─── installToWorkspace ─────────────────────────────────────────────────

  describe('installToWorkspace', () => {
    it('calls installService.installToWorkspace with listing id', async () => {
      await controller.installToWorkspace('purchase-1', mockUser);
      expect(installService.installToWorkspace).toHaveBeenCalledWith(
        'listing-1',
        'user-abc',
        'org-123',
      );
    });

    it('increments install count on listing', async () => {
      await controller.installToWorkspace('purchase-1', mockUser);
      expect(listingsService.incrementInstallCount).toHaveBeenCalledWith(
        'listing-1',
      );
    });

    it('returns not-found when purchase not owned', async () => {
      purchasesService.verifyOwnership.mockResolvedValue({
        owned: false,
        purchase: null,
      });
      const result = await controller.installToWorkspace(
        'purchase-1',
        mockUser,
      );
      expect(result).toMatchObject({ data: null });
    });
  });

  // ─── checkOwnership ─────────────────────────────────────────────────────

  describe('checkOwnership', () => {
    it('returns owned: true when user owns the listing', async () => {
      const result = await controller.checkOwnership('listing-1', mockUser);
      expect(result.data.attributes.owned).toBe(true);
    });

    it('returns owned: false when user does not own the listing', async () => {
      purchasesService.checkListingOwnership.mockResolvedValue({
        owned: false,
        purchase: null,
      });
      const result = await controller.checkOwnership('listing-1', mockUser);
      expect(result.data.attributes.owned).toBe(false);
    });
  });

  // ─── getSellerOverview ──────────────────────────────────────────────────

  describe('getSellerOverview', () => {
    it('returns seller profile and analytics', async () => {
      const result = await controller.getSellerOverview(mockUser);
      expect(result.data.attributes.seller.displayName).toBe('John Doe');
      expect(result.data.attributes.analytics).toBeDefined();
    });

    it('throws NotFoundException when seller profile not found', async () => {
      sellersService.findByUserId.mockResolvedValue(null);
      await expect(controller.getSellerOverview(mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getSellerSales ─────────────────────────────────────────────────────

  describe('getSellerSales', () => {
    it('throws NotFoundException when seller not found', async () => {
      sellersService.findByUserId.mockResolvedValue(null);
      await expect(
        controller.getSellerSales(mockRequest, {}, mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
