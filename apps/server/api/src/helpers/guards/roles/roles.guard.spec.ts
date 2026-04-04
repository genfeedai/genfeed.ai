import { MembersService } from '@api/collections/members/services/members.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { type ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const createContext = (user?: unknown): ExecutionContext => {
  return {
    getClass: vi.fn(),
    getHandler: vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ body: {}, params: {}, user }),
    }),
  } as unknown as ExecutionContext;
};

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockMembersService = { findOne: vi.fn() };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(
      reflector,
      mockMembersService as unknown as MembersService,
    );
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
});
