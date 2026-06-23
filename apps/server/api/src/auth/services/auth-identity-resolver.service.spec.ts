import { AuthIdentityResolverService } from '@api/auth/services/auth-identity-resolver.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { LoggerService } from '@libs/logger/logger.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthIdentityResolverService', () => {
  const usersService = {
    findOne: vi.fn(),
    patch: vi.fn(),
  };
  const organizationsService = {
    findOne: vi.fn(),
  };
  const brandsService = {
    findOne: vi.fn(),
  };
  const membersService = {
    find: vi.fn(),
  };
  const userSetupService = {
    initializeUserResources: vi.fn(),
  };
  const loggerService = {
    error: vi.fn(),
    warn: vi.fn(),
  };

  const service = new AuthIdentityResolverService(
    usersService as unknown as UsersService,
    organizationsService as unknown as OrganizationsService,
    brandsService as unknown as BrandsService,
    membersService as unknown as MembersService,
    loggerService as unknown as LoggerService,
    userSetupService as unknown as UserSetupService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses current metadata ids without repairing Clerk metadata', async () => {
    usersService.findOne.mockResolvedValueOnce({
      _id: 'user_current',
    });
    membersService.find.mockResolvedValue([
      {
        lastUsedBrandId: 'brand_current',
        organizationId: 'org_current',
      },
    ]);
    organizationsService.findOne.mockResolvedValueOnce({
      _id: 'org_current',
      userId: 'user_current',
    });
    brandsService.findOne.mockResolvedValueOnce({
      _id: 'brand_current',
    });

    const result = await service.resolve({
      id: 'user_clerk_1',
      publicMetadata: {
        brand: 'brand_current',
        organization: 'org_current',
        user: 'user_current',
      },
    } as never);

    expect(result).toEqual({
      brandId: 'brand_current',
      clerkUserId: 'user_clerk_1',
      organizationId: 'org_current',
      resolvedBy: 'metadata',
      userId: 'user_current',
    });
  });

  it('resolves legacy metadata via mongoId fields', async () => {
    usersService.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      _id: '507f1f77bcf86cd799439011',
      id: 'user_current',
    });
    membersService.find.mockResolvedValue([
      {
        lastUsedBrandId: 'brand_current',
        organizationId: 'org_current',
      },
    ]);
    organizationsService.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: '507f1f77bcf86cd799439012',
        id: 'org_current',
        userId: 'user_current',
      });
    brandsService.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      _id: '507f1f77bcf86cd799439013',
      id: 'brand_current',
    });

    const result = await service.resolve({
      id: 'user_clerk_2',
      publicMetadata: {
        brand: '507f1f77bcf86cd799439013',
        organization: '507f1f77bcf86cd799439012',
        user: '507f1f77bcf86cd799439011',
      },
    } as never);

    expect(result).toEqual({
      brandId: 'brand_current',
      clerkUserId: 'user_clerk_2',
      organizationId: 'org_current',
      resolvedBy: 'metadata',
      userId: 'user_current',
    });
  });

  it('resolves active Clerk organization metadata via clerkOrganizationId', async () => {
    usersService.findOne.mockResolvedValueOnce({
      _id: 'user_current',
    });
    membersService.find.mockResolvedValue([
      {
        lastUsedBrandId: 'brand_current',
        organizationId: 'org_current',
      },
    ]);
    organizationsService.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: 'org_current',
        clerkOrganizationId: 'org_clerk_current',
        userId: 'user_current',
      });
    brandsService.findOne.mockResolvedValueOnce({
      _id: 'brand_current',
    });

    const result = await service.resolve({
      id: 'user_clerk_4',
      publicMetadata: {
        brand: 'brand_current',
        organization: 'org_clerk_current',
        user: 'user_current',
      },
    } as never);

    expect(result).toEqual({
      brandId: 'brand_current',
      clerkUserId: 'user_clerk_4',
      organizationId: 'org_current',
      resolvedBy: 'metadata',
      userId: 'user_current',
    });
  });

  it('repairs stale organization metadata and seeds missing membership when the user cannot access that organization', async () => {
    usersService.findOne.mockResolvedValueOnce({
      _id: 'user_current',
    });
    membersService.find.mockResolvedValue([]);
    organizationsService.findOne
      .mockResolvedValueOnce({
        _id: 'org_stale',
        userId: 'different_user',
      })
      .mockResolvedValueOnce({
        _id: 'org_owner',
        user: 'user_current',
      });
    brandsService.findOne.mockResolvedValueOnce({
      _id: 'brand_owner',
    });
    userSetupService.initializeUserResources.mockResolvedValueOnce({
      brand: { _id: 'brand_owner' },
      member: { _id: 'member_owner', organizationId: 'org_owner' },
      organization: { _id: 'org_owner', user: 'user_current' },
      organizationSettings: {},
      userSettings: {},
    });

    const result = await service.resolve({
      id: 'user_clerk_3',
      publicMetadata: {
        brand: 'brand_stale',
        organization: 'org_stale',
        user: 'user_current',
      },
    } as never);

    expect(result).toEqual({
      brandId: 'brand_owner',
      clerkUserId: 'user_clerk_3',
      organizationId: 'org_owner',
      resolvedBy: 'metadata',
      userId: 'user_current',
    });
    expect(userSetupService.initializeUserResources).toHaveBeenCalledWith(
      'user_current',
    );
  });

  it('resolves fully stale metadata user by current Clerk id and repairs workspace', async () => {
    usersService.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: '507f1f77bcf86cd799439011',
        id: 'user_current',
      });
    membersService.find.mockResolvedValue([]);
    organizationsService.findOne.mockResolvedValue(null);
    userSetupService.initializeUserResources.mockResolvedValueOnce({
      brand: { _id: '507f1f77bcf86cd799439013', id: 'brand_repaired' },
      member: { _id: 'member_repaired', organizationId: 'org_repaired' },
      organization: {
        _id: '507f1f77bcf86cd799439012',
        id: 'org_repaired',
        user: 'user_current',
      },
      organizationSettings: {},
      userSettings: {},
    });

    const result = await service.resolve({
      id: 'user_clerk_current',
      publicMetadata: {
        brand: 'brand_stale',
        organization: 'org_stale',
        user: 'user_stale',
      },
    } as never);

    expect(usersService.findOne).toHaveBeenNthCalledWith(
      3,
      { clerkId: 'user_clerk_current' },
      [],
    );
    expect(userSetupService.initializeUserResources).toHaveBeenCalledWith(
      'user_current',
    );
    expect(result).toEqual({
      brandId: 'brand_repaired',
      clerkUserId: 'user_clerk_current',
      organizationId: 'org_repaired',
      resolvedBy: 'lookup',
      userId: 'user_current',
    });
  });

  it('throws when lookup cannot resolve current user id', async () => {
    usersService.findOne.mockResolvedValue(null);

    await expect(
      service.resolve({
        id: 'user_clerk_missing',
        publicMetadata: {},
      } as never),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('self-heals a stale clerkId by reconciling on verified primary email', async () => {
    usersService.findOne
      // clerkId lookup misses (rotated/recreated Clerk identity)
      .mockResolvedValueOnce(null)
      // email lookup matches the existing row carrying the stale clerkId
      .mockResolvedValueOnce({ _id: 'user_existing', clerkId: 'clerk_old' });
    usersService.patch.mockResolvedValue({ _id: 'user_existing' });
    membersService.find.mockResolvedValue([]);
    organizationsService.findOne.mockResolvedValue(null);
    userSetupService.initializeUserResources.mockResolvedValueOnce({
      brand: { _id: 'brand_repaired' },
      member: { _id: 'member_repaired', organizationId: 'org_repaired' },
      organization: { _id: 'org_repaired', user: 'user_existing' },
      organizationSettings: {},
      userSettings: {},
    });

    const result = await service.resolve({
      emailAddresses: [
        {
          emailAddress: 'Vincent@Genfeed.ai',
          id: 'idem_1',
          verification: { status: 'verified' },
        },
      ],
      id: 'clerk_new',
      primaryEmailAddressId: 'idem_1',
      publicMetadata: {},
    } as never);

    expect(usersService.findOne).toHaveBeenNthCalledWith(
      2,
      { email: 'vincent@genfeed.ai', isDeleted: false },
      [],
    );
    expect(usersService.patch).toHaveBeenCalledWith('user_existing', {
      clerkId: 'clerk_new',
    });
    expect(result).toEqual({
      brandId: 'brand_repaired',
      clerkUserId: 'clerk_new',
      organizationId: 'org_repaired',
      resolvedBy: 'reconciled',
      userId: 'user_existing',
    });
  });

  it('does not reconcile on an unverified primary email', async () => {
    usersService.findOne.mockResolvedValue(null);

    await expect(
      service.resolve({
        emailAddresses: [
          {
            emailAddress: 'attacker@example.com',
            id: 'idem_1',
            verification: { status: 'unverified' },
          },
        ],
        id: 'clerk_attacker',
        primaryEmailAddressId: 'idem_1',
        publicMetadata: {},
      } as never),
    ).rejects.toThrow(UnauthorizedException);

    // Only the clerkId lookup runs; no email lookup, no write.
    expect(usersService.findOne).toHaveBeenCalledTimes(1);
    expect(usersService.patch).not.toHaveBeenCalled();
  });

  // epic #735, Phase C — DB-authoritative active org/brand. These lock in that
  // the DB markers win over the (frozen, post-cutover) Clerk publicMetadata
  // candidates, so switching keeps working without any Clerk write-back.
  it('prefers User.lastUsedOrganizationId over the stale publicMetadata organization', async () => {
    usersService.findOne.mockResolvedValueOnce({
      _id: 'user_current',
      lastUsedOrganizationId: 'org_active',
    });
    membersService.find.mockResolvedValue([
      { lastUsedBrandId: 'brand_active', organizationId: 'org_active' },
    ]);
    // findAccessibleOrganization('org_active') resolves the owned org
    organizationsService.findOne.mockResolvedValueOnce({
      _id: 'org_active',
      userId: 'user_current',
    });
    brandsService.findOne.mockResolvedValueOnce({ _id: 'brand_active' });

    const result = await service.resolve({
      id: 'user_clerk_active',
      publicMetadata: {
        brand: 'brand_stale',
        organization: 'org_stale',
        user: 'user_current',
      },
    } as never);

    expect(result.organizationId).toBe('org_active');
    expect(result.brandId).toBe('brand_active');
    expect(result.userId).toBe('user_current');
  });

  it('prefers Member.lastUsedBrandId over the stale publicMetadata brand', async () => {
    usersService.findOne.mockResolvedValueOnce({ _id: 'user_current' });
    membersService.find.mockResolvedValue([
      { lastUsedBrandId: 'brand_last_used', organizationId: 'org_current' },
    ]);
    organizationsService.findOne.mockResolvedValueOnce({
      _id: 'org_current',
      userId: 'user_current',
    });
    brandsService.findOne.mockResolvedValueOnce({ _id: 'brand_last_used' });

    const result = await service.resolve({
      id: 'user_clerk_brand',
      publicMetadata: {
        brand: 'brand_stale_candidate',
        organization: 'org_current',
        user: 'user_current',
      },
    } as never);

    expect(result.brandId).toBe('brand_last_used');
  });
});
