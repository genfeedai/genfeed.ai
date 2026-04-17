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

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { InviteMemberDto } from '@api/collections/members/dto/invite-member.dto';
import { UpdateMemberDto } from '@api/collections/members/dto/update-member.dto';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsMembersController } from '@api/collections/organizations/controllers/organizations-members.controller';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { ConfigService } from '@api/config/config.service';
import { MemberCreditsGuard } from '@api/helpers/guards/member-credits/member-credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('OrganizationsMembersController', () => {
  let controller: OrganizationsMembersController;
  let membersService: MembersService;
  let organizationsService: OrganizationsService;

  const mockMember = {
    _id: '507f1f77bcf86cd799439011',
    createdAt: new Date(),
    isActive: true,
    isDeleted: false,
    organization: '507f1f77bcf86cd799439013',
    role: '507f1f77bcf86cd799439014',
    updatedAt: new Date(),
    user: '507f1f77bcf86cd799439012',
  };

  const mockOrganization = {
    _id: '507f1f77bcf86cd799439013',
    isDeleted: false,
    name: 'Test Organization',
  };

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
      _id: '507f1f77bcf86cd799439012',
    }),
    findOne: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn(),
  };

  const mockClerkService = {
    createInvitation: vi.fn(),
    getUserByEmail: vi.fn(),
    updateUserPublicMetadata: vi.fn(),
  };

  const mockBrandsService = {
    findAll: vi.fn(),
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
          provide: ClerkService,
          useValue: mockClerkService,
        },
        {
          provide: BrandsService,
          useValue: mockBrandsService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(MemberCreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
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
        '507f1f77bcf86cd799439013',
        {},
      );

      expect(membersService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
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
      mockClerkService.getUserByEmail.mockResolvedValue(null);
      mockUsersService.findOne.mockResolvedValue(null);
      mockRolesService.findOne.mockResolvedValue({
        _id: '507f1f77bcf86cd799439014',
        key: 'user',
      });
      mockMembersService.create.mockResolvedValue(mockMember);

      const request = {
        seatsLimit: {
          current: 5,
          id: 'limit123',
        },
      } as unknown as Request;

      const mockUser = {
        id: 'user_123',
        publicMetadata: {
          organization: '507f1f77bcf86cd799439013',
          user: '507f1f77bcf86cd799439012',
        },
      } as unknown as User;

      const result = await controller.inviteMember(
        request,
        '507f1f77bcf86cd799439013',
        inviteDto,
        mockUser,
      );

      expect(organizationsService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('updateMember', () => {
    const updateDto: UpdateMemberDto = {
      accounts: [],
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
        '507f1f77bcf86cd799439013',
        '507f1f77bcf86cd799439011',
        updateDto,
      );

      expect(membersService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
