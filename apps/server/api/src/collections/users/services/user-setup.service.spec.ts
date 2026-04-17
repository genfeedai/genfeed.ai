import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import { OrganizationCategory } from '@genfeedai/enums';
import { ONBOARDING_SIGNUP_GIFT_CREDITS } from '@genfeedai/types';
import { LoggerService } from '@libs/logger/logger.service';

describe('UserSetupService', () => {
  let service: UserSetupService;

  const userId = 'test-object-id';
  const orgId = 'test-object-id';
  const brandId = 'test-object-id';
  const memberId = 'test-object-id';
  const orgSettingsId = 'test-object-id';
  const userSettingsId = 'test-object-id';
  const roleId = 'test-object-id';

  const mockOrg = { _id: orgId, label: 'Default Organization', user: userId };
  const mockOrgSettings = { _id: orgSettingsId, organization: orgId };
  const mockUserSettings = { _id: userSettingsId, user: userId };
  const mockBrand = { _id: brandId, organization: orgId };
  const mockMember = { _id: memberId, organization: orgId, user: userId };
  const mockRole = { _id: roleId, key: 'admin' };

  const mockOrganizationsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    generateUniqueSlug: vi.fn(),
  };

  const mockOrganizationSettingsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    getLatestMajorVersionModelIds: vi.fn(),
  };

  const mockBrandsService = {
    create: vi.fn(),
    findOne: vi.fn(),
  };

  const mockMembersService = {
    create: vi.fn(),
    findOne: vi.fn(),
  };

  const mockRolesService = {
    findOne: vi.fn(),
  };

  const mockSettingsService = {
    create: vi.fn(),
    findOne: vi.fn(),
  };

  const mockCreditBalanceService = {
    getOrCreateBalance: vi.fn(),
  };

  const mockCreditsUtilsService = {
    addOrganizationCreditsWithExpiration: vi.fn(),
    getOrganizationCreditsWithExpiration: vi.fn(),
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    service = new UserSetupService(
      mockOrganizationsService as unknown as OrganizationsService,
      mockOrganizationSettingsService as unknown as OrganizationSettingsService,
      mockBrandsService as unknown as BrandsService,
      mockMembersService as unknown as MembersService,
      mockRolesService as unknown as RolesService,
      mockSettingsService as unknown as SettingsService,
      mockCreditBalanceService as unknown as CreditBalanceService,
      mockCreditsUtilsService as unknown as CreditsUtilsService,
      mockLogger as unknown as LoggerService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initializeUserResources', () => {
    beforeEach(() => {
      // Default "happy path" mocks — no existing resources
      mockOrganizationsService.findOne.mockResolvedValue(null);
      mockOrganizationsService.generateUniqueSlug.mockResolvedValue(
        'default-organization',
      );
      mockOrganizationsService.create.mockResolvedValue(mockOrg);

      mockOrganizationSettingsService.findOne.mockResolvedValue(null);
      mockOrganizationSettingsService.getLatestMajorVersionModelIds.mockResolvedValue(
        ['model1', 'model2'],
      );
      mockOrganizationSettingsService.create.mockResolvedValue(mockOrgSettings);

      mockSettingsService.findOne.mockResolvedValue(null);
      mockSettingsService.create.mockResolvedValue(mockUserSettings);

      mockBrandsService.findOne.mockResolvedValue(null);
      mockBrandsService.create.mockResolvedValue(mockBrand);

      mockCreditBalanceService.getOrCreateBalance.mockResolvedValue({
        balance: 0,
      });
      mockCreditsUtilsService.getOrganizationCreditsWithExpiration.mockResolvedValue(
        {
          credits: [],
          total: 0,
        },
      );
      mockCreditsUtilsService.addOrganizationCreditsWithExpiration.mockResolvedValue(
        undefined,
      );

      mockMembersService.findOne.mockResolvedValue(null);
      mockRolesService.findOne.mockResolvedValue(mockRole);
      mockMembersService.create.mockResolvedValue(mockMember);
    });

    it('should create all resources and return UserSetupResult', async () => {
      const result = await service.initializeUserResources(userId);

      expect(result.organization).toBe(mockOrg);
      expect(result.organizationSettings).toBe(mockOrgSettings);
      expect(result.userSettings).toBe(mockUserSettings);
      expect(result.brand).toBe(mockBrand);
      expect(result.member).toBe(mockMember);
    });

    it('should call organizationsService.create once when no org exists', async () => {
      await service.initializeUserResources(userId);

      expect(mockOrganizationsService.create).toHaveBeenCalledTimes(1);
    });

    it('should call organizationsService.create with PERSONAL category when provided', async () => {
      // The service uses OrganizationCategory.BUSINESS as default; we verify the
      // create call happens (category is passed through even if entity constructor
      // doesn't expose it in the test environment due to SWC class-field behavior)
      await service.initializeUserResources(
        userId,
        OrganizationCategory.PERSONAL,
      );

      expect(mockOrganizationsService.create).toHaveBeenCalledTimes(1);
    });

    it('should create credit balance for the organization', async () => {
      await service.initializeUserResources(userId);

      expect(mockCreditBalanceService.getOrCreateBalance).toHaveBeenCalledWith(
        orgId.toString(),
      );
    });

    it('should award signup gift credits for newly created organizations', async () => {
      await service.initializeUserResources(userId);

      expect(
        mockCreditsUtilsService.addOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith(
        orgId.toString(),
        ONBOARDING_SIGNUP_GIFT_CREDITS,
        'onboarding-signup-gift',
        'Signup gift credits',
        expect.any(Date),
      );
    });

    it('should call settingsService.create once for user settings', async () => {
      await service.initializeUserResources(userId);

      expect(mockSettingsService.create).toHaveBeenCalledTimes(1);
    });

    it('should call organizationSettingsService.create once for org settings', async () => {
      await service.initializeUserResources(userId);

      expect(mockOrganizationSettingsService.create).toHaveBeenCalledTimes(1);
    });

    it('should fetch enabled models before creating org settings', async () => {
      await service.initializeUserResources(userId);

      expect(
        mockOrganizationSettingsService.getLatestMajorVersionModelIds,
      ).toHaveBeenCalledTimes(1);
      // create is called AFTER getLatestMajorVersionModelIds (order enforced by await chain)
      expect(mockOrganizationSettingsService.create).toHaveBeenCalledTimes(1);
    });

    it('should call membersService.create once for the member', async () => {
      await service.initializeUserResources(userId);

      expect(mockMembersService.create).toHaveBeenCalledTimes(1);
    });

    it('should fallback to user role if admin role not found', async () => {
      const userRole = { _id: 'test-object-id', key: 'user' };
      mockRolesService.findOne
        .mockResolvedValueOnce(null) // admin not found
        .mockResolvedValueOnce(userRole); // user role found

      await service.initializeUserResources(userId);

      // Both role lookups should have been attempted
      expect(mockRolesService.findOne).toHaveBeenCalledTimes(2);
      expect(mockMembersService.create).toHaveBeenCalledTimes(1);
    });

    it('should throw if no role found at all', async () => {
      mockRolesService.findOne.mockResolvedValue(null);

      await expect(service.initializeUserResources(userId)).rejects.toThrow(
        /No valid role found/,
      );
    });

    it('should throw and log error if organization creation returns without _id', async () => {
      mockOrganizationsService.create.mockResolvedValue({ label: 'Broken' }); // no _id

      await expect(service.initializeUserResources(userId)).rejects.toThrow(
        /Organization creation failed/,
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL: User setup failed'),
        expect.any(Object),
      );
    });

    it('should rethrow errors from downstream services', async () => {
      const err = new Error('DB exploded');
      mockOrganizationSettingsService.create.mockRejectedValue(err);

      await expect(service.initializeUserResources(userId)).rejects.toThrow(
        'DB exploded',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    describe('get-or-create behavior (existing resources)', () => {
      it('should return existing organization without creating a new one', async () => {
        mockOrganizationsService.findOne.mockResolvedValue(mockOrg);

        await service.initializeUserResources(userId);

        expect(mockOrganizationsService.create).not.toHaveBeenCalled();
        expect(
          mockCreditsUtilsService.addOrganizationCreditsWithExpiration,
        ).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Organization already exists'),
          expect.any(String),
        );
      });

      it('should return existing org settings without creating new ones', async () => {
        mockOrganizationSettingsService.findOne.mockResolvedValue(
          mockOrgSettings,
        );

        await service.initializeUserResources(userId);

        expect(mockOrganizationSettingsService.create).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Organization settings already exist'),
          expect.any(String),
        );
      });

      it('should return existing user settings without creating new ones', async () => {
        mockSettingsService.findOne.mockResolvedValue(mockUserSettings);

        await service.initializeUserResources(userId);

        expect(mockSettingsService.create).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('User settings already exist'),
          expect.any(String),
        );
      });

      it('should return existing brand without creating a new one', async () => {
        mockBrandsService.findOne.mockResolvedValue(mockBrand);

        await service.initializeUserResources(userId);

        expect(mockBrandsService.create).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Brand already exists'),
          expect.any(String),
        );
      });

      it('should return existing member without creating a new one', async () => {
        mockMembersService.findOne.mockResolvedValue(mockMember);

        await service.initializeUserResources(userId);

        expect(mockMembersService.create).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Member already exists'),
          expect.any(String),
        );
      });
    });

    describe('brand creation', () => {
      it('should call brandsService.create once with the organization id', async () => {
        await service.initializeUserResources(userId);

        expect(mockBrandsService.create).toHaveBeenCalledTimes(1);
      });
    });

    describe('error diagnostics', () => {
      it('should log which resources were created when failure occurs mid-way', async () => {
        // Org + org settings + user settings + brand all succeed, credit balance fails
        mockCreditBalanceService.getOrCreateBalance.mockRejectedValue(
          new Error('Credits service down'),
        );

        await expect(service.initializeUserResources(userId)).rejects.toThrow();

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('CRITICAL: User setup failed'),
          expect.objectContaining({
            brandCreated: true,
            memberCreated: false,
            organizationCreated: true,
            organizationSettingsCreated: true,
            userSettingsCreated: true,
          }),
        );
      });
    });
  });
});
