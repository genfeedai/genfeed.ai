let mockCloudMode = true;
vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();
  return {
    ...actual,
    isCloudDeployment: () => mockCloudMode,
  };
});

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { OrganizationLogoService } from '@api/collections/organizations/services/organization-logo.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { OrganizationsOperationsService } from '@api/collections/organizations/services/organizations-operations.service';
import type { RolesService } from '@api/collections/roles/services/roles.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { SubscriptionTier } from '@genfeedai/contracts';
import { SINGLE_ORGANIZATION_LIMIT } from '@genfeedai/pricing';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';

describe('OrganizationsOperationsService', () => {
  const brandsService = {
    create: vi.fn(),
    findOne: vi.fn(),
  };
  const membersService = {
    create: vi.fn(),
    findActiveForUserAccess: vi.fn(),
    findOne: vi.fn(),
    setCurrentBrand: vi.fn(),
  };
  const organizationSettingsService = {
    ensureForOrganization: vi.fn(),
    findOne: vi.fn(),
  };
  const organizationsService = {
    count: vi.fn(),
    create: vi.fn(),
    findOne: vi.fn(),
    generateUniqueSlug: vi.fn(),
  };
  const rolesService = { findOne: vi.fn() };
  const usersService = {
    findOne: vi.fn(),
    patch: vi.fn(),
  };
  const billingAccountsService = {
    ensureForOrganization: vi.fn().mockResolvedValue({ id: 'ba_new' }),
  };
  const userAccessCacheService = { invalidateAll: vi.fn() };
  const organizationLogoService = { resolveLogoUrls: vi.fn() };
  const eventEmitter = { emit: vi.fn() };
  const user = {
    brandId: 'brand_active',
    id: 'user_1',
    isSuperAdmin: false,
    organizationId: 'org_active',
    userId: 'user_1',
  } as User;
  const service = new OrganizationsOperationsService(
    billingAccountsService as unknown as BillingAccountsService,
    brandsService as unknown as BrandsService,
    membersService as unknown as MembersService,
    organizationSettingsService as unknown as OrganizationSettingsService,
    organizationsService as unknown as OrganizationsService,
    rolesService as unknown as RolesService,
    usersService as unknown as UsersService,
    userAccessCacheService as unknown as UserAccessCacheService,
    organizationLogoService as unknown as OrganizationLogoService,
    eventEmitter as unknown as EventEmitter2,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockCloudMode = true;
    organizationSettingsService.findOne.mockResolvedValue({
      subscriptionTier: SubscriptionTier.FREE,
    });
    organizationsService.count.mockResolvedValue(0);
    organizationsService.generateUniqueSlug.mockResolvedValue('new-org');
    organizationsService.create.mockResolvedValue({
      id: 'org_new',
      label: 'New Org',
      slug: 'new-org',
    });
    organizationSettingsService.ensureForOrganization.mockResolvedValue({
      id: 'settings_new',
    });
    brandsService.create.mockResolvedValue({
      id: 'brand_new',
      label: 'New Org',
    });
    rolesService.findOne.mockResolvedValue({ id: 'role_admin' });
    membersService.create.mockResolvedValue({ id: 'member_new' });
    membersService.setCurrentBrand.mockResolvedValue(undefined);
    usersService.findOne.mockResolvedValue({ id: 'user_1' });
    usersService.patch.mockResolvedValue({ id: 'user_1' });
    userAccessCacheService.invalidateAll.mockResolvedValue(undefined);
    organizationLogoService.resolveLogoUrls.mockResolvedValue(
      new Map([['org_a', 'https://cdn.test/logos/asset_1']]),
    );
  });

  describe('findMine', () => {
    it('deduplicates valid membership organizations and skips missing ids', async () => {
      membersService.findActiveForUserAccess.mockResolvedValue([
        { id: 'member_1', organizationId: 'org_a' },
        { id: 'member_2', organizationId: 'org_a' },
        { id: 'member_broken', organizationId: undefined },
      ]);
      organizationsService.findOne.mockResolvedValue({
        id: 'org_a',
        label: 'Org A',
        slug: 'org-a',
        userId: 'user_1',
      });
      brandsService.findOne.mockResolvedValue({
        id: 'brand_a',
        label: 'Brand A',
      });

      await expect(service.findMine(user)).resolves.toEqual([
        {
          brand: { id: 'brand_a', label: 'Brand A' },
          id: 'org_a',
          isActive: false,
          isOwner: true,
          label: 'Org A',
          logoUrl: 'https://cdn.test/logos/asset_1',
          slug: 'org-a',
        },
      ]);
      expect(organizationLogoService.resolveLogoUrls).toHaveBeenCalledWith([
        'org_a',
      ]);
      expect(organizationsService.findOne).toHaveBeenCalledOnce();
      expect(organizationsService.findOne).toHaveBeenCalledWith({
        id: 'org_a',
        isDeleted: false,
      });
    });

    it('rejects membership discovery when identity has no canonical user id', async () => {
      const missingIdentity = {
        ...user,
        id: undefined,
        userId: undefined,
      } as unknown as User;

      const error = await service
        .findMine(missingIdentity)
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(membersService.findActiveForUserAccess).not.toHaveBeenCalled();
    });
  });

  describe('canUserReadEntity', () => {
    const organization = (values: Record<string, unknown>) =>
      values as OrganizationDocument;

    it('allows an organization owner without a membership lookup', async () => {
      await expect(
        service.canUserReadEntity(
          user,
          organization({ id: 'org_other', userId: 'user_1' }),
        ),
      ).resolves.toBe(true);
      expect(membersService.findOne).not.toHaveBeenCalled();
    });

    it('allows an active member and denies a non-member', async () => {
      const otherOrganization = organization({
        id: 'org_other',
        userId: 'user_other',
      });
      membersService.findOne.mockResolvedValueOnce({ id: 'member_1' });
      await expect(
        service.canUserReadEntity(user, otherOrganization),
      ).resolves.toBe(true);

      membersService.findOne.mockResolvedValueOnce(null);
      await expect(
        service.canUserReadEntity(user, otherOrganization),
      ).resolves.toBe(false);
      expect(membersService.findOne).toHaveBeenLastCalledWith({
        isActive: true,
        organizationId: 'org_other',
        userId: 'user_1',
      });
    });

    it('allows a superadmin without exposing membership state', async () => {
      await expect(
        service.canUserReadEntity(
          { ...user, isSuperAdmin: true },
          organization({ id: 'org_other', userId: 'user_other' }),
        ),
      ).resolves.toBe(true);
      expect(membersService.findOne).not.toHaveBeenCalled();
    });
  });

  describe('createOrganization', () => {
    it('provisions an unsubscribed platform superadmin beyond the free organization limit', async () => {
      organizationsService.count.mockResolvedValue(SINGLE_ORGANIZATION_LIMIT);

      await expect(
        service.createOrganization(
          { label: 'Second Org' },
          {
            ...user,
            isSuperAdmin: true,
            stripeSubscriptionStatus: '',
            subscriptionTier: SubscriptionTier.FREE,
          },
        ),
      ).resolves.toEqual({
        brand: { id: 'brand_new', label: 'New Org' },
        organization: { id: 'org_new', label: 'New Org' },
      });
      expect(organizationsService.count).not.toHaveBeenCalled();
      expect(organizationsService.create).toHaveBeenCalledWith({
        isSelected: false,
        label: 'Second Org',
        slug: 'new-org',
        userId: 'user_1',
      });
      expect(membersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org_new',
          roleId: 'role_admin',
          userId: 'user_1',
        }),
      );
      expect(billingAccountsService.ensureForOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          isSeparateAccount: true,
          organizationId: 'org_new',
          planTier: SubscriptionTier.FREE,
          userId: 'user_1',
        }),
      );
      expect(userAccessCacheService.invalidateAll).toHaveBeenCalledWith(
        'user_1',
      );
    });

    it('enforces the cloud plan organization limit', async () => {
      organizationsService.count.mockResolvedValue(SINGLE_ORGANIZATION_LIMIT);

      await expect(
        service.createOrganization({ label: 'Second Org' }, user),
      ).rejects.toMatchObject({
        response: {
          code: 'PLAN_LIMIT_EXCEEDED',
          meta: {
            currentCount: SINGLE_ORGANIZATION_LIMIT,
            limit: SINGLE_ORGANIZATION_LIMIT,
            resource: 'organizations',
            upgradeTier: SubscriptionTier.SCALE,
          },
        },
        status: HttpStatus.FORBIDDEN,
      });
      expect(organizationsService.create).not.toHaveBeenCalled();
    });

    it.each([
      ['self-hosted', false, false],
      ['superadmin', true, true],
    ])(
      'bypasses the cloud limit for %s provisioning',
      async (_case, cloud, admin) => {
        mockCloudMode = cloud;
        organizationsService.count.mockResolvedValue(SINGLE_ORGANIZATION_LIMIT);

        await service.createOrganization(
          { label: 'New Org' },
          { ...user, isSuperAdmin: admin },
        );

        expect(organizationsService.count).not.toHaveBeenCalled();
        expect(organizationsService.create).toHaveBeenCalledOnce();
      },
    );

    it('falls back from admin to user role and provisions the full default workspace', async () => {
      rolesService.findOne.mockImplementation(async ({ key }) =>
        key === 'admin' ? null : { id: 'role_user' },
      );

      await expect(
        service.createOrganization(
          { description: 'Description', label: '  New Org  ' },
          user,
        ),
      ).resolves.toEqual({
        brand: { id: 'brand_new', label: 'New Org' },
        organization: { id: 'org_new', label: 'New Org' },
      });
      expect(rolesService.findOne).toHaveBeenNthCalledWith(1, { key: 'admin' });
      expect(rolesService.findOne).toHaveBeenNthCalledWith(2, { key: 'user' });
      expect(
        organizationSettingsService.ensureForOrganization,
      ).toHaveBeenCalledWith('org_new');
      expect(brandsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Description',
          label: 'New Org',
          organizationId: 'org_new',
          userId: 'user_1',
        }),
      );
      expect(membersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          currentBrandId: 'brand_new',
          organizationId: 'org_new',
          roleId: 'role_user',
          userId: 'user_1',
        }),
      );
      expect(usersService.patch).toHaveBeenCalledWith('user_1', {
        lastUsedOrganizationId: 'org_new',
      });
      expect(billingAccountsService.ensureForOrganization).toHaveBeenCalledWith(
        expect.objectContaining({ isSeparateAccount: false }),
      );
      expect(userAccessCacheService.invalidateAll).toHaveBeenCalledWith(
        'user_1',
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('organization.created', {
        brandId: 'brand_new',
        organizationId: 'org_new',
        userId: 'user_1',
      });
    });

    it('creates the default brand without placeholder copy when no description is given', async () => {
      await service.createOrganization({ label: 'New Org' }, user);

      const brandInput = brandsService.create.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(brandInput.description).toBeUndefined();
    });

    it('passes the typed website to the brand scan through the created event', async () => {
      await service.createOrganization(
        { label: 'New Org', websiteUrl: '  acme.com  ' },
        user,
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith('organization.created', {
        brandId: 'brand_new',
        organizationId: 'org_new',
        userId: 'user_1',
        websiteUrl: 'acme.com',
      });
    });
  });

  describe('switchOrganization', () => {
    it('denies a non-member without probing brands or organizations', async () => {
      membersService.findOne.mockResolvedValue(null);

      const error = await service
        .switchOrganization('org_other', user)
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(brandsService.findOne).not.toHaveBeenCalled();
      expect(organizationsService.findOne).not.toHaveBeenCalled();
    });

    it('falls back from the last-used brand and persists both pointers before invalidating access', async () => {
      membersService.findOne.mockResolvedValue({
        id: 'member_1',
        currentBrandId: 'brand_stale',
      });
      brandsService.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'brand_live', label: 'Live Brand' });
      organizationsService.findOne.mockResolvedValue({
        id: 'org_other',
        label: 'Other Org',
      });

      await expect(
        service.switchOrganization('org_other', user),
      ).resolves.toEqual({
        brand: { id: 'brand_live', label: 'Live Brand' },
        organization: { id: 'org_other', label: 'Other Org' },
      });
      expect(brandsService.findOne).toHaveBeenNthCalledWith(1, {
        id: 'brand_stale',
        organizationId: 'org_other',
      });
      expect(brandsService.findOne).toHaveBeenNthCalledWith(2, {
        organizationId: 'org_other',
      });
      expect(usersService.patch).toHaveBeenCalledWith('user_1', {
        lastUsedOrganizationId: 'org_other',
      });
      expect(membersService.setCurrentBrand).toHaveBeenCalledWith(
        {
          isActive: true,
          isDeleted: false,
          organizationId: 'org_other',
          userId: 'user_1',
        },
        'brand_live',
      );
      expect(userAccessCacheService.invalidateAll).toHaveBeenCalledWith(
        'user_1',
      );
      expect(usersService.patch.mock.invocationCallOrder[0]).toBeLessThan(
        userAccessCacheService.invalidateAll.mock.invocationCallOrder[0],
      );
      expect(
        membersService.setCurrentBrand.mock.invocationCallOrder[0],
      ).toBeLessThan(
        userAccessCacheService.invalidateAll.mock.invocationCallOrder[0],
      );
    });
  });
});
