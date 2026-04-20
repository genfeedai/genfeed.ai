import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { CreditProvisionDto } from '@api/endpoints/integrations/shopify/dto/credit-provision.dto';
import { ShopifyInstallDto } from '@api/endpoints/integrations/shopify/dto/shopify-install.dto';
import {
  CreditProvisionController,
  ShopifyController,
} from '@api/endpoints/integrations/shopify/shopify.controller';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { CombinedAuthGuard } from '@api/helpers/guards/combined-auth/combined-auth.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ShopifyController', () => {
  let controller: ShopifyController;
  let apiKeysService: vi.Mocked<ApiKeysService>;
  let brandsService: vi.Mocked<BrandsService>;
  let organizationsService: vi.Mocked<OrganizationsService>;
  let usersService: vi.Mocked<UsersService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShopifyController],
      providers: [
        {
          provide: ApiKeysService,
          useValue: {
            createWithKey: vi.fn(),
          },
        },
        {
          provide: BrandsService,
          useValue: {
            create: vi.fn(),
          },
        },
        {
          provide: CreditsUtilsService,
          useValue: {},
        },
        {
          provide: OrganizationsService,
          useValue: {
            create: vi.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            create: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(AdminApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ShopifyController>(ShopifyController);
    apiKeysService = module.get(ApiKeysService);
    brandsService = module.get(BrandsService);
    organizationsService = module.get(OrganizationsService);
    usersService = module.get(UsersService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('provisionShopifyAccount', () => {
    it('should provision a complete Shopify account', async () => {
      const dto: ShopifyInstallDto = {
        shopDomain: 'test-shop.myshopify.com',
        shopifyUserId: 'shop_user_123',
      };

      const mockOrg = {
        _id: '507f191e810c19729de860ee',
        name: 'test-shop',
      };
      const mockUser = {
        _id: '507f191e810c19729de860ee',
        email: 'shop@test-shop.myshopify.com',
      };
      const mockBrand = {
        _id: '507f191e810c19729de860ee',
        name: 'test-shop',
      };
      const mockApiKey = {
        apiKey: { _id: '507f191e810c19729de860ee' },
        plainKey: 'gf_sk_test_key_123',
      };

      organizationsService.create.mockResolvedValue(mockOrg as never);
      usersService.create.mockResolvedValue(mockUser as never);
      brandsService.create.mockResolvedValue(mockBrand as never);
      apiKeysService.createWithKey.mockResolvedValue(mockApiKey as never);

      const result = await controller.provisionShopifyAccount(dto);

      expect(organizationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            shopDomain: 'test-shop.myshopify.com',
            shopifyUserId: 'shop_user_123',
            source: 'shopify',
          }),
          name: 'test-shop',
        }),
      );

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'shop@test-shop.myshopify.com',
          metadata: expect.objectContaining({
            shopDomain: 'test-shop.myshopify.com',
            source: 'shopify',
          }),
          name: 'test-shop',
          organization: mockOrg._id,
        }),
      );

      expect(brandsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            shopDomain: 'test-shop.myshopify.com',
            source: 'shopify',
          }),
          name: 'test-shop',
          organization: mockOrg._id,
          user: mockUser._id,
        }),
      );

      expect(apiKeysService.createWithKey).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: mockBrand._id,
          description: 'Auto-provisioned API key for Shopify integration',
          metadata: expect.objectContaining({
            shopDomain: 'test-shop.myshopify.com',
            source: 'shopify',
          }),
          name: 'Shopify - test-shop.myshopify.com',
          organization: mockOrg._id,
          rateLimit: 100,
          scopes: expect.arrayContaining([
            'images:read',
            'images:create',
            'videos:read',
            'videos:create',
            'credits:read',
            'posts:create',
          ]),
          user: mockUser._id,
        }),
      );

      expect(result).toEqual({
        apiKey: 'gf_sk_test_key_123',
        brandId: mockBrand._id.toString(),
        orgId: mockOrg._id.toString(),
        userId: mockUser._id.toString(),
      });

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('ShopifyController'),
        expect.objectContaining({ shopDomain: 'test-shop.myshopify.com' }),
      );
    });

    it('should handle shop domain formatting correctly', async () => {
      const dto: ShopifyInstallDto = {
        shopDomain: 'my-awesome-store.myshopify.com',
        shopifyUserId: 'shop_456',
      };

      const mockOrg = {
        _id: '507f191e810c19729de860ee',
        name: 'my-awesome-store',
      };
      const mockUser = { _id: '507f191e810c19729de860ee' };
      const mockBrand = { _id: '507f191e810c19729de860ee' };
      const mockApiKey = {
        apiKey: { _id: '507f191e810c19729de860ee' },
        plainKey: 'gf_sk_key',
      };

      organizationsService.create.mockResolvedValue(mockOrg as never);
      usersService.create.mockResolvedValue(mockUser as never);
      brandsService.create.mockResolvedValue(mockBrand as never);
      apiKeysService.createWithKey.mockResolvedValue(mockApiKey as never);

      await controller.provisionShopifyAccount(dto);

      expect(organizationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'my-awesome-store',
        }),
      );

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'shop@my-awesome-store.myshopify.com',
          name: 'my-awesome-store',
        }),
      );
    });

    it('should log account provisioning success', async () => {
      const dto: ShopifyInstallDto = {
        shopDomain: 'success-shop.myshopify.com',
        shopifyUserId: 'shop_789',
      };

      const mockOrg = { _id: '507f191e810c19729de860ee' };
      const mockUser = { _id: '507f191e810c19729de860ee' };
      const mockBrand = { _id: '507f191e810c19729de860ee' };
      const mockApiKey = {
        apiKey: { _id: '507f191e810c19729de860ee' },
        plainKey: 'gf_sk_success',
      };

      organizationsService.create.mockResolvedValue(mockOrg as never);
      usersService.create.mockResolvedValue(mockUser as never);
      brandsService.create.mockResolvedValue(mockBrand as never);
      apiKeysService.createWithKey.mockResolvedValue(mockApiKey as never);

      await controller.provisionShopifyAccount(dto);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Account provisioned successfully'),
        expect.objectContaining({
          apiKeyId: mockApiKey.apiKey._id,
          brandId: mockBrand._id,
          organizationId: mockOrg._id,
          shopDomain: 'success-shop.myshopify.com',
          userId: mockUser._id,
        }),
      );
    });
  });
});

