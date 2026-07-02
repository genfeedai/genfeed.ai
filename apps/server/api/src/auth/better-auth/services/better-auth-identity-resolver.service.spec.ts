import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BetterAuthIdentityResolverService } from './better-auth-identity-resolver.service';

describe('BetterAuthIdentityResolverService', () => {
  let usersService: { findOne: ReturnType<typeof vi.fn> };
  let organizationsService: { findOne: ReturnType<typeof vi.fn> };
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let membersService: { find: ReturnType<typeof vi.fn> };
  let identityCache: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    invalidateForUser: ReturnType<typeof vi.fn>;
  };
  let resolver: BetterAuthIdentityResolverService;

  beforeEach(() => {
    usersService = { findOne: vi.fn() };
    organizationsService = { findOne: vi.fn() };
    brandsService = { findOne: vi.fn() };
    membersService = { find: vi.fn().mockResolvedValue([]) };
    identityCache = {
      get: vi.fn().mockResolvedValue(null),
      invalidateForUser: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    };

    resolver = new BetterAuthIdentityResolverService(
      usersService as unknown as UsersService,
      organizationsService as unknown as OrganizationsService,
      brandsService as unknown as BrandsService,
      membersService as unknown as MembersService,
      identityCache as unknown as BetterAuthIdentityCacheService,
    );
  });

  it('throws Unauthorized when the user does not exist', async () => {
    usersService.findOne.mockResolvedValue(null);

    await expect(resolver.resolve('missing')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(usersService.findOne).toHaveBeenCalledWith(
      { _id: 'missing', isDeleted: false },
      [],
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
    expect(usersService.findOne).toHaveBeenCalledWith(
      { _id: 'user_1', isDeleted: false },
      [],
    );
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

  // Library-loading bug (images/videos/gifs/agent-* list endpoints): an
  // active membership row whose organization can no longer be resolved (e.g.
  // soft-deleted org, orphaned member row) must not silently resolve to
  // `organizationId: undefined`. Downstream, every
  // `{ organization: publicMetadata.organization } OR { userId: currentUser }`
  // list filter treats an `undefined` organization branch as a no-op entry
  // that BaseService.normalizeWhere drops from the OR array — collapsing the
  // query to "created by me only" and returning 200 OK with 0 results for
  // teammate-created content, with no visible error anywhere. Fail loudly
  // instead so the real data problem (an inaccessible org for a live member
  // row) surfaces immediately rather than presenting as a silent empty list.
  it('throws Unauthorized instead of silently returning an undefined organizationId when every membership organization fails to resolve', async () => {
    usersService.findOne.mockResolvedValue({ id: 'user_orphaned' });
    membersService.find.mockResolvedValue([
      { organizationId: 'org_soft_deleted' },
    ]);
    // Owner lookup → null; membership lookup for the only membership → null
    // (organization soft-deleted or otherwise inaccessible).
    organizationsService.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(resolver.resolve('user_orphaned')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(brandsService.findOne).not.toHaveBeenCalled();
  });

  it('does not throw when a user genuinely has no memberships at all (new/unassigned account)', async () => {
    usersService.findOne.mockResolvedValue({ id: 'user_no_memberships' });
    membersService.find.mockResolvedValue([]);
    organizationsService.findOne.mockResolvedValue(null);

    const identity = await resolver.resolve('user_no_memberships');

    expect(identity.organizationId).toBeUndefined();
    expect(identity.brandId).toBeUndefined();
  });

  it('returns the cached identity without touching the database on a cache hit', async () => {
    const cachedIdentity = {
      brandId: 'brand_c',
      isSuperAdmin: false,
      organizationId: 'org_c',
      userId: 'user_c',
    };
    identityCache.get.mockResolvedValue(cachedIdentity);

    const identity = await resolver.resolve('user_c');

    expect(identity).toEqual(cachedIdentity);
    expect(usersService.findOne).not.toHaveBeenCalled();
    expect(membersService.find).not.toHaveBeenCalled();
    expect(organizationsService.findOne).not.toHaveBeenCalled();
    expect(brandsService.findOne).not.toHaveBeenCalled();
    expect(identityCache.set).not.toHaveBeenCalled();
  });

  it('caches the resolved identity after a cache miss', async () => {
    usersService.findOne.mockResolvedValue({ id: 'user_5' });
    organizationsService.findOne.mockResolvedValue({ id: 'org_5' });
    brandsService.findOne.mockResolvedValue({ id: 'brand_5' });

    const identity = await resolver.resolve('user_5');

    expect(identityCache.get).toHaveBeenCalledWith('user_5');
    expect(identityCache.set).toHaveBeenCalledWith('user_5', identity);
  });

  it('does not cache when resolution throws', async () => {
    usersService.findOne.mockResolvedValue(null);

    await expect(resolver.resolve('missing')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(identityCache.set).not.toHaveBeenCalled();
  });
});
