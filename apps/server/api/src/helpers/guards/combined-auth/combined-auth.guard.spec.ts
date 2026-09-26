import type { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { OPTIONAL_AUTH_KEY } from '@api/helpers/decorators/optional-auth.decorator';
import type { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedMode = vi.hoisted(() => ({
  betterAuthEnabled: true,
}));

vi.mock('@genfeedai/auth-client/server', () => ({
  isBetterAuthEnabled: () => mockedMode.betterAuthEnabled,
}));

describe('CombinedAuthGuard', () => {
  let guard: {
    canActivate: (context: ExecutionContext) => Promise<boolean>;
  };
  let apiKeyAuthGuard: { canActivate: ReturnType<typeof vi.fn> };
  let betterAuthGuard: { canActivate: ReturnType<typeof vi.fn> };
  let requestContextMiddleware: { hydrate: ReturnType<typeof vi.fn> };
  let prisma: {
    brand: { findFirst: ReturnType<typeof vi.fn> };
    organization: { findFirst: ReturnType<typeof vi.fn> };
    user: { findFirst: ReturnType<typeof vi.fn> };
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let reflector: {
    getAllAndOverride: ReturnType<typeof vi.fn>;
  };

  const mockExecutionContext = {
    getClass: vi.fn(),
    getHandler: vi.fn(),
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn(),
    }),
  } as ExecutionContext;

  const instantiateGuard = async (
    mode: 'cloud' | 'hybrid' | 'local' = 'cloud',
  ) => {
    vi.stubEnv('GENFEED_CLOUD', mode === 'cloud' ? '1' : undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
    mockedMode.betterAuthEnabled = mode !== 'local';
    vi.resetModules();

    const { CombinedAuthGuard } = await import('./combined-auth.guard');

    return new CombinedAuthGuard(
      reflector as unknown as Reflector,
      apiKeyAuthGuard as unknown as ApiKeyAuthGuard,
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
      betterAuthGuard as unknown as BetterAuthGuard,
      requestContextMiddleware as unknown as RequestContextMiddleware,
    ) as {
      canActivate: (context: ExecutionContext) => Promise<boolean>;
    };
  };

  beforeEach(async () => {
    apiKeyAuthGuard = {
      canActivate: vi.fn(),
    };
    betterAuthGuard = {
      canActivate: vi.fn(),
    };
    requestContextMiddleware = {
      hydrate: vi.fn().mockResolvedValue(undefined),
    };
    prisma = {
      brand: { findFirst: vi.fn() },
      organization: { findFirst: vi.fn() },
      user: { findFirst: vi.fn() },
    };
    prisma.organization.findFirst.mockResolvedValue({ id: 'org_1' });
    prisma.user.findFirst.mockResolvedValue({ id: 'user_1' });
    prisma.brand.findFirst.mockResolvedValue({ id: 'brand_1' });
    logger = {
      error: vi.fn(),
      warn: vi.fn(),
    };
    reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    };
    guard = await instantiateGuard('cloud');

    vi.clearAllMocks();
  });

  afterAll(() => {
    mockedMode.betterAuthEnabled = true;
    vi.unstubAllEnvs();
  });

  it('is defined', () => {
    expect(guard).toBeDefined();
  });

  it('rejects a gf_ key presented in the query string even on a public route', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const mockRequest = {
      headers: {},
      query: { api_key: 'gf_live_should-not-be-here' },
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
    expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('rejects a gf_ key presented as a path segment', async () => {
    const mockRequest = {
      headers: { authorization: 'Bearer jwt_token_here' },
      path: '/v1/gf_test_abc/posts',
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
    expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('allows a public webhook token query that is not a gf_ key', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const mockRequest = {
      headers: {},
      path: '/webhooks/heygen',
      query: { token: 'vendor-shared-secret' },
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  function useOptionalAuth(authorization?: string) {
    reflector.getAllAndOverride.mockImplementation(
      (key: string) => key === OPTIONAL_AUTH_KEY,
    );
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      authorization === undefined
        ? { headers: {} }
        : { headers: { authorization } },
    );
  }

  it('allows optional auth when the Authorization header is absent', async () => {
    useOptionalAuth();

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
    expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['basic', 'Basic abc'],
    ['empty bearer', 'Bearer'],
    ['blank bearer', 'Bearer   '],
    ['malformed', 'Token abc'],
    ['surplus fields', 'Bearer gf_1234567890abcdef extra'],
    ['multiple surplus fields', 'Bearer session-token extra more'],
  ])(
    'rejects a presented %s Authorization header on optional auth',
    async (_label, authorization) => {
      useOptionalAuth(authorization);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
      expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
    },
  );

  it('never treats a gf_ key with surplus fields as a valid API key on a required-auth route', async () => {
    // Before this fix, resolveBearerToken silently truncated
    // `Bearer gf_<key> extra` down to `gf_<key>` and routed it to
    // ApiKeyAuthGuard as if it were a well-formed key. A presented header
    // that fails strict parsing is now rejected by the guard itself, before
    // either downstream guard is ever consulted.
    const mockRequest = {
      headers: { authorization: 'Bearer gf_1234567890abcdef extra' },
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
    expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it.each([
    ['surplus fields on a session token', 'Bearer session-token extra'],
    ['single field', 'Bearer'],
    ['blank bearer', 'Bearer   '],
  ])(
    // Only a header that attempts the Bearer scheme but fails strict
    // parsing is rejected outright at the guard level — see the
    // `isBearerScheme` tests below for headers presenting a different
    // scheme entirely (e.g. an nginx reverse-proxy's Basic auth).
    'rejects a %s Authorization header outright on required auth, without deferring to either guard',
    async (_label, authorization) => {
      const mockRequest = { headers: { authorization } };
      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
      expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['a foreign scheme (nginx Basic-auth proxy)', 'Basic dXNlcjpwYXNz'],
    ['an unrecognized scheme', 'Token abc'],
    ['an empty header (no scheme presented at all)', ''],
  ])(
    // A header that presents no Bearer credential at all — a different
    // scheme, or nothing recognizable — carries no attempted Bearer token,
    // so it is treated the same as an absent header and deferred to Better
    // Auth, which still ends in 401 on a required-auth route.
    'defers a %s Authorization header to Better Auth on required auth (which rejects it)',
    async (_label, authorization) => {
      const mockRequest = { headers: { authorization } };
      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);
      betterAuthGuard.canActivate.mockRejectedValue(
        new UnauthorizedException('Unauthorized'),
      );

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
      expect(betterAuthGuard.canActivate).toHaveBeenCalledWith(
        mockExecutionContext,
      );
    },
  );

  it('rejects a bearer token the token guard refuses on optional auth', async () => {
    useOptionalAuth('Bearer session-token');
    betterAuthGuard.canActivate.mockRejectedValue(
      new UnauthorizedException('Unauthorized'),
    );

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('validates a bearer token on optional auth', async () => {
    useOptionalAuth('Bearer session-token');
    betterAuthGuard.canActivate.mockResolvedValue(true);

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    expect(betterAuthGuard.canActivate).toHaveBeenCalledWith(
      mockExecutionContext,
    );
    expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('validates an API key on optional auth', async () => {
    useOptionalAuth('Bearer gf_1234567890abcdef');
    apiKeyAuthGuard.canActivate.mockResolvedValue(true);

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    expect(apiKeyAuthGuard.canActivate).toHaveBeenCalledWith(
      mockExecutionContext,
    );
    expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('rejects a gf_ key in the query on an optional-auth route', async () => {
    reflector.getAllAndOverride.mockImplementation(
      (key: string) => key === OPTIONAL_AUTH_KEY,
    );
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      {
        headers: {},
        query: { api_key: 'gf_live_should-not-be-here' },
      },
    );

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
    expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('allows public routes without invoking auth guards', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const mockRequest = { headers: {} };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );

    const result = await guard.canActivate(mockExecutionContext);

    expect(result).toBe(true);
    expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
    expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
    expect(requestContextMiddleware.hydrate).not.toHaveBeenCalled();
  });

  it('hydrates request.context once Better Auth has set request.user', async () => {
    // RequestContextMiddleware runs before this guard, so req.context is
    // still empty when the token is verified — the guard must fill it in.
    const authenticatedUser = {
      id: 'user_1',
      organizationId: testId('org'),
      userId: 'user_1',
    };
    const mockRequest: { headers: object; user?: object; context?: object } = {
      headers: { authorization: 'Bearer jwt_token_here' },
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );
    betterAuthGuard.canActivate.mockImplementation(async () => {
      mockRequest.user = authenticatedUser;
      return true;
    });

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);

    expect(requestContextMiddleware.hydrate).toHaveBeenCalledTimes(1);
    expect(requestContextMiddleware.hydrate).toHaveBeenCalledWith(mockRequest);
  });

  it('accepts a confirmed organization header matching the authenticated context', async () => {
    const organizationId = testId('org');
    const mockRequest: { headers: object; user?: object } = {
      headers: {
        authorization: 'Bearer jwt_token_here',
        'x-genfeed-organization-id': organizationId,
      },
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );
    betterAuthGuard.canActivate.mockImplementation(async () => {
      mockRequest.user = { id: 'user_1', organizationId, userId: 'user_1' };
      return true;
    });

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
  });

  it('rejects a confirmed organization header that differs from the authenticated context', async () => {
    const mockRequest: { headers: object; user?: object } = {
      headers: {
        authorization: 'Bearer jwt_token_here',
        'x-genfeed-organization-id': testId('route-org'),
      },
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );
    betterAuthGuard.canActivate.mockImplementation(async () => {
      mockRequest.user = {
        id: 'user_1',
        organizationId: testId('token-org'),
        userId: 'user_1',
      };
      return true;
    });

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      ForbiddenException,
    );
    expect(requestContextMiddleware.hydrate).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Rejected authenticated organization context mismatch',
      expect.any(Object),
    );
  });

  it('hydrates request.context after API key authentication', async () => {
    const mockRequest: { headers: object; user?: object } = {
      headers: { authorization: 'Bearer gf_1234567890abcdef' },
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );
    apiKeyAuthGuard.canActivate.mockImplementation(async () => {
      mockRequest.user = { id: 'user_1', organizationId: 'org_1' };
      return true;
    });

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);

    expect(requestContextMiddleware.hydrate).toHaveBeenCalledWith(mockRequest);
  });

  it('leaves an already hydrated request.context untouched', async () => {
    const existingContext = { organizationId: 'org_1', userId: 'user_1' };
    const mockRequest: { headers: object; user?: object; context: object } = {
      context: existingContext,
      headers: { authorization: 'Bearer jwt_token_here' },
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );
    betterAuthGuard.canActivate.mockImplementation(async () => {
      mockRequest.user = { id: 'user_1', organizationId: 'org_1' };
      return true;
    });

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);

    expect(requestContextMiddleware.hydrate).not.toHaveBeenCalled();
    expect(mockRequest.context).toBe(existingContext);
  });

  it('does not hydrate request.context when authentication is rejected', async () => {
    const mockRequest = {
      headers: { authorization: 'Bearer jwt_token_here' },
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );
    betterAuthGuard.canActivate.mockResolvedValue(false);

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(false);

    expect(requestContextMiddleware.hydrate).not.toHaveBeenCalled();
  });

  it('still allows the request when context hydration throws', async () => {
    const mockRequest: { headers: object; user?: object } = {
      headers: { authorization: 'Bearer jwt_token_here' },
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );
    betterAuthGuard.canActivate.mockImplementation(async () => {
      mockRequest.user = { id: 'user_1', organizationId: 'org_1' };
      return true;
    });
    requestContextMiddleware.hydrate.mockRejectedValue(new Error('redis down'));

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);

    expect(logger.error).toHaveBeenCalled();
  });

  it('uses API key authentication when bearer token starts with gf_', async () => {
    const mockRequest = {
      headers: {
        authorization: 'Bearer gf_1234567890abcdef',
      },
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );
    apiKeyAuthGuard.canActivate.mockResolvedValue(true);

    const result = await guard.canActivate(mockExecutionContext);

    expect(result).toBe(true);
    expect(apiKeyAuthGuard.canActivate).toHaveBeenCalledWith(
      mockExecutionContext,
    );
    expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('still routes a lowercase "bearer gf_..." scheme to API key authentication', async () => {
    // RFC 7235: scheme names are case-insensitive. CombinedAuthGuard already
    // recognized `bearer` case-insensitively here; the companion bug (fixed
    // alongside this) was that ApiKeyAuthGuard's own parsing then rejected
    // that same header because it compared the scheme case-sensitively.
    const mockRequest = {
      headers: {
        authorization: 'bearer gf_1234567890abcdef',
      },
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );
    apiKeyAuthGuard.canActivate.mockResolvedValue(true);

    const result = await guard.canActivate(mockExecutionContext);

    expect(result).toBe(true);
    expect(apiKeyAuthGuard.canActivate).toHaveBeenCalledWith(
      mockExecutionContext,
    );
    expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('uses Better Auth for non-api-key bearer tokens', async () => {
    const mockRequest = {
      headers: {
        authorization: 'Bearer jwt_token_here',
      },
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );
    betterAuthGuard.canActivate.mockResolvedValue(true);

    const result = await guard.canActivate(mockExecutionContext);

    expect(result).toBe(true);
    expect(betterAuthGuard.canActivate).toHaveBeenCalledWith(
      mockExecutionContext,
    );
    expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('uses Better Auth when the authorization header is missing in cloud mode', async () => {
    const mockRequest = { headers: {} };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );
    betterAuthGuard.canActivate.mockResolvedValue(true);

    const result = await guard.canActivate(mockExecutionContext);

    expect(result).toBe(true);
    expect(betterAuthGuard.canActivate).toHaveBeenCalledWith(
      mockExecutionContext,
    );
    expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('passes Observable results through from Better Auth', async () => {
    const mockRequest = {
      headers: {
        authorization: 'Bearer jwt_token',
      },
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );
    betterAuthGuard.canActivate.mockReturnValue(of(true));

    const result = await guard.canActivate(mockExecutionContext);

    expect(result).toBe(true);
  });

  it('passes Better Auth errors through', async () => {
    const mockRequest = {
      headers: {
        authorization: 'Bearer jwt_token',
      },
    };
    const error = new Error('Authentication failed');
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );
    betterAuthGuard.canActivate.mockRejectedValue(error);

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      error,
    );
  });

  it('injects default local identity in local mode', async () => {
    guard = await instantiateGuard('local');
    const mockRequest: { user?: Record<string, unknown>; headers: object } = {
      headers: {},
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );

    const result = await guard.canActivate(mockExecutionContext);

    expect(result).toBe(true);
    expect(mockRequest.user).toEqual(
      expect.objectContaining({
        brandId: 'brand_1',
        id: 'user_1',
        isSuperAdmin: true,
        organizationId: 'org_1',
        userId: 'user_1',
      }),
    );
  });

  it('rejects cloud-required routes in local mode', async () => {
    guard = await instantiateGuard('local');
    reflector.getAllAndOverride.mockImplementation(
      (key: string) => key === 'requiresCloudAuth',
    );
    const mockRequest = { headers: {} };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('injects local identity for hybrid requests without a token', async () => {
    guard = await instantiateGuard('hybrid');
    const mockRequest: { user?: Record<string, unknown>; headers: object } = {
      headers: {},
    };
    (mockExecutionContext.switchToHttp().getRequest as vi.Mock).mockReturnValue(
      mockRequest,
    );

    const result = await guard.canActivate(mockExecutionContext);

    expect(result).toBe(true);
    expect(mockRequest.user).toEqual(
      expect.objectContaining({
        brandId: 'brand_1',
        id: 'user_1',
        organizationId: 'org_1',
        userId: 'user_1',
      }),
    );
    expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it.each([
    ['surplus fields', 'Bearer gf_1234567890abcdef extra'],
    ['single field', 'Bearer'],
    ['blank bearer', 'Bearer   '],
  ])(
    'rejects a %s Authorization header in hybrid mode instead of downgrading to local identity',
    async (_label, authorization) => {
      // A presented header that attempts the Bearer scheme but fails strict
      // parsing must never be treated the same as an absent one: absent
      // means "no credential attempted" (anonymous, local super-admin),
      // while a malformed Bearer attempt must fail closed with 401.
      guard = await instantiateGuard('hybrid');
      const mockRequest: { user?: Record<string, unknown>; headers: object } = {
        headers: { authorization },
      };
      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRequest.user).toBeUndefined();
      expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
      expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['a foreign scheme (nginx Basic-auth proxy)', 'Basic dXNlcjpwYXNz'],
    ['an unrecognized scheme', 'Token abc'],
    ['an empty header (no scheme presented at all)', ''],
  ])(
    // A header presenting no Bearer credential at all — some other scheme,
    // or nothing recognizable — carries no attempted Bearer token, so
    // HYBRID mode treats it exactly like an absent header: local identity,
    // not a 401. This is the fix for a real deployment shape (an nginx
    // reverse-proxy adding its own `Authorization: Basic ...` in front of a
    // self-hosted instance), which must not be rejected as if it were a
    // malformed Bearer credential.
    'injects local identity for a %s Authorization header in hybrid mode (same as absent)',
    async (_label, authorization) => {
      guard = await instantiateGuard('hybrid');
      const mockRequest: { user?: Record<string, unknown>; headers: object } = {
        headers: { authorization },
      };
      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(mockRequest.user).toEqual(
        expect.objectContaining({
          brandId: 'brand_1',
          id: 'user_1',
          organizationId: 'org_1',
          userId: 'user_1',
        }),
      );
      expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
      expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
    },
  );
});
