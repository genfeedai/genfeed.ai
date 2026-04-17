import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
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
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;
  let organizationsService: Record<string, ReturnType<typeof vi.fn>>;
  let brandsService: Record<string, ReturnType<typeof vi.fn>>;
  let membersService: Record<string, ReturnType<typeof vi.fn>>;
  let clerkService: Record<string, ReturnType<typeof vi.fn>>;
  let usersService: Record<string, ReturnType<typeof vi.fn>>;
  let rolesService: Record<string, ReturnType<typeof vi.fn>>;
  let organizationSettingsService: Record<string, ReturnType<typeof vi.fn>>;
  let requestContextCacheService: Record<string, ReturnType<typeof vi.fn>>;
  let accessBootstrapCacheService: Record<string, ReturnType<typeof vi.fn>>;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const userId = '507f191e810c19729de860ee'.toString();
  const orgId = '507f191e810c19729de860ee'.toString();
  const brandId = '507f191e810c19729de860ee'.toString();

  const mockUser = {
    id: 'clerk_user_123',
    publicMetadata: { organization: orgId, user: userId },
  } as never;

  const mockRequest = {
    get: vi.fn().mockReturnValue('localhost'),
    headers: {},
    path: '/organizations',
    protocol: 'https',
  } as never;

  beforeEach(() => {
    organizationsService = {
      create: vi.fn(),
      find: vi.fn(),
      findAll: vi.fn().mockResolvedValue({
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 1,
      }),
      findBySlug: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn(),
      remove: vi.fn(),
    };
    brandsService = {
      create: vi.fn(),
      findAll: vi.fn().mockResolvedValue({
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 1,
      }),
      findOne: vi.fn(),
    };
    membersService = {
      create: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
    };
    clerkService = {
      updateUserPublicMetadata: vi.fn().mockResolvedValue({}),
    };
    usersService = { findOne: vi.fn() };
    rolesService = { findOne: vi.fn() };
    organizationSettingsService = {
      create: vi.fn(),
      getLatestMajorVersionModelIds: vi.fn().mockResolvedValue([]),
    };
    requestContextCacheService = {
      invalidateForUser: vi.fn().mockResolvedValue(undefined),
    };
    accessBootstrapCacheService = {
      invalidateForUser: vi.fn().mockResolvedValue(undefined),
    };
    controller = new OrganizationsController(
      mockLogger as unknown as LoggerService,
      brandsService as unknown as BrandsService,
      {
        buildEntityLookup: vi.fn().mockReturnValue([]),
      } as unknown as ActivitiesService,
      membersService as unknown as MembersService,
      organizationsService as unknown as OrganizationsService,
      {
        findAll: vi.fn().mockResolvedValue({ docs: [] }),
      } as unknown as PostsService,
      {
        findAll: vi.fn().mockResolvedValue({ docs: [] }),
      } as unknown as TagsService,
      {
        findAll: vi.fn().mockResolvedValue({ docs: [] }),
      } as unknown as VideosService,
      {
        findAll: vi.fn().mockResolvedValue({ docs: [] }),
      } as unknown as IngredientsService,
      usersService as unknown as UsersService,
      rolesService as unknown as RolesService,
      organizationSettingsService as unknown as OrganizationSettingsService,
      clerkService as unknown as ClerkService,
      requestContextCacheService as never,
      accessBootstrapCacheService as never,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findMine', () => {
    it('should return organizations the user belongs to', async () => {
      const memberOrgId = '507f191e810c19729de860ee';
      membersService.find.mockResolvedValue([
        { organization: memberOrgId, user: userId },
      ]);
      organizationsService.findOne.mockResolvedValue({
        _id: memberOrgId,
        label: 'Test Org',
      });
      brandsService.findOne.mockResolvedValue({
        _id: brandId,
        label: 'Test Brand',
      });

      const result = await controller.findMine(mockUser);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        label: 'Test Org',
        slug: '',
      });
      expect(membersService.find).toHaveBeenCalled();
    });

    it('should return empty array when user has no memberships', async () => {
      membersService.find.mockResolvedValue([]);

      const result = await controller.findMine(mockUser);

      expect(result).toEqual([]);
    });

    it('should throw when user not found in metadata', async () => {
      const noUserMeta = {
        id: 'clerk_user_123',
        publicMetadata: { organization: orgId },
      } as never;

      await expect(controller.findMine(noUserMeta)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('switchOrganization', () => {
    it('should switch organization and update clerk metadata', async () => {
      const newOrgId = '507f191e810c19729de860ee'.toString();
      membersService.findOne.mockResolvedValue({
        _id: '507f191e810c19729de860ee',
        lastUsedBrand: brandId,
      });
      brandsService.findOne.mockResolvedValue({
        _id: brandId,
        label: 'Brand',
      });
      organizationsService.findOne.mockResolvedValue({
        _id: newOrgId,
        label: 'New Org',
      });

      const result = await controller.switchOrganization(newOrgId, mockUser);

      expect(clerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
        'clerk_user_123',
        expect.objectContaining({ organization: newOrgId }),
      );
      expect(result).toHaveProperty('organization');
      expect(result).toHaveProperty('brand');
    });

    it('should throw Forbidden if user is not a member', async () => {
      membersService.findOne.mockResolvedValue(null);

      await expect(
        controller.switchOrganization(
          '507f191e810c19729de860ee'.toString(),
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw Not Found if no brand exists for the org', async () => {
      membersService.findOne.mockResolvedValue({
        _id: '507f191e810c19729de860ee',
      });
      brandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.switchOrganization(
          '507f191e810c19729de860ee'.toString(),
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('createOrganization', () => {
    it('should create org, settings, brand, and member', async () => {
      const createdOrgId = '507f191e810c19729de860ee';
      const createdBrandId = '507f191e810c19729de860ee';
      const roleId = '507f191e810c19729de860ee';

      usersService.findOne.mockResolvedValue({
        _id: userId,
      });
      organizationsService.create.mockResolvedValue({
        _id: createdOrgId,
        label: 'New Org',
      });
      organizationSettingsService.create.mockResolvedValue({});
      brandsService.create.mockResolvedValue({
        _id: createdBrandId,
        label: 'New Org',
      });
      rolesService.findOne.mockResolvedValue({ _id: roleId, key: 'admin' });
      membersService.create.mockResolvedValue({});

      const result = await controller.createOrganization(
        { label: 'New Org' },
        mockUser,
      );

      expect(organizationsService.create).toHaveBeenCalled();
      expect(organizationSettingsService.create).toHaveBeenCalled();
      expect(brandsService.create).toHaveBeenCalled();
      expect(membersService.create).toHaveBeenCalled();
      expect(clerkService.updateUserPublicMetadata).toHaveBeenCalled();
      expect(result).toHaveProperty('organization');
      expect(result).toHaveProperty('brand');
    });

    it('should throw when label is empty', async () => {
      await expect(
        controller.createOrganization({ label: '' }, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should throw when user document not found', async () => {
      usersService.findOne.mockResolvedValue(null);

      await expect(
        controller.createOrganization({ label: 'Org' }, mockUser),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('findBySlug', () => {
    it('should return a serialized organization when slug exists', async () => {
      const mockOrg = {
        _id: orgId,
        label: 'Test Org',
        slug: 'test-org',
      };
      organizationsService.findBySlug.mockResolvedValue(mockOrg);

      const result = await controller.findBySlug(mockRequest, 'test-org');

      expect(organizationsService.findBySlug).toHaveBeenCalledWith('test-org');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when slug does not exist', async () => {
      organizationsService.findBySlug.mockResolvedValue(null);

      await expect(
        controller.findBySlug(mockRequest, 'nonexistent-slug'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSlug', () => {
    it('should update slug successfully when not taken', async () => {
      organizationsService.findBySlug.mockResolvedValue(null);
      const updatedOrg = {
        _id: orgId,
        label: 'Test Org',
        slug: 'new-slug',
      };
      organizationsService.patch.mockResolvedValue(updatedOrg);

      const result = await controller.updateSlug(mockRequest, orgId, {
        slug: 'new-slug',
      });

      expect(organizationsService.findBySlug).toHaveBeenCalledWith('new-slug');
      expect(organizationsService.patch).toHaveBeenCalledWith(orgId, {
        slug: 'new-slug',
      });
      expect(result).toBeDefined();
    });

    it('should allow updating slug when taken by the same org', async () => {
      const existingOrg = {
        _id: orgId,
        label: 'Test Org',
        slug: 'existing-slug',
      };
      organizationsService.findBySlug.mockResolvedValue(existingOrg);
      organizationsService.patch.mockResolvedValue({
        ...existingOrg,
        slug: 'existing-slug',
      });

      const result = await controller.updateSlug(mockRequest, orgId, {
        slug: 'existing-slug',
      });

      expect(organizationsService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException when slug is taken by another org', async () => {
      const differentOrgId = '507f191e810c19729de860ee'.toString();
      organizationsService.findBySlug.mockResolvedValue({
        _id: differentOrgId,
        label: 'Other Org',
        slug: 'taken-slug',
      });

      await expect(
        controller.updateSlug(mockRequest, orgId, { slug: 'taken-slug' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should call organizationsService.findAll with aggregation pipeline', async () => {
      organizationsService.findAll.mockResolvedValue({
        docs: [],
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      });

      const result = await controller.findAll(
        mockRequest,
        mockUser,
        {} as never,
      );

      expect(organizationsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
