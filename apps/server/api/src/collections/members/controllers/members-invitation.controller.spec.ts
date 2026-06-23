import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MembersController } from '@api/collections/members/controllers/members.controller';
import type { InvitationService } from '@api/collections/members/services/invitation.service';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';

const userId = '507f191e810c19729de860ee';
const orgId = '507f191e810c19729de860ee';
const brandId = '507f191e810c19729de860ee';

const makeUser = (overrides: Record<string, unknown> = {}): User =>
  ({
    id: 'authProvider-user-1',
    publicMetadata: {
      brand: brandId,
      isSuperAdmin: false,
      organization: orgId,
      user: userId,
      ...overrides,
    },
  }) as unknown as User;

const now = new Date('2026-06-23T12:00:00.000Z');

const invitation = {
  acceptedAt: null,
  createdAt: now,
  email: 'new@example.com',
  expiresAt: new Date('2026-06-30T12:00:00.000Z'),
  id: 'inv_123',
  invitedByUserId: userId,
  organizationId: orgId,
  revokedAt: null,
  roleId: 'role_member',
  status: 'pending' as const,
  updatedAt: now,
};

const mockMembersService = {
  findAll: vi.fn(),
  findOne: vi.fn(),
} as unknown as MembersService;

const mockInvitationService = {
  createInvitation: vi.fn(),
  listPendingInvitations: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
} as unknown as InvitationService;

const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as LoggerService;

function buildController() {
  return new MembersController(
    mockMembersService,
    mockInvitationService,
    mockLoggerService,
  );
}

describe('MembersController — invitation endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

    it('creates a self-hosted invitation with default member role semantics', async () => {
      const controller = buildController();
      vi.mocked(mockInvitationService.createInvitation).mockResolvedValue(
        invitation,
      );

      const result = await controller.invite(
        { email: 'new@example.com', firstName: 'New', lastName: 'User' },
        makeUser(),
      );

      expect(mockInvitationService.createInvitation).toHaveBeenCalledWith({
        defaultRoleKey: 'member',
        email: 'new@example.com',
        firstName: 'New',
        invitedByUserId: userId,
        lastName: 'User',
        organizationId: orgId,
        roleId: undefined,
      });
      expect(result).toEqual({
        data: {
          email: 'new@example.com',
          id: 'inv_123',
          organization: orgId,
          role: 'role_member',
          status: 'pending',
        },
      });
    });

    it('passes a provided role through to the invitation service', async () => {
      const controller = buildController();
      vi.mocked(mockInvitationService.createInvitation).mockResolvedValue({
        ...invitation,
        roleId: 'role_custom',
      });

      await controller.invite(
        { email: 'new@example.com', role: 'role_custom' },
        makeUser(),
      );

      expect(mockInvitationService.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ roleId: 'role_custom' }),
      );
    });
  });

  describe('GET /members/invitations/pending', () => {
    it('throws 400 when organization missing', async () => {
      const controller = buildController();

      await expect(
        controller.listInvitations(makeUser({ organization: undefined })),
      ).rejects.toThrow(HttpException);
    });

    it('returns pending invitations for current org', async () => {
      const controller = buildController();
      vi.mocked(mockInvitationService.listPendingInvitations).mockResolvedValue(
        [invitation],
      );

      const result = await controller.listInvitations(makeUser());

      expect(mockInvitationService.listPendingInvitations).toHaveBeenCalledWith(
        orgId,
      );
      expect(result).toEqual({
        data: [
          {
            createdAt: now,
            email: 'new@example.com',
            id: 'inv_123',
            status: 'pending',
          },
        ],
      });
    });
  });

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

    it('revokes invitation successfully', async () => {
      const controller = buildController();
      vi.mocked(mockInvitationService.revokeInvitation).mockResolvedValue({
        ...invitation,
        id: 'inv_1',
        revokedAt: now,
        status: 'revoked',
      });

      const result = await controller.revokeInvitation('inv_1', makeUser());

      expect(mockInvitationService.revokeInvitation).toHaveBeenCalledWith(
        'inv_1',
        orgId,
      );
      expect(result).toEqual({ data: { id: 'inv_1', status: 'revoked' } });
    });
  });

  describe('POST /members/invitations/:id/resend', () => {
    it('resends a pending invitation', async () => {
      const controller = buildController();
      vi.mocked(mockInvitationService.resendInvitation).mockResolvedValue({
        ...invitation,
        id: 'inv_new',
      });

      const result = await controller.resendInvitation('inv_old', makeUser());

      expect(mockInvitationService.resendInvitation).toHaveBeenCalledWith({
        invitationId: 'inv_old',
        invitedByUserId: userId,
        organizationId: orgId,
      });
      expect(result).toEqual({
        data: {
          email: 'new@example.com',
          id: 'inv_new',
          status: 'pending',
        },
      });
    });
  });
});
