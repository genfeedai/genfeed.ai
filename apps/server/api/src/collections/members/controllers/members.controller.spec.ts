import { MembersController } from '@api/collections/members/controllers/members.controller';
import { MembersService } from '@api/collections/members/services/members.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { RATE_LIMIT_KEY } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';

describe('MembersController', () => {
  let controller: MembersController;
  let membersService: Record<string, ReturnType<typeof vi.fn>>;
  let clerkService: Record<string, ReturnType<typeof vi.fn>>;
  let rolesService: Record<string, ReturnType<typeof vi.fn>>;

  const userId = '507f191e810c19729de860ee'.toString();
  const orgId = '507f191e810c19729de860ee'.toString();

  const mockUser = {
    id: 'clerk_user_123',
    publicMetadata: { organization: orgId, user: userId },
  } as never;

  const mockRequest = {
    get: vi.fn().mockReturnValue('localhost'),
    headers: {},
    path: '/members',
    protocol: 'https',
  } as never;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    membersService = {
      findAll: vi.fn().mockResolvedValue({
        docs: [],
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      }),
      findOne: vi.fn(),
    };
    clerkService = {
      createInvitation: vi.fn(),
      getInvitation: vi.fn(),
      getUserByEmail: vi.fn(),
      listInvitations: vi.fn(),
      revokeInvitation: vi.fn(),
    };
    rolesService = {
      findOne: vi.fn(),
    };

    controller = new MembersController(
      membersService as unknown as MembersService,
      clerkService as unknown as ClerkService,
      rolesService as unknown as RolesService,
      mockLogger as unknown as LoggerService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should have rate limit on invite endpoint', () => {
    const metadata = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      MembersController.prototype.invite,
    );
    expect(metadata).toEqual({
      limit: 10,
      scope: 'organization',
      windowMs: 60000,
    });
  });

  describe('findAll', () => {
    it('should return serialized member collection', async () => {
      membersService.findAll.mockResolvedValue({
        docs: [{ _id: '507f191e810c19729de860ee', user: userId }],
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      const result = await controller.findAll(
        {} as never,
        mockRequest,
        mockUser,
      );

      expect(membersService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('should return a member when found', async () => {
      const memberId = '507f191e810c19729de860ee'.toString();
      membersService.findOne.mockResolvedValue({ _id: memberId });

      const result = await controller.findOne(mockRequest, memberId);

      expect(membersService.findOne).toHaveBeenCalledWith({ _id: memberId });
      expect(result).toBeDefined();
    });

    it('should throw HttpException when member does not exist', async () => {
      membersService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(mockRequest, 'nonexistent'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('invite', () => {
    it('should create an invitation successfully', async () => {
      clerkService.getUserByEmail.mockResolvedValue(null);
      rolesService.findOne.mockResolvedValue({
        _id: '507f191e810c19729de860ee',
        key: 'member',
      });
      clerkService.createInvitation.mockResolvedValue({
        id: 'inv_123',
        status: 'pending',
      });

      const result = await controller.invite(
        { email: 'test@example.com' } as never,
        mockUser,
      );

      expect(clerkService.createInvitation).toHaveBeenCalled();
      expect(result.data.email).toBe('test@example.com');
      expect(result.data.status).toBe('pending');
    });

    it('should throw BAD_REQUEST when organization is missing from metadata', async () => {
      const userNoOrg = {
        id: 'clerk_user_123',
        publicMetadata: { user: userId },
      } as never;

      await expect(
        controller.invite({ email: 'test@example.com' } as never, userNoOrg),
      ).rejects.toThrow(HttpException);
    });

    it('should throw CONFLICT when user is already a member', async () => {
      clerkService.getUserByEmail.mockResolvedValue({
        publicMetadata: { user: '507f191e810c19729de860ee'.toString() },
      });
      membersService.findOne.mockResolvedValue({
        _id: '507f191e810c19729de860ee',
      });

      await expect(
        controller.invite({ email: 'existing@example.com' } as never, mockUser),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('revokeInvitation', () => {
    it('should revoke an invitation belonging to the org', async () => {
      clerkService.getInvitation.mockResolvedValue({
        id: 'inv_123',
        publicMetadata: { organization: orgId },
      });
      clerkService.revokeInvitation.mockResolvedValue({});

      const result = await controller.revokeInvitation('inv_123', mockUser);

      expect(clerkService.revokeInvitation).toHaveBeenCalledWith('inv_123');
      expect(result.data.status).toBe('revoked');
    });

    it('should throw FORBIDDEN for invitation from different org', async () => {
      clerkService.getInvitation.mockResolvedValue({
        id: 'inv_123',
        publicMetadata: { organization: '507f191e810c19729de860ee'.toString() },
      });

      await expect(
        controller.revokeInvitation('inv_123', mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should throw NOT_FOUND when invitation does not exist', async () => {
      clerkService.getInvitation.mockResolvedValue(null);

      await expect(
        controller.revokeInvitation('inv_nonexistent', mockUser),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('listInvitations', () => {
    it('should return only invitations for the current org', async () => {
      clerkService.listInvitations.mockResolvedValue([
        {
          createdAt: Date.now(),
          emailAddress: 'a@test.com',
          id: 'inv_1',
          publicMetadata: { organization: orgId },
          status: 'pending',
        },
        {
          createdAt: Date.now(),
          emailAddress: 'b@test.com',
          id: 'inv_2',
          publicMetadata: { organization: 'other-org' },
          status: 'pending',
        },
      ]);

      const result = await controller.listInvitations(mockUser);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].email).toBe('a@test.com');
    });
  });
});
