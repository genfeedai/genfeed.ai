let mockCloudMode = true;
vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();
  return {
    ...actual,
    isCloudDeployment: () => mockCloudMode,
  };
});

// findBySlug is the only route in this suite that serializes. Keep the rest of
// the response helpers real so nothing else changes shape.
vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();
  return {
    ...actual,
    serializeSingle: vi.fn((_request, _serializer, data) => data),
  };
});

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { SubscriptionTier } from '@genfeedai/enums';
import { SINGLE_ORGANIZATION_LIMIT } from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

interface FindMineEntry {
  brand: { id: string; label: string } | null;
  id: string;
  isActive: boolean;
  isOwner: boolean;
  label: string;
  slug: string;
}

describe('OrganizationsController', () => {
  let controller: OrganizationsController;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockMembersService = {
    create: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    setLastUsedBrand: vi.fn(),
  };

  const mockOrganizationsService = {
    count: vi.fn(),
    create: vi.fn(),
    findBySlug: vi.fn(),
    findOne: vi.fn(),
    generateUniqueSlug: vi.fn(),
  };

  const mockBrandsService = {
    create: vi.fn(),
    findOne: vi.fn(),
  };

  const mockUsersService = {
    findOne: vi.fn(),
    patch: vi.fn(),
  };

  const mockRolesService = {
    findOne: vi.fn(),
  };

  const mockOrganizationSettingsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    getLatestMajorVersionModelIds: vi.fn(),
  };

  const mockDefaultRecurringContentService = {
    ensureDefaultBundle: vi.fn(),
  };

  const mockInvalidatingCache = {
    invalidateForUser: vi.fn().mockResolvedValue(undefined),
  };

  const currentUser = {
    publicMetadata: {
      brand: 'brand_active',
      isSuperAdmin: false,
      organization: 'org_active',
      user: 'user_1',
    },
  } as unknown as User;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCloudMode = true;

    mockDefaultRecurringContentService.ensureDefaultBundle.mockResolvedValue(
      undefined,
    );
    mockOrganizationSettingsService.findOne.mockResolvedValue({
      subscriptionTier: SubscriptionTier.FREE,
    });
    mockOrganizationSettingsService.getLatestMajorVersionModelIds.mockResolvedValue(
      [],
    );
    mockOrganizationsService.count.mockResolvedValue(0);
    mockOrganizationsService.create.mockResolvedValue({
      id: 'org_new',
      label: 'New Org',
      slug: 'new-org',
    });
    mockOrganizationsService.generateUniqueSlug.mockResolvedValue('new-org');
    mockBrandsService.create.mockResolvedValue({
      id: 'brand_new',
      label: 'New Org',
    });
    mockMembersService.create.mockResolvedValue({ id: 'member_new' });
    mockMembersService.setLastUsedBrand.mockResolvedValue(undefined);
    mockRolesService.findOne.mockResolvedValue({ id: 'role_admin' });
    mockUsersService.findOne.mockResolvedValue({ id: 'user_1' });
    mockUsersService.patch.mockResolvedValue({ id: 'user_1' });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: BrandsService, useValue: mockBrandsService },
        { provide: MembersService, useValue: mockMembersService },
        { provide: OrganizationsService, useValue: mockOrganizationsService },
        {
          provide: DefaultRecurringContentService,
          useValue: mockDefaultRecurringContentService,
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: RolesService, useValue: mockRolesService },
        {
          provide: OrganizationSettingsService,
          useValue: mockOrganizationSettingsService,
        },
        {
          provide: RequestContextCacheService,
          useValue: mockInvalidatingCache,
        },
        {
          provide: AccessBootstrapCacheService,
          useValue: mockInvalidatingCache,
        },
        {
          provide: BetterAuthIdentityCacheService,
          useValue: mockInvalidatingCache,
        },
      ],
    }).compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
  });

  describe('findMine', () => {
    it('resolves organizations from Prisma-shaped membership rows (organizationId scalar)', async () => {
      // Regression: rows carry `organizationId`; the legacy `organization`
      // alias is undefined. Mapping the alias sent findOne({ _id: undefined })
      // downstream, which returned the first org in the table for every row.
      mockMembersService.find.mockResolvedValue([
        { id: 'member_1', isActive: true, organizationId: 'org_a' },
        { id: 'member_2', isActive: true, organizationId: 'org_b' },
      ]);
      mockOrganizationsService.findOne.mockImplementation(
        async ({ _id }: { _id: string }) => ({
          id: _id,
          label: `label ${_id}`,
          slug: `slug-${_id}`,
          userId: _id === 'org_a' ? 'user_1' : 'user_2',
        }),
      );
      mockBrandsService.findOne.mockResolvedValue(null);

      const result = (await controller.findMine(
        currentUser,
      )) as FindMineEntry[];

      expect(mockOrganizationsService.findOne).toHaveBeenCalledWith({
        _id: 'org_a',
        isDeleted: false,
      });
      expect(mockOrganizationsService.findOne).toHaveBeenCalledWith({
        _id: 'org_b',
        isDeleted: false,
      });
      expect(result.map((entry) => entry.id)).toEqual(['org_a', 'org_b']);
      expect(
        result.map((entry) => ({ id: entry.id, isOwner: entry.isOwner })),
      ).toEqual([
        { id: 'org_a', isOwner: true },
        { id: 'org_b', isOwner: false },
      ]);
    });

    it('dedups multiple membership rows pointing at the same organization', async () => {
      mockMembersService.find.mockResolvedValue([
        { id: 'member_1', isActive: true, organizationId: 'org_a' },
        { id: 'member_2', isActive: true, organizationId: 'org_a' },
      ]);
      mockOrganizationsService.findOne.mockResolvedValue({
        id: 'org_a',
        label: 'Org A',
        slug: 'org-a',
      });
      mockBrandsService.findOne.mockResolvedValue(null);

      const result = (await controller.findMine(
        currentUser,
      )) as FindMineEntry[];

      expect(result).toHaveLength(1);
      expect(mockOrganizationsService.findOne).toHaveBeenCalledTimes(1);
    });

    it('skips membership rows without a resolvable organization id', async () => {
      mockMembersService.find.mockResolvedValue([
        { id: 'member_1', isActive: true, organizationId: 'org_a' },
        { id: 'member_broken', isActive: true, organizationId: undefined },
      ]);
      mockOrganizationsService.findOne.mockResolvedValue({
        id: 'org_a',
        label: 'Org A',
        slug: 'org-a',
      });
      mockBrandsService.findOne.mockResolvedValue(null);

      const result = (await controller.findMine(
        currentUser,
      )) as FindMineEntry[];

      expect(result).toHaveLength(1);
      expect(mockOrganizationsService.findOne).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.findOne).not.toHaveBeenCalledWith({
        _id: undefined,
        isDeleted: false,
      });
    });

    it('still honours legacy `organization` alias rows as a fallback', async () => {
      mockMembersService.find.mockResolvedValue([
        { id: 'member_legacy', isActive: true, organization: 'org_legacy' },
      ]);
      mockOrganizationsService.findOne.mockResolvedValue({
        id: 'org_legacy',
        label: 'Legacy',
        slug: 'legacy',
      });
      mockBrandsService.findOne.mockResolvedValue(null);

      const result = (await controller.findMine(
        currentUser,
      )) as FindMineEntry[];

      expect(result.map((entry) => entry.id)).toEqual(['org_legacy']);
    });

    it('marks only the active organization from publicMetadata', async () => {
      mockMembersService.find.mockResolvedValue([
        { id: 'member_1', isActive: true, organizationId: 'org_active' },
        { id: 'member_2', isActive: true, organizationId: 'org_other' },
      ]);
      mockOrganizationsService.findOne.mockImplementation(
        async ({ _id }: { _id: string }) => ({
          id: _id,
          label: `label ${_id}`,
          slug: `slug-${_id}`,
        }),
      );
      mockBrandsService.findOne.mockResolvedValue(null);

      const result = (await controller.findMine(
        currentUser,
      )) as FindMineEntry[];

      expect(
        result.map((entry) => ({ id: entry.id, isActive: entry.isActive })),
      ).toEqual([
        { id: 'org_active', isActive: true },
        { id: 'org_other', isActive: false },
      ]);
    });

    it('falls back to the session metadata organization when the user has no membership rows', async () => {
      mockMembersService.find.mockResolvedValue([]);
      mockOrganizationsService.findOne.mockResolvedValue({
        id: 'org_active',
        label: 'Active Org',
        slug: 'active-org',
        userId: 'user_1',
      });
      mockBrandsService.findOne.mockResolvedValue(null);

      const result = (await controller.findMine(
        currentUser,
      )) as FindMineEntry[];

      expect(result).toEqual([
        {
          brand: null,
          id: 'org_active',
          isActive: true,
          isOwner: true,
          label: 'Active Org',
          slug: 'active-org',
        },
      ]);
      expect(mockOrganizationsService.findOne).toHaveBeenCalledWith({
        _id: 'org_active',
        isDeleted: false,
      });
    });

    it('returns an empty list when neither memberships nor session metadata resolve an organization', async () => {
      mockMembersService.find.mockResolvedValue([]);

      const result = await controller.findMine({
        publicMetadata: {
          brand: 'brand_active',
          isSuperAdmin: false,
          user: 'user_1',
        },
      } as unknown as User);

      expect(result).toEqual([]);
      expect(mockOrganizationsService.findOne).not.toHaveBeenCalled();
    });
  });

  describe('createOrganization', () => {
    it.each([
      SubscriptionTier.FREE,
      SubscriptionTier.BYOK,
      SubscriptionTier.PRO,
    ])('blocks %s after the single organization limit is reached', async (tier) => {
      mockOrganizationSettingsService.findOne.mockResolvedValue({
        subscriptionTier: tier,
      });
      mockOrganizationsService.count.mockResolvedValue(
        SINGLE_ORGANIZATION_LIMIT,
      );

      await expect(
        controller.createOrganization({ label: 'Second Org' }, currentUser),
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
        status: 403,
      });
      expect(mockOrganizationsService.create).not.toHaveBeenCalled();
      expect(mockBrandsService.create).not.toHaveBeenCalled();
    });

    it.each([
      SubscriptionTier.SCALE,
      SubscriptionTier.ENTERPRISE,
    ])('allows additional organizations for %s', async (tier) => {
      mockOrganizationSettingsService.findOne.mockResolvedValue({
        subscriptionTier: tier,
      });

      const result = await controller.createOrganization(
        { description: 'Desc', label: 'New Org' },
        currentUser,
      );

      expect(result).toEqual({
        brand: { id: 'brand_new', label: 'New Org' },
        organization: { id: 'org_new', label: 'New Org' },
      });
      expect(mockOrganizationsService.count).not.toHaveBeenCalled();
      expect(mockOrganizationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'New Org',
          slug: 'new-org',
          userId: 'user_1',
        }),
      );
      expect(mockMembersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org_new',
          roleId: 'role_admin',
          userId: 'user_1',
        }),
      );
    });
  });

  // Organization rows carry no `organizationId`/`brandId` pointer, so the base
  // containment default would treat them as shared and fail open on
  // GET /organizations/:id. This override resolves access by active org,
  // ownership, or an active membership instead.
  describe('canUserReadEntity', () => {
    type OrganizationRow = Parameters<
      OrganizationsController['canUserReadEntity']
    >[1];

    const asOrganization = (row: Record<string, unknown>): OrganizationRow =>
      row as OrganizationRow;

    it('allows the active organization without a membership lookup', async () => {
      const result = await controller.canUserReadEntity(
        currentUser,
        asOrganization({ id: 'org_active', userId: 'user_other' }),
      );

      expect(result).toBe(true);
      expect(mockMembersService.findOne).not.toHaveBeenCalled();
    });

    it('allows the owner of another organization', async () => {
      const result = await controller.canUserReadEntity(
        currentUser,
        asOrganization({ id: 'org_other', userId: 'user_1' }),
      );

      expect(result).toBe(true);
    });

    it('allows a user with an active membership', async () => {
      mockMembersService.findOne.mockResolvedValue({ id: 'member_1' });

      const result = await controller.canUserReadEntity(
        currentUser,
        asOrganization({ id: 'org_other', userId: 'user_other' }),
      );

      expect(result).toBe(true);
      expect(mockMembersService.findOne).toHaveBeenCalledWith({
        isActive: true,
        isDeleted: false,
        organization: 'org_other',
        user: 'user_1',
      });
    });

    it('denies a non-member of another organization', async () => {
      mockMembersService.findOne.mockResolvedValue(null);

      const result = await controller.canUserReadEntity(
        currentUser,
        asOrganization({ id: 'org_other', userId: 'user_other' }),
      );

      expect(result).toBe(false);
    });
  });

  // GET /organizations/by-slug/:slug is bespoke, so the base findOne gate never
  // runs for it. Without its own check any authenticated user could read any
  // organization by guessing a slug.
  describe('findBySlug', () => {
    const mockRequest = {
      originalUrl: '/api/organizations/by-slug/other-org',
      query: {},
    } as unknown as Parameters<OrganizationsController['findBySlug']>[0];

    const NOT_FOUND_DETAIL = 'Organization with slug "other-org" not found';

    const readSlug = (user: User = currentUser): Promise<unknown> =>
      controller.findBySlug(mockRequest, 'other-org', user);

    const expectNotFound = async (): Promise<void> => {
      const error = await readSlug().catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getStatus()).toBe(
        HttpStatus.NOT_FOUND,
      );
      expect((error as NotFoundException).getResponse()).toEqual({
        detail: NOT_FOUND_DETAIL,
        title: 'Resource Not Found',
      });
    };

    it('returns the organization for a member reading their own org', async () => {
      const org = { id: 'org_other', label: 'Other Org', userId: 'user_other' };
      mockOrganizationsService.findBySlug.mockResolvedValue(org);
      mockMembersService.findOne.mockResolvedValue({ id: 'member_1' });

      const result = await readSlug();

      expect(result).toBe(org);
      expect(mockOrganizationsService.findBySlug).toHaveBeenCalledWith(
        'other-org',
      );
    });

    it('returns the active organization without a membership lookup', async () => {
      const org = { id: 'org_active', label: 'Active Org', userId: 'user_x' };
      mockOrganizationsService.findBySlug.mockResolvedValue(org);

      const result = await readSlug();

      expect(result).toBe(org);
      expect(mockMembersService.findOne).not.toHaveBeenCalled();
    });

    it('404s when a non-member reads a foreign organization', async () => {
      mockOrganizationsService.findBySlug.mockResolvedValue({
        id: 'org_other',
        label: 'Other Org',
        userId: 'user_other',
      });
      mockMembersService.findOne.mockResolvedValue(null);

      await expectNotFound();
    });

    // Same assertion as the denied read above: the two responses must be
    // indistinguishable, or the slug becomes an existence oracle.
    it('404s identically for an unknown slug', async () => {
      mockOrganizationsService.findBySlug.mockResolvedValue(null);

      await expectNotFound();
    });

    it('lets a super admin read a foreign organization', async () => {
      const org = { id: 'org_other', label: 'Other Org', userId: 'user_other' };
      mockOrganizationsService.findBySlug.mockResolvedValue(org);
      mockMembersService.findOne.mockResolvedValue(null);

      const superAdminUser = {
        publicMetadata: {
          ...(currentUser.publicMetadata as Record<string, unknown>),
          isSuperAdmin: true,
        },
      } as unknown as User;

      const result = await readSlug(superAdminUser);

      expect(result).toBe(org);
    });
  });
});
