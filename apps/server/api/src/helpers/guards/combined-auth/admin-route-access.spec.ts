import type { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import type { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  type ExecutionContext,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedMode = vi.hoisted(() => ({ betterAuthEnabled: true }));

vi.mock('@genfeedai/auth-client/server', () => ({
  isBetterAuthEnabled: () => mockedMode.betterAuthEnabled,
}));

interface AdminRouteRequest {
  headers: Record<string, string>;
  ip: string;
  user?: Record<string, unknown>;
}

/**
 * Chains the global authentication guard and the roles guard the way Nest runs
 * them for a `@Roles('superadmin')` route.
 */
describe('admin route access', () => {
  let authenticate: (context: ExecutionContext) => Promise<boolean>;
  let rolesGuard: RolesGuard;
  let betterAuthGuard: { canActivate: ReturnType<typeof vi.fn> };
  let prisma: {
    brand: { findFirst: ReturnType<typeof vi.fn> };
    organization: { findFirst: ReturnType<typeof vi.fn> };
    user: { findFirst: ReturnType<typeof vi.fn> };
  };
  let membersService: { findOne: ReturnType<typeof vi.fn> };

  const contextFor = (req: AdminRouteRequest): ExecutionContext =>
    ({
      getClass: vi.fn(),
      getHandler: vi.fn(),
      switchToHttp: () => ({ getRequest: () => req }),
    }) as unknown as ExecutionContext;

  async function setUp(isBetterAuthEnabled: boolean) {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
    vi.stubEnv('ADMIN_ALLOWED_IPS', '127.0.0.1');
    mockedMode.betterAuthEnabled = isBetterAuthEnabled;
    vi.resetModules();

    const { CombinedAuthGuard } = await import('./combined-auth.guard');
    const reflector = {
      get: vi.fn((key: string) =>
        key === ROLES_KEY ? ['superadmin'] : undefined,
      ),
      getAllAndOverride: vi.fn().mockReturnValue(false),
    };
    const authGuard = new CombinedAuthGuard(
      reflector as unknown as Reflector,
      { canActivate: vi.fn() } as unknown as ApiKeyAuthGuard,
      prisma as unknown as PrismaService,
      { error: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
      betterAuthGuard as unknown as BetterAuthGuard,
      {
        hydrate: vi.fn().mockResolvedValue(undefined),
      } as unknown as RequestContextMiddleware,
    );
    authenticate = (context) => authGuard.canActivate(context);
    rolesGuard = new RolesGuard(
      reflector as unknown as Reflector,
      membersService as unknown as MembersService,
    );
  }

  async function runGuards(req: AdminRouteRequest): Promise<boolean> {
    const context = contextFor(req);
    await authenticate(context);
    return rolesGuard.canActivate(context);
  }

  beforeEach(() => {
    betterAuthGuard = { canActivate: vi.fn() };
    membersService = { findOne: vi.fn() };
    prisma = {
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand_1' }) },
      organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org_1' }) },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'user_1' }) },
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('blocks a non-admin token holder with 403 when login is on', async () => {
    await setUp(true);
    const req: AdminRouteRequest = {
      headers: { authorization: 'Bearer member.jwt.token' },
      ip: '198.51.100.9',
    };
    betterAuthGuard.canActivate.mockImplementation(() => {
      req.user = {
        id: 'user_member',
        isSuperAdmin: false,
        organizationId: 'org_1',
        userId: 'user_member',
      };
      return true;
    });

    const outcome = await runGuards(req).catch((error: unknown) => error);

    expect(outcome).toBeInstanceOf(HttpException);
    expect((outcome as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(membersService.findOne).not.toHaveBeenCalled();
  });

  it('lets a superadmin token holder from an allowlisted address through', async () => {
    await setUp(true);
    const req: AdminRouteRequest = {
      headers: { authorization: 'Bearer admin.jwt.token' },
      ip: '127.0.0.1',
    };
    betterAuthGuard.canActivate.mockImplementation(() => {
      req.user = {
        id: 'user_admin',
        isSuperAdmin: true,
        organizationId: 'org_1',
        userId: 'user_admin',
      };
      return true;
    });

    await expect(runGuards(req)).resolves.toBe(true);
  });

  it.each([
    ['login on, from loopback', true, '127.0.0.1'],
    ['login on, from a remote address', true, '198.51.100.9'],
    ['login off, from a remote address', false, '198.51.100.9'],
  ])(
    'answers a tokenless admin request with 401 (%s)',
    async (_label, isBetterAuthEnabled, ip) => {
      await setUp(isBetterAuthEnabled);
      betterAuthGuard.canActivate.mockRejectedValue(
        new UnauthorizedException('No token provided'),
      );
      const req: AdminRouteRequest = { headers: {}, ip };

      await expect(runGuards(req)).rejects.toThrow(UnauthorizedException);
      expect(req.user).toBeUndefined();
    },
  );

  it('keeps the seeded local admin for loopback when login is off', async () => {
    await setUp(false);
    const req: AdminRouteRequest = { headers: {}, ip: '127.0.0.1' };

    await expect(runGuards(req)).resolves.toBe(true);
    expect(req.user).toEqual(
      expect.objectContaining({ id: 'user_1', isSuperAdmin: true }),
    );
  });
});
