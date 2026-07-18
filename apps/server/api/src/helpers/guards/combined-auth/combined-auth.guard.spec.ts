import type { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
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
        id: 'local-admin',
        publicMetadata: expect.objectContaining({
          brand: 'brand_1',
          organization: 'org_1',
          user: 'user_1',
        }),
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
        id: 'local-admin',
      }),
    );
    expect(betterAuthGuard.canActivate).not.toHaveBeenCalled();
  });
});
