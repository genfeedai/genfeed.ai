import { MembersService } from '@api/collections/members/services/members.service';
import { SKIP_ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ApiKeyScope, MemberRole } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import {
  type ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

type RequestOverrides = {
  body?: Record<string, unknown>;
  params?: Record<string, unknown>;
};

const createContext = (
  user?: unknown,
  overrides: RequestOverrides = {},
): ExecutionContext => {
  return {
    getClass: vi.fn(),
    getHandler: vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        body: overrides.body ?? {},
        params: overrides.params ?? {},
        user,
      }),
    }),
  } as unknown as ExecutionContext;
};

const expectForbidden = async (activation: Promise<boolean>): Promise<void> => {
  let thrownError: unknown;

  try {
    await activation;
  } catch (error: unknown) {
    thrownError = error;
  }

  expect(thrownError).toBeInstanceOf(HttpException);
  expect((thrownError as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
};

const TOKEN_ORGANIZATION_ID = testId('org-token');
const REQUEST_ORGANIZATION_ID = testId('org-request');
const USER_ID = testId('user-token');

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockMembersService = { findOne: vi.fn() };

  beforeEach(() => {
    mockMembersService.findOne.mockReset();
    reflector = new Reflector();
    guard = new RolesGuard(
      reflector,
      mockMembersService as unknown as MembersService,
    );
  });

  it('prefers token organization context and accepts matching explicit values', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);
    mockMembersService.findOne.mockResolvedValue({ id: 'member-1' });

    const context = createContext(
      {
        organizationId: TOKEN_ORGANIZATION_ID,
        userId: USER_ID,
      },
      {
        body: { organization: TOKEN_ORGANIZATION_ID },
        params: { organizationId: TOKEN_ORGANIZATION_ID },
      },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMembersService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        isDeleted: false,
        organizationId: TOKEN_ORGANIZATION_ID,
        userId: USER_ID,
      }),
      expect.any(Array),
    );
  });

  it('rejects mismatched route organization when token organization exists', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);

    const context = createContext(
      {
        organizationId: TOKEN_ORGANIZATION_ID,
        userId: USER_ID,
      },
      { params: { organizationId: REQUEST_ORGANIZATION_ID } },
    );

    await expectForbidden(guard.canActivate(context));
    expect(mockMembersService.findOne).not.toHaveBeenCalled();
  });

  it('rejects a mismatched explicit organization even when the user is a member of it (switch-first semantics)', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);

    // Genuine, active member of BOTH orgs — membership lookup would succeed
    // for either org if the guard ever reached it. Token/session org is A;
    // the request explicitly targets org B. Switch-first semantics require
    // a 403 here without ever consulting membership for org B.
    mockMembersService.findOne.mockImplementation(
      async (filter: { organizationId?: string }) => {
        if (
          filter.organizationId === TOKEN_ORGANIZATION_ID ||
          filter.organizationId === REQUEST_ORGANIZATION_ID
        ) {
          return { id: 'member-1' };
        }
        return null;
      },
    );

    const context = createContext(
      {
        organizationId: TOKEN_ORGANIZATION_ID,
        userId: USER_ID,
      },
      { params: { organizationId: REQUEST_ORGANIZATION_ID } },
    );

    await expectForbidden(guard.canActivate(context));
    expect(mockMembersService.findOne).not.toHaveBeenCalled();
  });

  it('rejects mismatched body organization when token organization exists', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);

    const context = createContext(
      {
        organizationId: TOKEN_ORGANIZATION_ID,
        userId: USER_ID,
      },
      { body: { organizationId: REQUEST_ORGANIZATION_ID } },
    );

    await expectForbidden(guard.canActivate(context));
    expect(mockMembersService.findOne).not.toHaveBeenCalled();
  });

  it('ignores non-ID body organization payloads when token organization exists', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);
    mockMembersService.findOne.mockResolvedValue({ id: 'member-1' });

    const context = createContext(
      {
        organizationId: TOKEN_ORGANIZATION_ID,
        userId: USER_ID,
      },
      { body: { organization: 'creator-handle' } },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMembersService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        isDeleted: false,
        organizationId: TOKEN_ORGANIZATION_ID,
        userId: USER_ID,
      }),
      expect.any(Array),
    );
  });

  it('uses explicit route organization when token organization is absent', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);
    mockMembersService.findOne.mockResolvedValue({ id: 'member-1' });

    const context = createContext(
      {
        userId: USER_ID,
      },
      { params: { organizationId: REQUEST_ORGANIZATION_ID } },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMembersService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        isDeleted: false,
        organizationId: REQUEST_ORGANIZATION_ID,
        userId: USER_ID,
      }),
      expect.any(Array),
    );
  });

  it('uses explicit body organizationId when token organization is absent', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);
    mockMembersService.findOne.mockResolvedValue({ id: 'member-1' });

    const context = createContext(
      {
        userId: USER_ID,
      },
      { body: { organizationId: REQUEST_ORGANIZATION_ID } },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMembersService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        isDeleted: false,
        organizationId: REQUEST_ORGANIZATION_ID,
        userId: USER_ID,
      }),
      expect.any(Array),
    );
  });

  it('keeps superadmin bypass ahead of organization mismatch checks', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(['superadmin']);

    const context = createContext(
      {
        isSuperAdmin: true,
        organizationId: TOKEN_ORGANIZATION_ID,
        userId: USER_ID,
      },
      {
        body: { organization: REQUEST_ORGANIZATION_ID },
        params: { organizationId: REQUEST_ORGANIZATION_ID },
      },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMembersService.findOne).not.toHaveBeenCalled();
  });

  it('returns true when no roles are required', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);
    const context = createContext({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('skips role and active-organization membership checks when the handler opts out', async () => {
    vi.spyOn(reflector, 'get').mockImplementation((metadataKey: unknown) =>
      metadataKey === SKIP_ROLES_KEY ? true : undefined,
    );
    const context = createContext({
      organizationId: TOKEN_ORGANIZATION_ID,
      userId: USER_ID,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMembersService.findOne).not.toHaveBeenCalled();
  });

  it('still requires an authenticated user when the handler skips roles', async () => {
    vi.spyOn(reflector, 'get').mockImplementation((metadataKey: unknown) =>
      metadataKey === SKIP_ROLES_KEY ? true : undefined,
    );

    await expect(guard.canActivate(createContext(undefined))).rejects.toThrow(
      HttpException,
    );
    expect(mockMembersService.findOne).not.toHaveBeenCalled();
  });

  it('throws when user is missing', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(['superadmin']);
    const context = createContext(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
  });

  it('should forbid non-admin access when admin role required', async () => {
    const localReflector = new Reflector();
    vi.spyOn(localReflector, 'get').mockReturnValue(['superadmin']);
    const localGuard = new RolesGuard(
      localReflector,
      mockMembersService as unknown as MembersService,
    );

    const context = {
      getClass: vi.fn(),
      getHandler: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          body: {},
          params: {},
          user: {},
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(localGuard.canActivate(context)).rejects.toThrow(
      HttpException,
    );
  });

  it('denies organization admins when a route requires platform superadmin', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(['superadmin']);

    const organizationId = testId('org', 2);
    const userId = testId('user', 2);
    const context = createContext({
      isSuperAdmin: false,
      organizationId,
      role: 'admin',
      userId,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    expect(mockMembersService.findOne).not.toHaveBeenCalled();
  });

  it('throws forbidden when organization context exists but user metadata is invalid', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);

    const context = {
      getClass: vi.fn(),
      getHandler: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          body: {},
          params: { organizationId: TOKEN_ORGANIZATION_ID },
          user: {
            organizationId: TOKEN_ORGANIZATION_ID,
          },
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    expect(mockMembersService.findOne).not.toHaveBeenCalled();
  });

  it('accepts cuid2 organization and user context', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);
    mockMembersService.findOne.mockResolvedValue({ id: 'member-1' });

    const organizationId = testId('org', 2);
    const userId = testId('user', 2);
    const context = {
      getClass: vi.fn(),
      getHandler: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          body: {},
          params: { organizationId },
          user: {
            organizationId,
            userId,
          },
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMembersService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        userId,
      }),
      expect.any(Array),
    );
  });

  it('authorizes an opaque Better Auth user id from active membership', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);
    mockMembersService.findOne.mockResolvedValue({ id: 'member-1' });

    const userId = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6';
    const context = createContext({
      organizationId: TOKEN_ORGANIZATION_ID,
      userId,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMembersService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        isDeleted: false,
        organizationId: TOKEN_ORGANIZATION_ID,
        userId,
      }),
      expect.any(Array),
    );
  });

  it.each([undefined, null, '', 123])(
    'rejects malformed Better Auth user context %s before membership lookup',
    async (userId) => {
      vi.spyOn(reflector, 'get').mockReturnValue(undefined);

      const context = createContext({
        organizationId: TOKEN_ORGANIZATION_ID,
        userId,
      });

      await expectForbidden(guard.canActivate(context));
      expect(mockMembersService.findOne).not.toHaveBeenCalled();
    },
  );

  it('authorizes a UUID Better Auth user id from active membership', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);
    mockMembersService.findOne.mockResolvedValue({ id: 'member-1' });

    const userId = '123e4567-e89b-42d3-a456-426614174000';
    const context = createContext({
      organizationId: TOKEN_ORGANIZATION_ID,
      userId,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMembersService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ userId }),
      expect.any(Array),
    );
  });

  it('does not grant org-admin to an owner-issued API key without an admin scope', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue([
      MemberRole.ADMIN,
      MemberRole.OWNER,
    ]);
    mockMembersService.findOne.mockResolvedValue({
      role: { key: MemberRole.OWNER },
    });

    const context = createContext({
      isApiKey: true,
      organizationId: TOKEN_ORGANIZATION_ID,
      scopes: [ApiKeyScope.VIDEOS_READ],
      userId: USER_ID,
    });

    await expectForbidden(guard.canActivate(context));
  });

  it('grants org-admin only when the API key has an explicit admin scope', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue([
      MemberRole.ADMIN,
      MemberRole.OWNER,
    ]);
    mockMembersService.findOne.mockResolvedValue({
      role: { key: MemberRole.OWNER },
    });

    const context = createContext({
      isApiKey: true,
      organizationId: TOKEN_ORGANIZATION_ID,
      scopes: [ApiKeyScope.ADMIN],
      userId: USER_ID,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
