import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { RolesService } from '@api/collections/roles/services/roles.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import type { User } from '@clerk/backend';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';

const userId = new Types.ObjectId().toString();
const orgId = new Types.ObjectId().toString();
const brandId = new Types.ObjectId().toString();

const makeUser = (overrides: Record<string, unknown> = {}): User =>
  ({
    id: 'clerk-user-1',
    publicMetadata: {
      brand: brandId,
      isSuperAdmin: false,
      organization: orgId,
      user: userId,
      ...overrides,
    },
  }) as unknown as User;

const mockMembersService = {
  create: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
} as unknown as MembersService;

const mockOrganizationsService = {
  create: vi.fn(),
  findOne: vi.fn(),
} as unknown as OrganizationsService;

const mockBrandsService = {
  create: vi.fn(),
  findOne: vi.fn(),
} as unknown as BrandsService;

const mockClerkService = {
  updateUserPublicMetadata: vi.fn(),
} as unknown as ClerkService;

const mockUsersService = {
  findOne: vi.fn(),
} as unknown as UsersService;

const mockRolesService = {
  findOne: vi.fn(),
} as unknown as RolesService;

const mockOrganizationSettingsService = {
  create: vi.fn(),
  getLatestMajorVersionModelIds: vi.fn().mockResolvedValue([]),
} as unknown as OrganizationSettingsService;

const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as LoggerService;

const mockRequestContextCacheService = {
  invalidateForUser: vi.fn().mockResolvedValue(undefined),
};

const mockAccessBootstrapCacheService = {
  invalidateForUser: vi.fn().mockResolvedValue(undefined),
};

function buildController() {
  return new OrganizationsController(
    mockLoggerService,
    mockBrandsService,
    {} as never, // activitiesService
    mockMembersService,
    mockOrganizationsService,
    {} as never, // postsService
    {} as never, // tagsService
    {} as never, // videosService
    {} as never, // ingredientsService
    mockUsersService,
    mockRolesService,
    mockOrganizationSettingsService,
    mockClerkService,
    mockRequestContextCacheService as never,
    mockAccessBootstrapCacheService as never,
  );
}

