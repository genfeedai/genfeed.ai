import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { OrganizationLogoService } from '@api/collections/organizations/services/organization-logo.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { OrganizationsOperationsService } from '@api/collections/organizations/services/organizations-operations.service';
import type { RolesService } from '@api/collections/roles/services/roles.service';
import type { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  assertTenantScopedQuery,
  TenantIsolationError,
} from '@libs/prisma/tenant-guard';
import { HttpException } from '@nestjs/common';

/**
 * CLOUD-mode tenant guard over the cross-organization paths of
 * OrganizationsOperationsService: org list, org switch, org creation, entity
 * read. Every mocked collaborator runs the real guard on a `Brand`/`Member`
 * query shaped like the one the real service issues.
 */
const TENANT_MODELS = new Set(['Brand', 'Member']);

function guard(model: string, args: { where: Record<string, unknown> }) {
  assertTenantScopedQuery({
    args,
    isCloud: true,
    model,
    operation: 'findFirst',
    tenantModelNames: TENANT_MODELS,
  });
}

describe('OrganizationsOperationsService tenant guard (CLOUD)', () => {
  const brandsService = {
    create: vi.fn(),
    findOne: vi.fn(async (where: Record<string, unknown>) => {
      guard('Brand', { where });
      return { id: `brand_of_${String(where.organizationId)}`, label: 'B' };
    }),
  };
  const membersService = {
    create: vi.fn(),
    findActiveForUserAccess: vi.fn(),
    findOne: vi.fn(async (where: Record<string, unknown>) => {
      guard('Member', { where });
      return where.organizationId === 'org_member'
        ? { currentBrandId: 'brand_member', id: 'm1' }
        : null;
    }),
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
  const usersService = { findOne: vi.fn(), patch: vi.fn() };
  const billingAccountsService = { ensureForOrganization: vi.fn() };
  const userAccessCacheService = { invalidateAll: vi.fn() };
  const organizationLogoService = { resolveLogoUrls: vi.fn() };
  const skillLibrary = { attachSharedDefaults: vi.fn() };
  const user = {
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
    skillLibrary as unknown as SkillLibraryService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    organizationLogoService.resolveLogoUrls.mockResolvedValue(new Map());
    usersService.patch.mockResolvedValue({});
    usersService.findOne.mockResolvedValue({ id: 'user_1' });
  });

  it('proves the harness: a cross-org brand lookup under another tenant throws', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org_active' }, () =>
        guard('Brand', { where: { organizationId: 'org_member' } }),
      ),
    ).toThrow(TenantIsolationError);
  });

  it('findMine reads each membership organization brand without tripping the guard', async () => {
    membersService.findActiveForUserAccess.mockResolvedValue([
      { organizationId: 'org_active' },
      { organizationId: 'org_member' },
    ]);
    organizationsService.findOne.mockImplementation(
      async (where: { id: string }) => ({
        id: where.id,
        label: where.id,
        slug: where.id,
        userId: 'user_1',
      }),
    );

    const result = await runWithTenantContext(
      { organizationId: 'org_active' },
      () => service.findMine(user),
    );

    expect(result.map((item) => item.brand?.id)).toEqual([
      'brand_of_org_active',
      'brand_of_org_member',
    ]);
  });

  it('switchOrganization lets a member of another organization switch into it', async () => {
    const result = await runWithTenantContext(
      { organizationId: 'org_active' },
      () => service.switchOrganization('org_member', user),
    );

    expect(result.brand.id).toBe('brand_of_org_member');
    expect(membersService.setCurrentBrand).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_member' }),
      'brand_of_org_member',
    );
  });

  it('switchOrganization still refuses a normal user who is not a member of the target', async () => {
    await expect(
      runWithTenantContext({ organizationId: 'org_active' }, () =>
        service.switchOrganization('org_stranger', user),
      ),
    ).rejects.toBeInstanceOf(HttpException);

    expect(usersService.patch).not.toHaveBeenCalled();
    expect(membersService.setCurrentBrand).not.toHaveBeenCalled();
  });

  it('createOrganization provisions the new organization inside that tenant', async () => {
    const seen: Array<string | undefined> = [];
    const { getTenantContext } = await import('@libs/prisma/tenant-context');
    organizationSettingsService.findOne.mockResolvedValue({
      subscriptionTier: 'free',
    });
    organizationsService.count.mockResolvedValue(0);
    organizationsService.generateUniqueSlug.mockResolvedValue('new-org');
    organizationsService.create.mockResolvedValue({
      id: 'org_new',
      label: 'New',
    });
    rolesService.findOne.mockResolvedValue({ id: 'role_1' });
    brandsService.create.mockImplementation(async () => {
      seen.push(getTenantContext()?.organizationId);
      return { id: 'brand_new', label: 'New' };
    });
    billingAccountsService.ensureForOrganization.mockImplementation(
      async () => {
        seen.push(getTenantContext()?.organizationId);
      },
    );
    skillLibrary.attachSharedDefaults.mockImplementation(async () => {
      seen.push(getTenantContext()?.organizationId);
    });

    await runWithTenantContext({ organizationId: 'org_active' }, () =>
      service.createOrganization({ label: 'New' }, {
        ...user,
        isSuperAdmin: true,
      } as User),
    );

    expect(seen).toEqual(['org_new', 'org_new', 'org_new']);
  });

  it('canUserReadEntity checks membership in the entity organization, not the tenant', async () => {
    const readable = await runWithTenantContext(
      { organizationId: 'org_active' },
      () =>
        service.canUserReadEntity(user, {
          id: 'org_member',
          userId: 'someone_else',
        } as never),
    );
    const unreadable = await runWithTenantContext(
      { organizationId: 'org_active' },
      () =>
        service.canUserReadEntity(user, {
          id: 'org_stranger',
          userId: 'someone_else',
        } as never),
    );

    expect(readable).toBe(true);
    expect(unreadable).toBe(false);
  });
});
