import { MembersController } from '@api/collections/members/controllers/members.controller';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { RolesService } from '@api/collections/roles/services/roles.service';
import type { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import type { User } from '@clerk/backend';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';

const userId = '507f191e810c19729de860ee'.toString();
const orgId = '507f191e810c19729de860ee'.toString();
const brandId = '507f191e810c19729de860ee'.toString();

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
  find: vi.fn(),
  findAll: vi.fn(),
  findOne: vi.fn(),
} as unknown as MembersService;

const mockClerkService = {
  createInvitation: vi.fn(),
  getInvitation: vi.fn(),
  getUserByEmail: vi.fn(),
  listInvitations: vi.fn(),
  revokeInvitation: vi.fn(),
} as unknown as ClerkService;

const mockRolesService = {
  findOne: vi.fn(),
} as unknown as RolesService;

const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as LoggerService;

function buildController() {
  return new MembersController(
    mockMembersService,
    mockClerkService,
    mockRolesService,
    mockLoggerService,
  );
}

describe('MembersController — invitation endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /members/invite ─────────────────────────────────────────────────
  describe('POST /members/invite', () => {
    it('throws 400 when organization missing from metadata', async () => {
      const controller = buildController();
      await expect(
        controller.invite(
          { email: 'test@example.com' },
          makeUser({ organization: undefined }),
        ),
      ).rejects.toThrow(
        new HttpException(
          {
            detail: 'Organization not found in metadata',
            title: 'Bad Request',
          },
          HttpStatus.BAD_REQUEST,
        ),
      );
    });

    it('throws 409 when user is already a member', async () => {
      const controller = buildController();
      vi.mocked(mockClerkService.getUserByEmail).mockResolvedValue({
        publicMetadata: { user: '507f191e810c19729de860ee'.toString() },
      } as never);
      vi.mocked(mockMembersService.findOne).mockResolvedValue({
        _id: '507f191e810c19729de860ee',
      } as never);

      await expect(
        controller.invite({ email: 'existing@example.com' }, makeUser()),
      ).rejects.toThrow(
        new HttpException(
          {
            detail: 'User is already a member of this organization',
            title: 'Conflict',
          },
          HttpStatus.CONFLICT,
        ),
      );
    });

    it('creates invitation with default member role when role not specified', async () => {
      const controller = buildController();
      const roleId = '507f191e810c19729de860ee';

      vi.mocked(mockClerkService.getUserByEmail).mockResolvedValue(null);
      vi.mocked(mockRolesService.findOne).mockResolvedValue({
        _id: roleId,
        key: 'member',
      } as never);
      vi.mocked(mockClerkService.createInvitation).mockResolvedValue({
        id: 'inv_123',
        status: 'pending',
      } as never);

      const result = await controller.invite(
        { email: 'new@example.com' },
        makeUser(),
      );

      expect(mockClerkService.createInvitation).toHaveBeenCalledWith(
        'new@example.com',
        expect.stringContaining(`org=${orgId}`),
        expect.objectContaining({
          invitedByUser: userId,
          organization: orgId,
          role: roleId.toString(),
        }),
      );
      expect(result).toMatchObject({
        data: { email: 'new@example.com', id: 'inv_123', status: 'pending' },
      });
    });

    it('uses provided role when specified', async () => {
      const controller = buildController();
      const customRole = '507f191e810c19729de860ee';

      vi.mocked(mockClerkService.getUserByEmail).mockResolvedValue(null);
      vi.mocked(mockClerkService.createInvitation).mockResolvedValue({
        id: 'inv_456',
        status: 'pending',
      } as never);

      await controller.invite(
        { email: 'new@example.com', role: customRole },
        makeUser(),
      );

      expect(mockClerkService.createInvitation).toHaveBeenCalledWith(
        'new@example.com',
        expect.any(String),
        expect.objectContaining({ role: customRole.toString() }),
      );
    });

    it('includes firstName/lastName in metadata when provided', async () => {
      const controller = buildController();
      vi.mocked(mockClerkService.getUserByEmail).mockResolvedValue(null);
      vi.mocked(mockRolesService.findOne).mockResolvedValue(null);
      vi.mocked(mockClerkService.createInvitation).mockResolvedValue({
        id: 'inv_789',
        status: 'pending',
      } as never);

      await controller.invite(
        { email: 'j@example.com', firstName: 'Jane', lastName: 'Doe' },
        makeUser(),
      );

      expect(mockClerkService.createInvitation).toHaveBeenCalledWith(
        'j@example.com',
        expect.any(String),
        expect.objectContaining({ firstName: 'Jane', lastName: 'Doe' }),
      );
    });
  });

  // ─── GET /members/invitations/pending ─────────────────────────────────────
  describe('GET /members/invitations/pending', () => {
    it('throws 400 when organization missing', async () => {
      const controller = buildController();
      await expect(
        controller.listInvitations(makeUser({ organization: undefined })),
      ).rejects.toThrow(HttpException);
    });

    it('returns only invitations for current org', async () => {
      const controller = buildController();
      vi.mocked(mockClerkService.listInvitations).mockResolvedValue([
        {
          createdAt: 1000,
          emailAddress: 'a@test.com',
          id: 'inv_1',
          publicMetadata: { organization: orgId },
          status: 'pending',
        },
        {
          createdAt: 2000,
          emailAddress: 'b@test.com',
          id: 'inv_2',
          publicMetadata: { organization: 'other-org' },
          status: 'pending',
        },
      ] as never);

      const result = await controller.listInvitations(makeUser());
      expect(result).toEqual({
        data: [
          {
            createdAt: 1000,
            email: 'a@test.com',
            id: 'inv_1',
            status: 'pending',
          },
        ],
      });
    });
  });

  // ─── DELETE /members/invitations/:id ──────────────────────────────────────
  describe('DELETE /members/invitations/:invitationId', () => {
    it('throws 400 when org missing', async () => {
      const controller = buildController();
      await expect(
        controller.revokeInvitation(
          'inv_1',
          makeUser({ organization: undefined }),
        ),
      ).rejects.toThrow(HttpException);
    });

    it('throws 404 when invitation not found', async () => {
      const controller = buildController();
      vi.mocked(mockClerkService.getInvitation).mockResolvedValue(null);

      await expect(
        controller.revokeInvitation('inv_xxx', makeUser()),
      ).rejects.toThrow(
        new HttpException(
          { detail: 'Invitation not found', title: 'Not Found' },
          HttpStatus.NOT_FOUND,
        ),
      );
    });

    it('throws 403 when invitation belongs to different org', async () => {
      const controller = buildController();
      vi.mocked(mockClerkService.getInvitation).mockResolvedValue({
        id: 'inv_1',
        publicMetadata: { organization: 'other-org' },
      } as never);

      await expect(
        controller.revokeInvitation('inv_1', makeUser()),
      ).rejects.toThrow(
        new HttpException(
          {
            detail: 'Invitation does not belong to this organization',
            title: 'Forbidden',
          },
          HttpStatus.FORBIDDEN,
        ),
      );
    });

    it('revokes invitation successfully', async () => {
      const controller = buildController();
      vi.mocked(mockClerkService.getInvitation).mockResolvedValue({
        id: 'inv_1',
        publicMetadata: { organization: orgId },
      } as never);
      vi.mocked(mockClerkService.revokeInvitation).mockResolvedValue(
        undefined as never,
      );

      const result = await controller.revokeInvitation('inv_1', makeUser());
      expect(mockClerkService.revokeInvitation).toHaveBeenCalledWith('inv_1');
      expect(result).toEqual({ data: { id: 'inv_1', status: 'revoked' } });
    });
  });

  // ─── POST /members/invitations/:id/resend ─────────────────────────────────
  describe('POST /members/invitations/:id/resend', () => {
    it('throws 404 when invitation not found', async () => {
      const controller = buildController();
      vi.mocked(mockClerkService.getInvitation).mockResolvedValue(null);

      await expect(
        controller.resendInvitation('inv_xxx', makeUser()),
      ).rejects.toThrow(HttpException);
    });

    it('throws 403 when invitation belongs to different org', async () => {
      const controller = buildController();
      vi.mocked(mockClerkService.getInvitation).mockResolvedValue({
        id: 'inv_1',
        publicMetadata: { organization: 'wrong-org' },
      } as never);

      await expect(
        controller.resendInvitation('inv_1', makeUser()),
      ).rejects.toThrow(HttpException);
    });

    it('revokes old invitation and creates new one', async () => {
      const controller = buildController();
      vi.mocked(mockClerkService.getInvitation).mockResolvedValue({
        emailAddress: 'test@example.com',
        id: 'inv_old',
        publicMetadata: { organization: orgId, role: 'member' },
      } as never);
      vi.mocked(mockClerkService.revokeInvitation).mockResolvedValue(
        undefined as never,
      );
      vi.mocked(mockClerkService.createInvitation).mockResolvedValue({
        emailAddress: 'test@example.com',
        id: 'inv_new',
        status: 'pending',
      } as never);

      const result = await controller.resendInvitation('inv_old', makeUser());

      expect(mockClerkService.revokeInvitation).toHaveBeenCalledWith('inv_old');
      expect(mockClerkService.createInvitation).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringContaining(`org=${orgId}`),
        { organization: orgId, role: 'member' },
      );
      expect(result).toMatchObject({
        data: { email: 'test@example.com', id: 'inv_new', status: 'pending' },
      });
    });
  });
});
