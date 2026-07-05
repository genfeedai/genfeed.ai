import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

interface FindMineEntry {
  brand: { id: string; label: string } | null;
  id: string;
  isActive: boolean;
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
    find: vi.fn(),
    findOne: vi.fn(),
    setLastUsedBrand: vi.fn(),
  };

  const mockOrganizationsService = {
    findOne: vi.fn(),
    generateUniqueSlug: vi.fn(),
  };

  const mockBrandsService = {
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
    getLatestMajorVersionModelIds: vi.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: BrandsService, useValue: mockBrandsService },
        { provide: ActivitiesService, useValue: {} },
        { provide: MembersService, useValue: mockMembersService },
        { provide: OrganizationsService, useValue: mockOrganizationsService },
        { provide: DefaultRecurringContentService, useValue: {} },
        { provide: PostsService, useValue: {} },
        { provide: TagsService, useValue: {} },
        { provide: VideosService, useValue: {} },
        { provide: IngredientsService, useValue: {} },
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

    it('returns an empty list when the user has no memberships', async () => {
      mockMembersService.find.mockResolvedValue([]);

      const result = await controller.findMine(currentUser);

      expect(result).toEqual([]);
      expect(mockOrganizationsService.findOne).not.toHaveBeenCalled();
    });
  });
});
