import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { UserSetupService } from '@api/collections/users/services/user-setup.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BetterAuthIdentityResolverService } from './better-auth-identity-resolver.service';

describe('BetterAuthIdentityResolverService', () => {
  let usersService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let organizationsService: { findAll: ReturnType<typeof vi.fn> };
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let membersService: {
    findActiveForUserAccess: ReturnType<typeof vi.fn>;
  };
  let identityCache: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    invalidateForUser: ReturnType<typeof vi.fn>;
  };
  let userSetupService: {
    initializeUserResources: ReturnType<typeof vi.fn>;
  };
  let resolver: BetterAuthIdentityResolverService;

  beforeEach(() => {
    usersService = { findOne: vi.fn(), patch: vi.fn() };
    organizationsService = { findAll: vi.fn() };
    brandsService = { findOne: vi.fn() };
    membersService = {
      findActiveForUserAccess: vi.fn().mockResolvedValue([]),
    };
    identityCache = {
      get: vi.fn().mockResolvedValue(null),
      invalidateForUser: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    };
    userSetupService = {
      initializeUserResources: vi.fn(),
    };

    resolver = new BetterAuthIdentityResolverService(
      usersService as unknown as UsersService,
      organizationsService as unknown as OrganizationsService,
      brandsService as unknown as BrandsService,
      membersService as unknown as MembersService,
      identityCache as unknown as BetterAuthIdentityCacheService,
      userSetupService as unknown as UserSetupService,
    );
  });

  it('throws Unauthorized when the user does not exist', async () => {
    usersService.findOne.mockResolvedValue(null);

    await expect(resolver.resolve('missing')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(usersService.findOne).toHaveBeenCalledWith(
      { id: 'missing', isDeleted: false },
      [],
    );
  });

  it('does not attach an owned organization without an active membership and provisions instead', async () => {
    usersService.findOne.mockResolvedValue({
      id: 'user_1',
      lastUsedOrganizationId: 'org_owned',
      platformRole: 'SUPERADMIN',
    });
    membersService.findActiveForUserAccess.mockResolvedValue([]);
    userSetupService.initializeUserResources.mockResolvedValue({
      brand: { id: 'brand_1' },
      organization: { id: 'org_1' },
    });

    const identity = await resolver.resolve('user_1');

    expect(identity).toEqual({
      brandId: 'brand_1',
      isSuperAdmin: true,
      organizationId: 'org_1',
      userId: 'user_1',
    });
    expect(organizationsService.findAll).not.toHaveBeenCalled();
    expect(userSetupService.initializeUserResources).toHaveBeenCalledWith(
      'user_1',
      undefined,
      { email: null, name: null },
    );
    expect(usersService.patch).toHaveBeenCalledWith('user_1', {
      lastUsedOrganizationId: 'org_1',
    });
  });

  it('does not treat organization admins as platform superadmins', async () => {
    usersService.findOne.mockResolvedValue({
      id: 'user_org_admin',
      platformRole: 'USER',
    });
    membersService.findActiveForUserAccess.mockResolvedValue([
      {
        organizationId: 'org_admin',
        role: { key: 'admin' },
      },
    ]);
    organizationsService.findAll.mockResolvedValue({
      docs: [{ id: 'org_admin' }],
    });
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
    membersService.findActiveForUserAccess.mockResolvedValue([
      { organizationId: 'org_member' },
    ]);
    organizationsService.findAll.mockResolvedValue({
      docs: [{ id: 'org_member' }],
    });
    brandsService.findOne.mockResolvedValue({ id: 'brand_member' });

    const identity = await resolver.resolve('user_2');

    expect(identity.organizationId).toBe('org_member');
    expect(identity.brandId).toBe('brand_member');
    expect(identity.isSuperAdmin).toBe(false);
  });

  it('prefers a member last-used brand over the first brand', async () => {
    usersService.findOne.mockResolvedValue({ id: 'user_3' });
    organizationsService.findAll.mockResolvedValue({ docs: [{ id: 'org_3' }] });
    membersService.findActiveForUserAccess.mockResolvedValue([
      { lastUsedBrandId: 'brand_last', organizationId: 'org_3' },
    ]);
    brandsService.findOne.mockResolvedValue({ id: 'brand_last' });

    const identity = await resolver.resolve('user_3');

    expect(identity.brandId).toBe('brand_last');
    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand_last',
      isDeleted: false,
      organizationId: 'org_3',
    });
    expect(usersService.patch).toHaveBeenCalledWith('user_3', {
      lastUsedOrganizationId: 'org_3',
    });
  });

  // epic #735, Phase C — active org is DB-authoritative via User.lastUsedOrganizationId
  // (validated against live membership), so multi-org switching works without legacy auth provider.
  it('prefers the user lastUsedOrganizationId when the user is a member', async () => {
    usersService.findOne.mockResolvedValue({
      id: 'user_4',
      lastUsedOrganizationId: 'org_pref',
    });
    membersService.findActiveForUserAccess.mockResolvedValue([
      { lastUsedBrandId: 'brand_pref', organizationId: 'org_pref' },
    ]);
    organizationsService.findAll.mockResolvedValue({
      docs: [{ id: 'org_pref' }],
    });
    brandsService.findOne.mockResolvedValue({ id: 'brand_pref' });

    const identity = await resolver.resolve('user_4');

    expect(identity.organizationId).toBe('org_pref');
    expect(identity.brandId).toBe('brand_pref');
    expect(organizationsService.findAll).toHaveBeenCalledWith(
      {
        select: { id: true },
        where: { id: { in: ['org_pref'] }, isDeleted: false },
      },
      { pagination: false },
      false,
    );
    expect(usersService.patch).not.toHaveBeenCalled();
  });

  it('ignores a stale lastUsed organization and recovers the live membership org', async () => {
    usersService.findOne.mockResolvedValue({
      id: 'user_stale',
      lastUsedOrganizationId: 'org_stale',
    });
    membersService.findActiveForUserAccess.mockResolvedValue([
      { lastUsedBrandId: 'brand_live', organizationId: 'org_live' },
    ]);
    organizationsService.findAll.mockResolvedValue({
      docs: [{ id: 'org_live' }],
    });
    brandsService.findOne.mockResolvedValue({ id: 'brand_live' });

    const identity = await resolver.resolve('user_stale');

    expect(identity.organizationId).toBe('org_live');
    expect(identity.brandId).toBe('brand_live');
    expect(organizationsService.findAll).toHaveBeenCalledWith(
      {
        select: { id: true },
        where: { id: { in: ['org_live'] }, isDeleted: false },
      },
      { pagination: false },
      false,
    );
    expect(usersService.patch).toHaveBeenCalledWith('user_stale', {
      lastUsedOrganizationId: 'org_live',
    });
  });

  it('resolves multiple membership organizations with one projected query', async () => {
    usersService.findOne.mockResolvedValue({
      id: 'user_multi',
      lastUsedOrganizationId: 'org_deleted',
    });
    membersService.findActiveForUserAccess.mockResolvedValue([
      { organizationId: 'org_deleted' },
      { organizationId: 'org_missing' },
      { lastUsedBrandId: 'brand_live', organizationId: 'org_live' },
      { organizationId: 'org_live' },
    ]);
    organizationsService.findAll.mockResolvedValue({
      docs: [{ id: 'org_live' }],
    });
    brandsService.findOne.mockResolvedValue({ id: 'brand_live' });

    const identity = await resolver.resolve('user_multi');

    expect(identity.organizationId).toBe('org_live');
    expect(organizationsService.findAll).toHaveBeenCalledTimes(1);
    expect(organizationsService.findAll).toHaveBeenCalledWith(
      {
        select: { id: true },
        where: {
          id: { in: ['org_deleted', 'org_missing', 'org_live'] },
          isDeleted: false,
        },
      },
      { pagination: false },
      false,
    );
  });

  // Library-loading bug (images/videos/gifs/agent-* list endpoints): an
  // active membership row whose organization can no longer be resolved (e.g.
  // soft-deleted org, orphaned member row) must not silently resolve to
  // `organizationId: undefined`. Downstream, every
  // `{ organization: identity.organizationId } OR { userId: currentUser }`
  // list filter treats an `undefined` organization branch as a no-op entry
  // that BaseService.normalizeWhere drops from the OR array — collapsing the
  // query to "created by me only" and returning 200 OK with 0 results for
  // teammate-created content, with no visible error anywhere. Fail loudly
  // instead so the real data problem (an inaccessible org for a live member
  // row) surfaces immediately rather than presenting as a silent empty list.
  it('throws Unauthorized instead of silently returning an undefined organizationId when every membership organization fails to resolve', async () => {
    usersService.findOne.mockResolvedValue({ id: 'user_orphaned' });
    membersService.findActiveForUserAccess.mockResolvedValue([
      { organizationId: 'org_soft_deleted' },
    ]);
    organizationsService.findAll.mockResolvedValue({ docs: [] });

    await expect(resolver.resolve('user_orphaned')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(organizationsService.findAll).toHaveBeenCalledWith(
      {
        select: { id: true },
        where: { id: { in: ['org_soft_deleted'] }, isDeleted: false },
      },
      { pagination: false },
      false,
    );
    expect(brandsService.findOne).not.toHaveBeenCalled();
    expect(usersService.patch).not.toHaveBeenCalled();
  });

  it('provisions a workspace when a signed-in user has no membership and no owned org', async () => {
    usersService.findOne.mockResolvedValue({
      email: 'vincent@shipshit.dev',
      id: 'user_no_memberships',
      name: 'Vincent',
    });
    membersService.findActiveForUserAccess.mockResolvedValue([]);
    userSetupService.initializeUserResources.mockResolvedValue({
      brand: { id: 'brand_new' },
      organization: { id: 'org_new' },
    });

    const identity = await resolver.resolve('user_no_memberships');

    expect(userSetupService.initializeUserResources).toHaveBeenCalledWith(
      'user_no_memberships',
      undefined,
      { email: 'vincent@shipshit.dev', name: 'Vincent' },
    );
    expect(organizationsService.findAll).not.toHaveBeenCalled();
    expect(identity).toEqual({
      brandId: 'brand_new',
      isSuperAdmin: false,
      organizationId: 'org_new',
      userId: 'user_no_memberships',
    });
    expect(usersService.patch).toHaveBeenCalledWith('user_no_memberships', {
      lastUsedOrganizationId: 'org_new',
    });
  });

  it('keeps the session usable when workspace provisioning fails', async () => {
    usersService.findOne.mockResolvedValue({ id: 'user_no_memberships' });
    membersService.findActiveForUserAccess.mockResolvedValue([]);
    userSetupService.initializeUserResources.mockRejectedValue(
      new Error('db down'),
    );

    const identity = await resolver.resolve('user_no_memberships');

    expect(identity.organizationId).toBeUndefined();
    expect(identity.brandId).toBeUndefined();
    expect(usersService.patch).not.toHaveBeenCalled();
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
    expect(membersService.findActiveForUserAccess).not.toHaveBeenCalled();
    expect(organizationsService.findAll).not.toHaveBeenCalled();
    expect(brandsService.findOne).not.toHaveBeenCalled();
    expect(identityCache.set).not.toHaveBeenCalled();
  });

  it('caches the resolved identity after a cache miss', async () => {
    usersService.findOne.mockResolvedValue({ id: 'user_5' });
    membersService.findActiveForUserAccess.mockResolvedValue([
      { organizationId: 'org_5' },
    ]);
    organizationsService.findAll.mockResolvedValue({ docs: [{ id: 'org_5' }] });
    brandsService.findOne.mockResolvedValue({ id: 'brand_5' });

    const identity = await resolver.resolve('user_5');

    expect(identityCache.get).toHaveBeenCalledWith('user_5');
    expect(identityCache.set).toHaveBeenCalledWith('user_5', identity);
    expect(usersService.patch).toHaveBeenCalledWith('user_5', {
      lastUsedOrganizationId: 'org_5',
    });
  });

  it('does not cache when resolution throws', async () => {
    usersService.findOne.mockResolvedValue(null);

    await expect(resolver.resolve('missing')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(identityCache.set).not.toHaveBeenCalled();
  });
});
