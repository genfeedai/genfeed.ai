vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
    statusCode: 404,
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { InviteMemberDto } from '@api/collections/members/dto/invite-member.dto';
import { UpdateMemberDto } from '@api/collections/members/dto/update-member.dto';
import { InvitationService } from '@api/collections/members/services/invitation.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsMembersController } from '@api/collections/organizations/controllers/organizations-members.controller';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { MemberCreditsGuard } from '@api/helpers/guards/member-credits/member-credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { MemberRole } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const memberId = testId('member');
const userId = testId('user');
const organizationId = testId('org');
const roleId = testId('role');

describe('OrganizationsMembersController', () => {
  let controller: OrganizationsMembersController;
  let membersService: MembersService;
  let organizationsService: OrganizationsService;

  const mockMember = {
    id: memberId,
    createdAt: new Date(),
    isActive: true,
    isDeleted: false,
    organizationId,
    roleId,
    updatedAt: new Date(),
    userId,
  };

  const mockOrganization = {
    id: organizationId,
    isDeleted: false,
    name: 'Test Organization',
    userId,
  };

  const mockUser = {
    id: 'user_123',
    organizationId,
    userId,
  } as unknown as User;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockMembersService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };

  const mockOrganizationsService = {
    findOne: vi.fn(),
  };

  const mockOrganizationSettingsService = {
    updateSeatsLimit: vi.fn(),
  };

  const mockRolesService = {
    findOne: vi.fn(),
  };

  const mockSettingsService = {
    create: vi.fn(),
    findOne: vi.fn(),
  };

  const mockUsersService = {
    create: vi.fn().mockResolvedValue({
      id: userId,
    }),
    findOne: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn(),
  };

  const mockInvitationService = {
    createInvitation: vi.fn(),
  };

  const mockBrandsService = {
    findAll: vi.fn(),
  };

  const mockRequestContextCacheService = {
    invalidateForUser: vi.fn().mockResolvedValue(undefined),
  };

  const mockAccessBootstrapCacheService = {
    invalidateForUser: vi.fn().mockResolvedValue(undefined),
  };

  const mockBetterAuthIdentityCacheService = {
    invalidateForUser: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsMembersController],
      providers: [
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: MembersService,
          useValue: mockMembersService,
        },
        {
          provide: OrganizationsService,
          useValue: mockOrganizationsService,
        },
        {
          provide: OrganizationSettingsService,
          useValue: mockOrganizationSettingsService,
        },
        {
          provide: RolesService,
          useValue: mockRolesService,
        },
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: InvitationService,
          useValue: mockInvitationService,
        },
        {
          provide: BrandsService,
          useValue: mockBrandsService,
        },
        {
          provide: RequestContextCacheService,
          useValue: mockRequestContextCacheService,
        },
        {
          provide: AccessBootstrapCacheService,
          useValue: mockAccessBootstrapCacheService,
        },
        {
          provide: BetterAuthIdentityCacheService,
          useValue: mockBetterAuthIdentityCacheService,
        },
        UserAccessCacheService,
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(MemberCreditsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrganizationsMembersController>(
      OrganizationsMembersController,
    );
    membersService = module.get<MembersService>(MembersService);
    organizationsService =
      module.get<OrganizationsService>(OrganizationsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAllMembers', () => {
    it('should return paginated members list', async () => {
      const mockData = {
        docs: [mockMember],
        limit: 10,
        page: 1,
        pages: 1,
        total: 1,
      };

      mockMembersService.findAll.mockResolvedValue(mockData);

      const request = {
        get: vi.fn().mockReturnValue('localhost'),
        originalUrl: '/organizations/123/members',
        protocol: 'http',
      } as unknown as Request;

      const result = await controller.findAllMembers(
        request,
        organizationId,
        {},
        mockUser,
      );

      expect(membersService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('rejects a member list outside the authenticated organization', async () => {
      await expect(
        controller.findAllMembers(
          {} as Request,
          'another-organization',
          {},
          mockUser,
        ),
      ).rejects.toThrow('Organization not found');

      expect(membersService.findAll).not.toHaveBeenCalled();
    });
  });

  describe('inviteMember', () => {
    const inviteDto: InviteMemberDto = {
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
    };

    it('should invite a member to organization', async () => {
      mockOrganizationsService.findOne.mockResolvedValue(mockOrganization);
      mockInvitationService.createInvitation.mockResolvedValue({
        email: inviteDto.email,
        id: 'inv_123',
        status: 'delivered',
      });

      const request = {
        seatsLimit: {
          current: 5,
          id: 'limit123',
        },
      } as unknown as Request;

      const result = await controller.inviteMember(
        request,
        organizationId,
        inviteDto,
        mockUser,
      );

      expect(organizationsService.findOne).toHaveBeenCalled();
      expect(mockInvitationService.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultRoleKey: 'user',
          email: inviteDto.email,
          invitedByUserId: userId,
          organizationId,
          roleId: undefined,
        }),
      );
      expect(mockUsersService.findOne).not.toHaveBeenCalled();
      expect(mockUsersService.create).not.toHaveBeenCalled();
      expect(mockMembersService.create).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        email: inviteDto.email,
        id: 'inv_123',
        status: 'delivered',
      });
      expect(JSON.stringify(mockLoggerService.log.mock.calls)).not.toContain(
        inviteDto.email,
      );
    });

    it('restricts member invitations to organization owners and admins', () => {
      expect(
        Reflect.getMetadata(
          'roles',
          OrganizationsMembersController.prototype.inviteMember,
        ),
      ).toEqual([MemberRole.OWNER, MemberRole.ADMIN]);
    });
  });

  describe('updateMember', () => {
    const updateDto: UpdateMemberDto = {
      brandIds: [],
    };

    it('should update member details', async () => {
      mockOrganizationsService.findOne.mockResolvedValue(mockOrganization);
      mockMembersService.findOne.mockResolvedValue(mockMember);
      mockBrandsService.findAll.mockResolvedValue({ docs: [] });
      mockMembersService.patch.mockResolvedValue({
        ...mockMember,
        ...updateDto,
      });

      const mockUpdateRequest = {} as Request;

      const result = await controller.updateMember(
        mockUpdateRequest,
        organizationId,
        memberId,
        updateDto,
        mockUser,
      );

      expect(membersService.patch).toHaveBeenCalledWith(memberId, {
        brandIds: [],
      });
      expect(result).toBeDefined();
    });

    it('rejects a member update outside the authenticated organization', async () => {
      await expect(
        controller.updateMember(
          {} as Request,
          'another-organization',
          memberId,
          updateDto,
          mockUser,
        ),
      ).rejects.toThrow('Organization not found');

      expect(membersService.patch).not.toHaveBeenCalled();
    });
  });
});
