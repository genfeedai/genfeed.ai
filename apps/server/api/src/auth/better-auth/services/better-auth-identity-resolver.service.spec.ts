import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BetterAuthIdentityResolverService } from './better-auth-identity-resolver.service';

describe('BetterAuthIdentityResolverService', () => {
  let usersService: { findOne: ReturnType<typeof vi.fn> };
  let organizationsService: { findOne: ReturnType<typeof vi.fn> };
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let membersService: { find: ReturnType<typeof vi.fn> };
  let resolver: BetterAuthIdentityResolverService;

  beforeEach(() => {
    usersService = { findOne: vi.fn() };
    organizationsService = { findOne: vi.fn() };
    brandsService = { findOne: vi.fn() };
    membersService = { find: vi.fn().mockResolvedValue([]) };

    resolver = new BetterAuthIdentityResolverService(
      usersService as unknown as UsersService,
      organizationsService as unknown as OrganizationsService,
      brandsService as unknown as BrandsService,
      membersService as unknown as MembersService,
    );
  });

  it('throws Unauthorized when the user does not exist', async () => {
    usersService.findOne.mockResolvedValue(null);

    await expect(resolver.resolve('missing')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('resolves the owner organization and its first brand, deriving isSuperAdmin from the platform role', async () => {
    usersService.findOne.mockResolvedValue({
      id: 'user_1',
      platformRole: 'SUPERADMIN',
    });
    organizationsService.findOne.mockResolvedValue({ id: 'org_1' });
    brandsService.findOne.mockResolvedValue({ id: 'brand_1' });

    const identity = await resolver.resolve('user_1');

    expect(identity).toEqual({
      brandId: 'brand_1',
      isSuperAdmin: true,
      organizationId: 'org_1',
      userId: 'user_1',
    });
    expect(organizationsService.findOne).toHaveBeenCalledWith({
      isDeleted: false,
      user: 'user_1',
    });
  });

  it('does not treat organization admins as platform superadmins', async () => {
    usersService.findOne.mockResolvedValue({
      id: 'user_org_admin',
      platformRole: 'USER',
    });
    membersService.find.mockResolvedValue([
      {
        organizationId: 'org_admin',
        role: { key: 'admin' },
      },
    ]);
    organizationsService.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'org_admin' });
    brandsService.findOne.mockResolvedValue({ id: 'brand_admin' });

    const identity = await resolver.resolve('user_org_admin');

    expect(identity).toEqual({
      brandId: 'brand_admin',
      isSuperAdmin: false,
      organizationId: 'org_admin',
      userId: 'user_org_admin',
    });
  });

  it('falls back to a membership organization when the user owns none', async () => {
    usersService.findOne.mockResolvedValue({ id: 'user_2' });
    membersService.find.mockResolvedValue([{ organizationId: 'org_member' }]);
    // First call (owner lookup) → null; second call (membership lookup) → org.
    organizationsService.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'org_member' });
    brandsService.findOne.mockResolvedValue({ id: 'brand_member' });

    const identity = await resolver.resolve('user_2');

    expect(identity.organizationId).toBe('org_member');
    expect(identity.brandId).toBe('brand_member');
    expect(identity.isSuperAdmin).toBe(false);
  });

  it('prefers a member last-used brand over the first brand', async () => {
    usersService.findOne.mockResolvedValue({ id: 'user_3' });
    organizationsService.findOne.mockResolvedValue({ id: 'org_3' });
    membersService.find.mockResolvedValue([
      { lastUsedBrandId: 'brand_last', organizationId: 'org_3' },
    ]);
    brandsService.findOne.mockResolvedValue({ id: 'brand_last' });

    const identity = await resolver.resolve('user_3');

    expect(identity.brandId).toBe('brand_last');
    expect(brandsService.findOne).toHaveBeenCalledWith({
      _id: 'brand_last',
      isDeleted: false,
      organization: 'org_3',
    });
  });

  // epic #735, Phase C — active org is DB-authoritative via User.lastUsedOrganizationId
  // (validated against live membership), so multi-org switching works without legacy auth provider.
  it('prefers the user lastUsedOrganizationId when the user is a member', async () => {
    usersService.findOne.mockResolvedValue({
      id: 'user_4',
      lastUsedOrganizationId: 'org_pref',
    });
    membersService.find.mockResolvedValue([
      { lastUsedBrandId: 'brand_pref', organizationId: 'org_pref' },
    ]);
    organizationsService.findOne.mockResolvedValue({ id: 'org_pref' });
    brandsService.findOne.mockResolvedValue({ id: 'brand_pref' });

    const identity = await resolver.resolve('user_4');

    expect(identity.organizationId).toBe('org_pref');
    expect(identity.brandId).toBe('brand_pref');
  });
});