describe('OrganizationsController — multi-org endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // GET /organizations/mine
  // ────────────────────────────────────────────────────────────────────────────
  describe('GET /organizations/mine (findMine)', () => {
    it('throws 400 when user not found in metadata', async () => {
      const controller = buildController();
      const user = makeUser({ user: undefined });

      await expect(controller.findMine(user)).rejects.toThrow(
        new HttpException(
          { detail: 'User not found in metadata', title: 'Bad Request' },
          HttpStatus.BAD_REQUEST,
        ),
      );
    });

    it('returns empty array when user has no memberships', async () => {
      const controller = buildController();
      vi.mocked(mockMembersService.find).mockResolvedValue([]);

      const result = await controller.findMine(makeUser());
      expect(result).toEqual([]);
    });

    it('returns org list with id, label, isActive, and brand', async () => {
      const controller = buildController();
      const memberOrgId = new Types.ObjectId();

      vi.mocked(mockMembersService.find).mockResolvedValue([
        { organization: memberOrgId } as never,
      ]);

      const orgDoc = { _id: memberOrgId, isDeleted: false, label: 'My Org' };
      vi.mocked(mockOrganizationsService.findOne).mockResolvedValue(
        orgDoc as never,
      );

      const brandDoc = { _id: new Types.ObjectId(), label: 'My Brand' };
      vi.mocked(mockBrandsService.findOne).mockResolvedValue(brandDoc as never);

      const user = makeUser({ organization: memberOrgId.toString() });
      const result = await controller.findMine(user);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        brand: { id: brandDoc._id.toString(), label: 'My Brand' },
        id: memberOrgId.toString(),
        isActive: true,
        label: 'My Org',
      });
    });

    it('sets isActive false for orgs that are not the current active org', async () => {
      const controller = buildController();
      const otherOrgId = new Types.ObjectId();

      vi.mocked(mockMembersService.find).mockResolvedValue([
        { organization: otherOrgId } as never,
      ]);
      vi.mocked(mockOrganizationsService.findOne).mockResolvedValue({
        _id: otherOrgId,
        label: 'Other Org',
      } as never);
      vi.mocked(mockBrandsService.findOne).mockResolvedValue(null);

      // Current active org is orgId (different from otherOrgId)
      const result = await controller.findMine(
        makeUser({ organization: orgId }),
      );
      expect(result[0]).toMatchObject({ brand: null, isActive: false });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // POST /organizations/switch/:id
  // ────────────────────────────────────────────────────────────────────────────
  describe('POST /organizations/switch/:id (switchOrganization)', () => {
    it('throws 400 when user not found in metadata', async () => {
      const controller = buildController();
      await expect(
        controller.switchOrganization(orgId, makeUser({ user: undefined })),
      ).rejects.toThrow(HttpException);
    });

    it('throws 403 when user is not a member and not superAdmin', async () => {
      const controller = buildController();
      vi.mocked(mockMembersService.findOne).mockResolvedValue(null);

      await expect(
        controller.switchOrganization(orgId, makeUser({ isSuperAdmin: false })),
      ).rejects.toThrow(
        new HttpException(
          {
            detail: 'You are not a member of this organization',
            title: 'Forbidden',
          },
          HttpStatus.FORBIDDEN,
        ),
      );
    });

    it('allows superAdmin even without membership', async () => {
      const controller = buildController();
      vi.mocked(mockMembersService.findOne).mockResolvedValue(null);

      const brandDoc = { _id: new Types.ObjectId(), label: 'SA Brand' };
      vi.mocked(mockBrandsService.findOne).mockResolvedValue(brandDoc as never);

      const orgDoc = { _id: new Types.ObjectId(orgId), label: 'SA Org' };
      vi.mocked(mockOrganizationsService.findOne).mockResolvedValue(
        orgDoc as never,
      );
      vi.mocked(mockClerkService.updateUserPublicMetadata).mockResolvedValue(
        undefined as never,
      );

      const result = await controller.switchOrganization(
        orgId,
        makeUser({ isSuperAdmin: true }),
      );
      expect(result).toMatchObject({
        brand: { id: brandDoc._id.toString() },
        organization: { id: orgId },
      });
    });

    it('throws 404 when no brand found for org', async () => {
      const controller = buildController();
      const memberDoc = { _id: new Types.ObjectId() };
      vi.mocked(mockMembersService.findOne).mockResolvedValue(
        memberDoc as never,
      );
      vi.mocked(mockBrandsService.findOne).mockResolvedValue(null);

      await expect(
        controller.switchOrganization(orgId, makeUser()),
      ).rejects.toThrow(
        new HttpException(
          {
            detail: 'No brand found for this organization',
            title: 'Not Found',
          },
          HttpStatus.NOT_FOUND,
        ),
      );
    });

    it('updates Clerk metadata and returns org + brand on success', async () => {
      const controller = buildController();
      const memberDoc = { _id: new Types.ObjectId() };
      const brandDoc = { _id: new Types.ObjectId(), label: 'Brand X' };
      const orgDoc = { _id: new Types.ObjectId(orgId), label: 'Org X' };

      vi.mocked(mockMembersService.findOne).mockResolvedValue(
        memberDoc as never,
      );
      vi.mocked(mockBrandsService.findOne).mockResolvedValue(brandDoc as never);
      vi.mocked(mockOrganizationsService.findOne).mockResolvedValue(
        orgDoc as never,
      );
      vi.mocked(mockClerkService.updateUserPublicMetadata).mockResolvedValue(
        undefined as never,
      );

      const result = await controller.switchOrganization(orgId, makeUser());

      expect(mockClerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
        'clerk-user-1',
        expect.objectContaining({
          brand: brandDoc._id.toString(),
          organization: orgId,
        }),
      );
      expect(result).toMatchObject({
        brand: { id: brandDoc._id.toString(), label: 'Brand X' },
        organization: { id: orgId, label: 'Org X' },
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // POST /organizations/create
  // ────────────────────────────────────────────────────────────────────────────
  describe('POST /organizations/create (createOrganization)', () => {
    it('throws 400 when user not found in metadata', async () => {
      const controller = buildController();
      await expect(
        controller.createOrganization(
          { label: 'New Org' },
          makeUser({ user: undefined }),
        ),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when label is missing', async () => {
      const controller = buildController();
      await expect(
        controller.createOrganization({ label: '' }, makeUser()),
      ).rejects.toThrow(
        new HttpException(
          { detail: 'Organization name is required', title: 'Bad Request' },
          HttpStatus.BAD_REQUEST,
        ),
      );
    });

    it('throws 400 when label is whitespace only', async () => {
      const controller = buildController();
      await expect(
        controller.createOrganization({ label: '   ' }, makeUser()),
      ).rejects.toThrow(HttpException);
    });

    it('throws 404 when user doc not found', async () => {
      const controller = buildController();
      vi.mocked(mockUsersService.findOne).mockResolvedValue(null);

      await expect(
        controller.createOrganization({ label: 'New Org' }, makeUser()),
      ).rejects.toThrow(
        new HttpException(
          { detail: 'User document not found', title: 'Not Found' },
          HttpStatus.NOT_FOUND,
        ),
      );
    });

    it('creates org, settings, brand, member, and updates Clerk', async () => {
      const controller = buildController();

      const userDoc = { _id: new Types.ObjectId(userId) };
      const orgDoc = { _id: new Types.ObjectId(), label: 'New Org' };
      const brandDoc = { _id: new Types.ObjectId(), label: 'New Org' };
      const roleDoc = { _id: new Types.ObjectId(), key: 'admin' };

      vi.mocked(mockUsersService.findOne).mockResolvedValue(userDoc as never);
      vi.mocked(mockOrganizationsService.create).mockResolvedValue(
        orgDoc as never,
      );
      vi.mocked(
        mockOrganizationSettingsService.getLatestMajorVersionModelIds,
      ).mockResolvedValue([]);
      vi.mocked(mockOrganizationSettingsService.create).mockResolvedValue(
        {} as never,
      );
      vi.mocked(mockBrandsService.create).mockResolvedValue(brandDoc as never);
      vi.mocked(mockRolesService.findOne).mockResolvedValue(roleDoc as never);
      vi.mocked(mockMembersService.create).mockResolvedValue({} as never);
      vi.mocked(mockClerkService.updateUserPublicMetadata).mockResolvedValue(
        undefined as never,
      );

      const result = await controller.createOrganization(
        { description: 'A test org', label: 'New Org' },
        makeUser(),
      );

      expect(mockOrganizationsService.create).toHaveBeenCalled();
      expect(mockOrganizationSettingsService.create).toHaveBeenCalled();
      expect(mockBrandsService.create).toHaveBeenCalled();
      expect(mockMembersService.create).toHaveBeenCalled();
      expect(mockClerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
        'clerk-user-1',
        expect.objectContaining({
          brand: brandDoc._id.toString(),
          organization: orgDoc._id.toString(),
        }),
      );
      expect(result).toMatchObject({
        brand: { id: brandDoc._id.toString() },
        organization: { id: orgDoc._id.toString(), label: 'New Org' },
      });
    });
  });
});
