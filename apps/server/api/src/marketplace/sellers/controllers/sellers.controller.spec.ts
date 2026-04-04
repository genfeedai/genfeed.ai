vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => (target: unknown) => target,
}));
vi.mock('@api/helpers/decorators/log/log-method.decorator', () => ({
  LogMethod: () => () => undefined,
}));
vi.mock('@api/helpers/decorators/roles/roles.decorator', () => ({
  RolesDecorator: () => () => undefined,
}));
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
vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((_type: string, id: string) => ({
    errors: [{ detail: `${id} not found`, status: '404', title: 'Not Found' }],
  })),
  serializeCollection: vi.fn((_req: unknown, _ser: unknown, data: unknown) => ({
    data,
  })),
  serializeSingle: vi.fn((_req: unknown, _ser: unknown, data: unknown) => ({
    data,
  })),
}));
vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getIsSuperAdmin: vi.fn(() => false),
  getPublicMetadata: vi.fn(() => ({
    organization: 'org-test',
    user: 'user-test',
  })),
}));
vi.mock('@genfeedai/serializers', () => ({
  SellerSerializer: class {},
}));

import { ConfigService } from '@api/config/config.service';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  AdminSellersController,
  SellersController,
} from '@api/marketplace/sellers/controllers/sellers.controller';
import { SellersService } from '@api/marketplace/sellers/services/sellers.service';
import { StripeConnectService } from '@api/marketplace/sellers/services/stripe-connect.service';
import type { User } from '@clerk/backend';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('SellersController', () => {
  let controller: SellersController;
  let sellersService: {
    checkSellerEligibility: ReturnType<typeof vi.fn>;
    createSellerProfile: ReturnType<typeof vi.fn>;
    findBySlug: ReturnType<typeof vi.fn>;
    findByUserId: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let stripeConnectService: {
    checkOnboardingComplete: ReturnType<typeof vi.fn>;
    createConnectAccount: ReturnType<typeof vi.fn>;
    createDashboardLink: ReturnType<typeof vi.fn>;
    createOnboardingLink: ReturnType<typeof vi.fn>;
    getAccountBalance: ReturnType<typeof vi.fn>;
    listPayouts: ReturnType<typeof vi.fn>;
  };
  let configService: { get: ReturnType<typeof vi.fn> };

  const mockSellerId = new Types.ObjectId();
  const mockUser = {
    emailAddresses: [{ emailAddress: 'seller@test.com' }],
    id: 'user_test',
    publicMetadata: { organization: 'org-test', user: 'user-test' },
  } as unknown as User;
  const mockReq = {} as Request;

  const mockSeller = {
    _id: mockSellerId,
    displayName: 'Test Seller',
    stripeAccountId: null as string | null,
    stripeOnboardingComplete: false,
  };

  beforeEach(async () => {
    sellersService = {
      checkSellerEligibility: vi.fn(),
      createSellerProfile: vi.fn(),
      findBySlug: vi.fn(),
      findByUserId: vi.fn(),
      patch: vi.fn(),
    };

    stripeConnectService = {
      checkOnboardingComplete: vi.fn(),
      createConnectAccount: vi.fn(),
      createDashboardLink: vi.fn(),
      createOnboardingLink: vi.fn(),
      getAccountBalance: vi.fn(),
      listPayouts: vi.fn(),
    };

    configService = {
      get: vi.fn().mockReturnValue('https://app.genfeed.ai'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SellersController],
      providers: [
        { provide: SellersService, useValue: sellersService },
        { provide: StripeConnectService, useValue: stripeConnectService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    controller = module.get<SellersController>(SellersController);
    vi.clearAllMocks();

    // Re-stub after clearAllMocks
    (getPublicMetadata as ReturnType<typeof vi.fn>).mockReturnValue({
      organization: 'org-test',
      user: 'user-test',
    });
    configService.get.mockReturnValue('https://app.genfeed.ai');
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── checkEligibility ─────────────────────────────────────────────────────

  describe('checkEligibility', () => {
    it('should return eligibility data for the current user', async () => {
      const eligibility = { eligible: true, reason: null };
      sellersService.checkSellerEligibility.mockResolvedValue(eligibility);

      const result = await controller.checkEligibility(mockUser);

      expect(result).toEqual({
        data: {
          attributes: eligibility,
          id: 'user-test',
          type: 'seller-eligibility',
        },
      });
      expect(sellersService.checkSellerEligibility).toHaveBeenCalledWith(
        'user-test',
        'org-test',
      );
    });
  });

  // ─── getProfile ───────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('should return not found when seller does not exist', async () => {
      sellersService.findByUserId.mockResolvedValue(null);

      const result = await controller.getProfile(mockReq, mockUser);

      expect(returnNotFound).toHaveBeenCalledWith(
        'SellersController',
        'user-test',
      );
      expect(result).toBeDefined();
    });

    it('should serialize and return seller when found', async () => {
      sellersService.findByUserId.mockResolvedValue(mockSeller);

      const result = await controller.getProfile(mockReq, mockUser);

      expect(serializeSingle).toHaveBeenCalledWith(
        mockReq,
        expect.anything(),
        mockSeller,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── getOfficialProfile ───────────────────────────────────────────────────

  describe('getOfficialProfile', () => {
    it('should throw ForbiddenException when user is not superadmin', async () => {
      (getIsSuperAdmin as ReturnType<typeof vi.fn>).mockReturnValue(false);

      await expect(
        controller.getOfficialProfile(mockReq, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return official seller profile for superadmin', async () => {
      (getIsSuperAdmin as ReturnType<typeof vi.fn>).mockReturnValue(true);
      sellersService.findBySlug.mockResolvedValue(mockSeller);

      await controller.getOfficialProfile(mockReq, mockUser);

      expect(sellersService.findBySlug).toHaveBeenCalledWith(
        'genfeed-official',
      );
      expect(serializeSingle).toHaveBeenCalledWith(
        mockReq,
        expect.anything(),
        mockSeller,
      );
    });

    it('should return not found when official profile is missing', async () => {
      (getIsSuperAdmin as ReturnType<typeof vi.fn>).mockReturnValue(true);
      sellersService.findBySlug.mockResolvedValue(null);

      const result = await controller.getOfficialProfile(mockReq, mockUser);

      expect(returnNotFound).toHaveBeenCalledWith(
        'SellersController',
        'genfeed-official',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── createProfile ────────────────────────────────────────────────────────

  describe('createProfile', () => {
    it('should create and serialize a seller profile', async () => {
      sellersService.createSellerProfile.mockResolvedValue(mockSeller);

      const dto = { bio: 'A great seller', displayName: 'My Shop' };
      await controller.createProfile(mockReq, dto as never, mockUser);

      expect(sellersService.createSellerProfile).toHaveBeenCalledWith(
        'user-test',
        'org-test',
        dto,
      );
      expect(serializeSingle).toHaveBeenCalledWith(
        mockReq,
        expect.anything(),
        mockSeller,
      );
    });
  });

  // ─── updateProfile ────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('should return not found when seller does not exist', async () => {
      sellersService.findByUserId.mockResolvedValue(null);

      const result = await controller.updateProfile(
        mockReq,
        {} as never,
        mockUser,
      );

      expect(returnNotFound).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should patch and serialize seller when found', async () => {
      const updated = { ...mockSeller, displayName: 'Updated Name' };
      sellersService.findByUserId.mockResolvedValue(mockSeller);
      sellersService.patch.mockResolvedValue(updated);

      const dto = { displayName: 'Updated Name' };
      await controller.updateProfile(mockReq, dto as never, mockUser);

      expect(sellersService.patch).toHaveBeenCalledWith(mockSellerId, dto);
      expect(serializeSingle).toHaveBeenCalledWith(
        mockReq,
        expect.anything(),
        updated,
      );
    });
  });

  // ─── initiateStripeConnect ────────────────────────────────────────────────

  describe('initiateStripeConnect', () => {
    it('should throw NotFoundException when seller not found', async () => {
      sellersService.findByUserId.mockResolvedValue(null);

      await expect(controller.initiateStripeConnect(mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should create Stripe account when seller has none', async () => {
      sellersService.findByUserId.mockResolvedValue({
        ...mockSeller,
        stripeAccountId: null,
      });
      stripeConnectService.createConnectAccount.mockResolvedValue({
        id: 'acct_new',
      });
      stripeConnectService.createOnboardingLink.mockResolvedValue(
        'https://connect.stripe.com/link',
      );
      sellersService.patch.mockResolvedValue({});

      const result = await controller.initiateStripeConnect(mockUser);

      expect(stripeConnectService.createConnectAccount).toHaveBeenCalledWith(
        expect.objectContaining({ sellerId: mockSellerId.toString() }),
      );
      expect(sellersService.patch).toHaveBeenCalledWith(mockSellerId, {
        stripeAccountId: 'acct_new',
      });
      expect(result.data.attributes.url).toBe(
        'https://connect.stripe.com/link',
      );
    });

    it('should reuse existing Stripe account when seller already has one', async () => {
      sellersService.findByUserId.mockResolvedValue({
        ...mockSeller,
        stripeAccountId: 'acct_existing',
      });
      stripeConnectService.createOnboardingLink.mockResolvedValue(
        'https://connect.stripe.com/existing',
      );

      await controller.initiateStripeConnect(mockUser);

      expect(stripeConnectService.createConnectAccount).not.toHaveBeenCalled();
      expect(stripeConnectService.createOnboardingLink).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'acct_existing' }),
      );
    });
  });

  // ─── getStripeStatus ──────────────────────────────────────────────────────

  describe('getStripeStatus', () => {
    it('should throw NotFoundException when seller not found', async () => {
      sellersService.findByUserId.mockResolvedValue(null);

      await expect(controller.getStripeStatus(mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return incomplete status when no stripeAccountId', async () => {
      sellersService.findByUserId.mockResolvedValue({
        ...mockSeller,
        stripeAccountId: null,
      });

      const result = await controller.getStripeStatus(mockUser);

      expect(result.data.attributes).toEqual(
        expect.objectContaining({ complete: false, stripeAccountId: null }),
      );
      expect(
        stripeConnectService.checkOnboardingComplete,
      ).not.toHaveBeenCalled();
    });

    it('should update seller when onboarding completes', async () => {
      sellersService.findByUserId.mockResolvedValue({
        ...mockSeller,
        stripeAccountId: 'acct_123',
        stripeOnboardingComplete: false,
      });
      stripeConnectService.checkOnboardingComplete.mockResolvedValue({
        chargesEnabled: true,
        complete: true,
        payoutsEnabled: true,
      });
      sellersService.patch.mockResolvedValue({});

      await controller.getStripeStatus(mockUser);

      expect(sellersService.patch).toHaveBeenCalledWith(
        mockSellerId,
        expect.objectContaining({ stripeOnboardingComplete: true }),
      );
    });
  });
});

// ─── AdminSellersController ──────────────────────────────────────────────────

describe('AdminSellersController', () => {
  let controller: AdminSellersController;
  let sellersService: {
    getAdminSellerById: ReturnType<typeof vi.fn>;
    getAdminSellers: ReturnType<typeof vi.fn>;
    setSellerStatus: ReturnType<typeof vi.fn>;
  };

  const mockAdminUser = {
    id: 'admin_user',
    publicMetadata: {
      organization: 'org-admin',
      role: 'superadmin',
      user: 'admin-user-id',
    },
  } as unknown as User;
  const mockReq = {} as Request;

  beforeEach(async () => {
    sellersService = {
      getAdminSellerById: vi.fn(),
      getAdminSellers: vi.fn(),
      setSellerStatus: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminSellersController],
      providers: [{ provide: SellersService, useValue: sellersService }],
    }).compile();

    controller = module.get<AdminSellersController>(AdminSellersController);
    vi.clearAllMocks();

    (getPublicMetadata as ReturnType<typeof vi.fn>).mockReturnValue({
      organization: 'org-admin',
      user: 'admin-user-id',
    });
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSellers', () => {
    it('should call getAdminSellers and serialize collection', async () => {
      const sellers = [{ _id: new Types.ObjectId(), displayName: 'Seller A' }];
      sellersService.getAdminSellers.mockResolvedValue(sellers);

      const result = await controller.getSellers(
        mockReq,
        {} as never,
        mockAdminUser,
      );

      expect(sellersService.getAdminSellers).toHaveBeenCalledWith(
        'org-admin',
        {},
      );
      expect(result).toBeDefined();
    });
  });

  describe('getSeller', () => {
    it('should return not found when seller missing', async () => {
      sellersService.getAdminSellerById.mockResolvedValue(null);

      const result = await controller.getSeller(
        mockReq,
        'seller-123',
        mockAdminUser,
      );

      expect(returnNotFound).toHaveBeenCalledWith(
        'AdminSellersController',
        'seller-123',
      );
      expect(result).toBeDefined();
    });

    it('should serialize seller when found', async () => {
      const seller = { _id: new Types.ObjectId(), displayName: 'Found' };
      sellersService.getAdminSellerById.mockResolvedValue(seller);

      await controller.getSeller(mockReq, 'seller-456', mockAdminUser);

      expect(serializeSingle).toHaveBeenCalledWith(
        mockReq,
        expect.anything(),
        seller,
      );
    });
  });

  describe('updateSellerStatus', () => {
    it('should call setSellerStatus and serialize result', async () => {
      const updated = { _id: new Types.ObjectId(), status: 'approved' };
      sellersService.setSellerStatus.mockResolvedValue(updated);

      await controller.updateSellerStatus(
        mockReq,
        'seller-789',
        { status: 'approved' } as never,
        mockAdminUser,
      );

      expect(sellersService.setSellerStatus).toHaveBeenCalledWith(
        'org-admin',
        'seller-789',
        'approved',
      );
      expect(serializeSingle).toHaveBeenCalledWith(
        mockReq,
        expect.anything(),
        updated,
      );
    });
  });
});