describe('CreditProvisionController', () => {
  let controller: CreditProvisionController;
  let creditsUtilsService: vi.Mocked<CreditsUtilsService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockRequest = {
    publicMetadata: {
      organization: 'org_123',
    },
  } as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreditProvisionController],
      providers: [
        {
          provide: CreditsUtilsService,
          useValue: {
            addOrganizationCreditsWithExpiration: vi.fn(),
            getOrganizationCreditsBalance: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(CombinedAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CreditProvisionController>(
      CreditProvisionController,
    );
    creditsUtilsService = module.get(CreditsUtilsService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('provisionCredits', () => {
    it('should provision credits with default expiration', async () => {
      const dto: CreditProvisionDto = {
        amount: 1000,
        planId: 'pro-plan',
        source: 'shopify',
      };

      creditsUtilsService.addOrganizationCreditsWithExpiration.mockResolvedValue(
        undefined,
      );
      creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(2500);

      const result = await controller.provisionCredits(mockRequest, dto);

      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith(
        'org_123',
        1000,
        'shopify',
        'pro-plan plan subscription - 1000 credits',
        expect.any(Date),
      );

      expect(
        creditsUtilsService.getOrganizationCreditsBalance,
      ).toHaveBeenCalledWith('org_123');

      expect(result).toEqual({
        creditsAdded: 1000,
        newBalance: 2500,
      });
    });

    it('should provision credits with custom expiration', async () => {
      const customExpiry = new Date('2026-12-31');
      const dto: CreditProvisionDto = {
        amount: 500,
        expiresAt: customExpiry.toISOString(),
        planId: 'starter-plan',
        source: 'stripe',
      };

      creditsUtilsService.addOrganizationCreditsWithExpiration.mockResolvedValue(
        undefined,
      );
      creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(1500);

      const result = await controller.provisionCredits(mockRequest, dto);

      const callArgs =
        creditsUtilsService.addOrganizationCreditsWithExpiration.mock.calls[0];
      const expirationDate = callArgs[4] as Date;

      expect(expirationDate.toISOString()).toBe(customExpiry.toISOString());

      expect(result).toEqual({
        creditsAdded: 500,
        newBalance: 1500,
      });
    });

    it('should log credit provisioning details', async () => {
      const dto: CreditProvisionDto = {
        amount: 2000,
        planId: 'enterprise-plan',
        source: 'manual',
      };

      creditsUtilsService.addOrganizationCreditsWithExpiration.mockResolvedValue(
        undefined,
      );
      creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(5000);

      await controller.provisionCredits(mockRequest, dto);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('CreditProvisionController'),
        expect.objectContaining({
          amount: 2000,
          organization: 'org_123',
          planId: 'enterprise-plan',
          source: 'manual',
        }),
      );

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Credits provisioned successfully'),
        expect.objectContaining({
          creditsAdded: 2000,
          newBalance: 5000,
          organization: 'org_123',
        }),
      );
    });

    it('should calculate 30-day default expiration correctly', async () => {
      const dto: CreditProvisionDto = {
        amount: 100,
        planId: 'test-plan',
        source: 'test',
      };

      creditsUtilsService.addOrganizationCreditsWithExpiration.mockResolvedValue(
        undefined,
      );
      creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(100);

      await controller.provisionCredits(mockRequest, dto);

      const callArgs =
        creditsUtilsService.addOrganizationCreditsWithExpiration.mock.calls[0];
      const expirationDate = callArgs[4] as Date;
      const now = new Date();
      const thirtyDaysFromNow = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000,
      );

      // Allow 1 minute tolerance for test execution time
      const timeDiff = Math.abs(
        expirationDate.getTime() - thirtyDaysFromNow.getTime(),
      );
      expect(timeDiff).toBeLessThan(60 * 1000);
    });
  });
});
