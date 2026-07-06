import { MembersService } from '@api/collections/members/services/members.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
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

const TOKEN_ORGANIZATION_ID = '000000000000000000000001';
const REQUEST_ORGANIZATION_ID = '000000000000000000000002';
const USER_ID = '000000000000000000000003';

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
        publicMetadata: {
          organization: TOKEN_ORGANIZATION_ID,
          user: USER_ID,
        },
      },
      {
        body: { organization: TOKEN_ORGANIZATION_ID },
        params: { organizationId: TOKEN_ORGANIZATION_ID },
      },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMembersService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        organization: TOKEN_ORGANIZATION_ID,
        user: USER_ID,
      }),
      expect.any(Array),
    );
  });

  it('rejects mismatched route organization when token organization exists', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);

    const context = createContext(
      {
        publicMetadata: {
          organization: TOKEN_ORGANIZATION_ID,
          user: USER_ID,
        },
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
        publicMetadata: {
          organization: TOKEN_ORGANIZATION_ID,
          user: USER_ID,
        },
      },
      { body: { organization: REQUEST_ORGANIZATION_ID } },
    );

    await expectForbidden(guard.canActivate(context));
    expect(mockMembersService.findOne).not.toHaveBeenCalled();
  });

  it('uses explicit route organization when token organization is absent', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);
    mockMembersService.findOne.mockResolvedValue({ id: 'member-1' });

    const context = createContext(
      {
        publicMetadata: {
          user: USER_ID,
        },
      },
      { params: { organizationId: REQUEST_ORGANIZATION_ID } },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMembersService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        organization: REQUEST_ORGANIZATION_ID,
        user: USER_ID,
      }),
      expect.any(Array),
    );
  });

  it('keeps superadmin bypass ahead of organization mismatch checks', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(['superadmin']);

    const context = createContext(
      {
        publicMetadata: {
          isSuperAdmin: true,
          organization: TOKEN_ORGANIZATION_ID,
          user: USER_ID,
        },
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
    const context = createContext({ publicMetadata: {} });
    await expect(guard.canActivate(context)).resolves.toBe(true);
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
          user: { publicMetadata: {} },
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(localGuard.canActivate(context)).rejects.toThrow(
      HttpException,
    );
  });

  it('denies organization admins when a route requires platform superadmin', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(['superadmin']);

    const organizationId = 'b13yktd0f1e38me3f55swu0n';
    const userId = 'hkh2jbovtpcsrzw3oyxr11oj';
    const context = createContext({
      publicMetadata: {
        isSuperAdmin: false,
        organization: organizationId,
        role: 'admin',
        user: userId,
      },
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
          params: { organizationId: '507f1f77bcf86cd799439011' },
          user: {
            publicMetadata: { organization: '507f1f77bcf86cd799439011' },
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

    const organizationId = 'b13yktd0f1e38me3f55swu0n';
    const userId = 'hkh2jbovtpcsrzw3oyxr11oj';
    const context = {
      getClass: vi.fn(),
      getHandler: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          body: {},
          params: { organizationId },
          user: {
            publicMetadata: {
              organization: organizationId,
              user: userId,
            },
          },
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMembersService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        organization: organizationId,
        user: userId,
      }),
      expect.any(Array),
    );
  });
});
