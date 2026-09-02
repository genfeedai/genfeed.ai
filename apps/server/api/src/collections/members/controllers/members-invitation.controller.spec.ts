import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MembersController } from '@api/collections/members/controllers/members.controller';
import type { InvitationService } from '@api/collections/members/services/invitation.service';
import type { MembersService } from '@api/collections/members/services/members.service';
import { MemberRole } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

const userId = testId('user');
const orgId = userId;
const brandId = userId;

const makeUser = (overrides: Record<string, unknown> = {}): User =>
  ({
    id: 'authProvider-user-1',
    brandId: brandId,
    isSuperAdmin: false,
    organizationId: orgId,
    userId: userId,
    ...overrides,
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
  roleKey: 'member',
  status: 'pending' as const,
  updatedAt: now,
};

const mockMembersService = {
  findAll: vi.fn(),
  findOne: vi.fn(),
} as unknown as MembersService;

const mockInvitationService = {
  createInvitation: vi.fn(),
  listInvitations: vi.fn(),
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

  it.each(['listInvitations', 'revokeInvitation', 'resendInvitation'] as const)(
    'restricts %s to organization owners and admins',
    (handler) => {
      expect(
        Reflect.getMetadata('roles', MembersController.prototype[handler]),
      ).toEqual([MemberRole.OWNER, MemberRole.ADMIN]);
    },
  );

  describe('GET /members/invitations', () => {
    it('throws 400 when organization missing', async () => {
      const controller = buildController();

      await expect(
        controller.listInvitations(
          {} as never,
          {},
          makeUser({ organizationId: undefined }),
        ),
      ).rejects.toThrow(HttpException);
    });

    it('returns invitations for current org filtered by status', async () => {
      const controller = buildController();
      vi.mocked(mockInvitationService.listInvitations).mockResolvedValue([
        invitation,
      ]);

      const result = await controller.listInvitations(
        {} as never,
        { status: 'pending' },
        makeUser(),
      );

      expect(mockInvitationService.listInvitations).toHaveBeenCalledWith(
        orgId,
        'pending',
      );
      expect(result).toMatchObject({
        data: [
          {
            attributes: expect.objectContaining({
              email: 'new@example.com',
              status: 'pending',
            }),
            id: 'inv_123',
          },
        ],
      });
    });

    it('returns all invitations when no status filter is provided', async () => {
      const controller = buildController();
      vi.mocked(mockInvitationService.listInvitations).mockResolvedValue([
        invitation,
      ]);

      await controller.listInvitations({} as never, {}, makeUser());

      expect(mockInvitationService.listInvitations).toHaveBeenCalledWith(
        orgId,
        undefined,
      );
    });
  });

  describe('DELETE /members/invitations/:invitationId', () => {
    it('throws 400 when org missing', async () => {
      const controller = buildController();

      await expect(
        controller.revokeInvitation(
          {} as never,
          'inv_1',
          makeUser({ organizationId: undefined }),
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

      const result = await controller.revokeInvitation(
        {} as never,
        'inv_1',
        makeUser(),
      );

      expect(mockInvitationService.revokeInvitation).toHaveBeenCalledWith(
        'inv_1',
        orgId,
      );
      expect(result).toMatchObject({
        data: {
          attributes: expect.objectContaining({ status: 'revoked' }),
          id: 'inv_1',
        },
      });
    });
  });

  // Nest matches routes in declaration order, so `@Get(':memberId')` declared
  // above the invitation routes silently swallows `/members/invitations` and
  // makes listInvitations unreachable. Calling the handlers directly cannot
  // catch that, so resolve against the declared route table instead.
  describe('route resolution order', () => {
    interface DeclaredRoute {
      handler: string;
      method: number;
      path: string;
    }

    function declaredRoutes(): DeclaredRoute[] {
      const prototype = MembersController.prototype as unknown as Record<
        string,
        unknown
      >;

      return Object.getOwnPropertyNames(prototype)
        .filter((name) => name !== 'constructor')
        .flatMap((handler) => {
          const fn = prototype[handler];
          const path: unknown = Reflect.getMetadata(
            PATH_METADATA,
            fn as object,
          );
          const method: unknown = Reflect.getMetadata(
            METHOD_METADATA,
            fn as object,
          );

          return typeof path === 'string' && typeof method === 'number'
            ? [{ handler, method, path }]
            : [];
        });
    }

    /** First declared route that matches, mirroring Nest's router. */
    function resolve(method: number, url: string): string | undefined {
      const wanted = url.split('/').filter(Boolean);

      return declaredRoutes().find((route) => {
        if (route.method !== method) return false;

        const declared = route.path.split('/').filter(Boolean);
        if (declared.length !== wanted.length) return false;

        return declared.every(
          (segment, index) =>
            segment.startsWith(':') || segment === wanted[index],
        );
      })?.handler;
    }

    it('resolves GET /members/invitations to listInvitations', () => {
      expect(resolve(RequestMethod.GET, 'invitations')).toBe('listInvitations');
    });

    it('resolves DELETE /members/invitations/:invitationId to revokeInvitation', () => {
      expect(resolve(RequestMethod.DELETE, 'invitations/inv_123')).toBe(
        'revokeInvitation',
      );
    });

    it('resolves POST /members/invitations/:invitationId/resend to resendInvitation', () => {
      expect(resolve(RequestMethod.POST, 'invitations/inv_123/resend')).toBe(
        'resendInvitation',
      );
    });

    it('still resolves GET /members/:memberId to findOne', () => {
      expect(resolve(RequestMethod.GET, userId)).toBe('findOne');
    });

    it('declares every invitation route before the :memberId wildcard', () => {
      const routes = declaredRoutes();
      const wildcardIndex = routes.findIndex(
        (route) => route.path === ':memberId',
      );

      expect(wildcardIndex).toBeGreaterThan(-1);

      const invitationIndexes = routes
        .map((route, index) => ({ index, path: route.path }))
        .filter(({ path }) => path.startsWith('invitations'))
        .map(({ index }) => index);

      expect(invitationIndexes).toHaveLength(3);
      for (const index of invitationIndexes) {
        expect(index).toBeLessThan(wildcardIndex);
      }
    });
  });

  describe('POST /members/invitations/:id/resend', () => {
    it('retries delivery on the same invitation resource', async () => {
      const controller = buildController();
      vi.mocked(mockInvitationService.resendInvitation).mockResolvedValue({
        ...invitation,
        id: 'inv_old',
        status: 'delivered',
      });

      const result = await controller.resendInvitation(
        {} as never,
        'inv_old',
        makeUser(),
      );

      expect(mockInvitationService.resendInvitation).toHaveBeenCalledWith({
        invitationId: 'inv_old',
        invitedByUserId: userId,
        organizationId: orgId,
      });
      expect(result).toMatchObject({
        data: {
          attributes: expect.objectContaining({
            email: 'new@example.com',
            status: 'delivered',
          }),
          id: 'inv_old',
        },
      });
    });
  });
});
