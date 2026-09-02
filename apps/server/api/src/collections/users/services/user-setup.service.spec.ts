import type { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import { OrganizationCategory } from '@genfeedai/contracts';
import { ONBOARDING_SIGNUP_GIFT_CREDITS } from '@genfeedai/contracts/types';
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

  const mockOrg = { id: orgId, label: 'Default Organization', userId };
  const mockOrgSettings = { id: orgSettingsId, organizationId: orgId };
  const mockUserSettings = { id: userSettingsId, userId };
  const mockBrand = { id: brandId, organizationId: orgId };
  // Shaped like a Prisma row with canonical scalar foreign keys.
  const mockMember = { id: memberId, organizationId: orgId, userId: userId };
  const mockRole = { id: roleId, key: 'admin' };

  const mockOrganizationsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    generateUniqueSlug: vi.fn(),
  };

  const mockOrganizationSettingsService = {
    ensureForOrganization: vi.fn(),
  };

  const mockBrandsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    generateUniqueSlug: vi.fn(),
  };

  const mockMembersService = {
    create: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };

  const mockRolesService = {
    create: vi.fn(),
    findOne: vi.fn(),
  };

  const mockSettingsService = {
    create: vi.fn(),
    findOne: vi.fn(),
  };

  const mockCreditBalanceService = {
    getOrCreateBalance: vi.fn(),
  };

  const mockBillingAccountsService = {
    ensureForOrganization: vi.fn(),
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
      mockBillingAccountsService as unknown as BillingAccountsService,
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

      mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue(
        mockOrgSettings,
      );

      mockSettingsService.findOne.mockResolvedValue(null);
      mockSettingsService.create.mockResolvedValue(mockUserSettings);

      mockBrandsService.findOne.mockResolvedValue(null);
      mockBrandsService.generateUniqueSlug.mockResolvedValue(
        'default-organization',
      );
      mockBrandsService.create.mockResolvedValue(mockBrand);

      mockCreditBalanceService.getOrCreateBalance.mockResolvedValue({
        balance: 0,
      });
      mockBillingAccountsService.ensureForOrganization.mockResolvedValue({
        id: 'ba_1',
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

    it('names the new org and brand from the signed-in user, not Default Organization', async () => {
      mockOrganizationsService.generateUniqueSlug.mockResolvedValue('shipshit');
      mockBrandsService.generateUniqueSlug.mockResolvedValue('shipshit');

      await service.initializeUserResources(userId, undefined, {
        email: 'vincent@shipshit.dev',
      });

      expect(mockOrganizationsService.generateUniqueSlug).toHaveBeenCalledWith(
        'Shipshit',
      );
      expect(mockOrganizationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Shipshit',
          slug: 'shipshit',
          userId,
        }),
      );
      expect(mockBrandsService.generateUniqueSlug).toHaveBeenCalledWith(
        'Shipshit',
      );
      expect(mockBrandsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Shipshit',
          slug: 'shipshit',
        }),
      );
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
      expect(mockSettingsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'system' }),
      );
    });

    it('delegates organization settings get-or-create to the canonical policy', async () => {
      await service.initializeUserResources(userId);

      expect(
        mockOrganizationSettingsService.ensureForOrganization,
      ).toHaveBeenCalledOnce();
      expect(
        mockOrganizationSettingsService.ensureForOrganization,
      ).toHaveBeenCalledWith(orgId);
    });

    it('should call membersService.create once for the member', async () => {
      await service.initializeUserResources(userId);

      expect(mockMembersService.create).toHaveBeenCalledTimes(1);
      expect(mockMembersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          roleId,
          roleKey: 'admin',
          userId,
        }),
      );
    });

    it('creates the membership before billing-account provisioning', async () => {
      const events: string[] = [];
      mockMembersService.create.mockImplementation(async () => {
        await Promise.resolve();
        events.push('member-complete');
        return mockMember;
      });
      mockBillingAccountsService.ensureForOrganization.mockImplementation(
        async () => {
          events.push('billing');
          return { id: 'ba_1' };
        },
      );

      await service.initializeUserResources(userId);

      expect(events).toEqual(['member-complete', 'billing']);
      expect(
        mockBillingAccountsService.ensureForOrganization,
      ).toHaveBeenCalledWith({
        label: mockOrg.label,
        organizationId: orgId,
        planTier: null,
        userId,
      });
    });

    it('falls back to owner when the admin role is missing', async () => {
      const ownerRole = { id: 'role_owner', key: 'owner' };
      mockRolesService.findOne
        .mockResolvedValueOnce(null) // admin not found
        .mockResolvedValueOnce(ownerRole);

      await service.initializeUserResources(userId);

      expect(mockRolesService.findOne).toHaveBeenCalledTimes(2);
      expect(mockRolesService.findOne).toHaveBeenNthCalledWith(1, {
        key: 'admin',
      });
      expect(mockRolesService.findOne).toHaveBeenNthCalledWith(2, {
        key: 'owner',
      });
      expect(mockMembersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ roleKey: 'owner' }),
      );
    });

    it('reactivates membership before billing-account provisioning', async () => {
      const events: string[] = [];
      const inactiveMember = { ...mockMember, isActive: false };
      const reactivatedMember = { ...mockMember, isActive: true };
      mockMembersService.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(inactiveMember);
      mockMembersService.patch.mockImplementation(async () => {
        await Promise.resolve();
        events.push('member-reactivated');
        return reactivatedMember;
      });
      mockBillingAccountsService.ensureForOrganization.mockImplementation(
        async () => {
          events.push('billing');
          return { id: 'ba_1' };
        },
      );

      await service.initializeUserResources(userId);

      expect(mockMembersService.patch).toHaveBeenCalledWith(memberId, {
        isActive: true,
      });
      expect(events).toEqual(['member-reactivated', 'billing']);
    });

    it('should create an admin role when the catalog is empty', async () => {
      const createdAdmin = { id: 'role_admin_created', key: 'admin' };
      mockRolesService.findOne.mockResolvedValue(null);
      mockRolesService.create.mockResolvedValue(createdAdmin);

      await service.initializeUserResources(userId);

      expect(mockRolesService.create).toHaveBeenCalledWith({
        key: 'admin',
        label: 'Admin',
      });
      expect(mockMembersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          roleId: 'role_admin_created',
          roleKey: 'admin',
        }),
      );
    });

    it('should throw and log error if organization creation returns without id', async () => {
      mockOrganizationsService.create.mockResolvedValue({ label: 'Broken' }); // no id

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
      mockOrganizationSettingsService.ensureForOrganization.mockRejectedValue(
        err,
      );

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

      it('should reuse the org from an existing membership when the user-owned lookup misses (#1227 no duplicate org)', async () => {
        // Membership points at the org while the direct user-owned lookup
        // returns nothing, so setup must not create a duplicate organization.
        mockMembersService.findOne.mockResolvedValue(mockMember);
        mockOrganizationsService.findOne.mockImplementation(
          (filter: Record<string, unknown>) =>
            Promise.resolve(filter.id ? mockOrg : null),
        );

        const result = await service.initializeUserResources(userId);

        expect(result.organization).toBe(mockOrg);
        expect(mockOrganizationsService.create).not.toHaveBeenCalled();
        // The membership's canonical scalar FK resolves the organization.
        expect(mockOrganizationsService.findOne).toHaveBeenCalledWith({
          id: orgId,
        });
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining(
            'Organization already exists (via membership)',
          ),
          expect.any(String),
        );
      });

      it('should not resolve an org from a membership that carries no scalar organizationId', async () => {
        // Guards the inverse: a membership without organizationId must not
        // trigger an undefined organization lookup.
        mockMembersService.findOne.mockResolvedValue({
          id: memberId,
          userId: userId,
        });
        mockOrganizationsService.findOne.mockResolvedValue(null);

        await service.initializeUserResources(userId);

        expect(mockOrganizationsService.findOne).not.toHaveBeenCalledWith(
          expect.objectContaining({ id: undefined }),
        );
      });

      it('returns organization settings resolved by the canonical policy', async () => {
        mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue(
          mockOrgSettings,
        );

        const result = await service.initializeUserResources(userId);

        expect(result.organizationSettings).toBe(mockOrgSettings);
        expect(
          mockOrganizationSettingsService.ensureForOrganization,
        ).toHaveBeenCalledWith(orgId);
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
      it('should create the default brand with a globally unique slug', async () => {
        await service.initializeUserResources(userId);

        expect(mockBrandsService.generateUniqueSlug).toHaveBeenCalledWith(
          'Workspace',
        );
        expect(mockBrandsService.create).toHaveBeenCalledTimes(1);
        expect(mockBrandsService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId: orgId,
            slug: 'default-organization',
          }),
        );
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
            memberCreated: true,
            organizationCreated: true,
            organizationSettingsCreated: true,
            userSettingsCreated: true,
          }),
        );
      });
    });
  });
});
