import type { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import type { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedMode = vi.hoisted(() => ({
  IS_HYBRID_MODE: false,
  IS_LOCAL_MODE: false,
}));

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    IS_HYBRID_MODE: mockedMode.IS_HYBRID_MODE,
    IS_LOCAL_MODE: mockedMode.IS_LOCAL_MODE,
  };
});

describe('CombinedAuthGuard', () => {
  let guard: {
    canActivate: (context: ExecutionContext) => Promise<boolean>;
  };
  let clerkGuard: { canActivate: ReturnType<typeof vi.fn> };
  let apiKeyAuthGuard: { canActivate: ReturnType<typeof vi.fn> };
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
    mockedMode.IS_LOCAL_MODE = mode === 'local';
    mockedMode.IS_HYBRID_MODE = mode === 'hybrid';
    vi.resetModules();

    const { CombinedAuthGuard } = await import('./combined-auth.guard');

    return new CombinedAuthGuard(
      reflector as unknown as Reflector,
      clerkGuard as unknown as ClerkGuard,
      apiKeyAuthGuard as unknown as ApiKeyAuthGuard,
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
    ) as {
      canActivate: (context: ExecutionContext) => Promise<boolean>;
    };
  };

  beforeEach(async () => {
    clerkGuard = {
      canActivate: vi.fn(),
    };
    apiKeyAuthGuard = {
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
    mockedMode.IS_LOCAL_MODE = false;
    mockedMode.IS_HYBRID_MODE = false;
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should use API key authentication when token starts with gf_', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer gf_1234567890abcdef',
        },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);
      apiKeyAuthGuard.canActivate.mockResolvedValue(true);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(apiKeyAuthGuard.canActivate).toHaveBeenCalledWith(
        mockExecutionContext,
      );
      expect(clerkGuard.canActivate).not.toHaveBeenCalled();
    });

    it('should use Clerk authentication when token does not start with gf_', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer jwt_token_here',
        },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);
      clerkGuard.canActivate.mockResolvedValue(true);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(clerkGuard.canActivate).toHaveBeenCalledWith(mockExecutionContext);
      expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
    });

    it('should require Clerk authentication when the authorization header is missing', async () => {
      const mockRequest = {
        headers: {},
      };

      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);
      clerkGuard.canActivate.mockResolvedValue(true);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(clerkGuard.canActivate).toHaveBeenCalledWith(mockExecutionContext);
      expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
    });

    it('should handle Clerk guard returning false', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer invalid_jwt',
        },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);
      clerkGuard.canActivate.mockResolvedValue(false);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
      expect(clerkGuard.canActivate).toHaveBeenCalled();
    });

    it('should handle API key guard returning false', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer gf_invalid_key',
        },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);
      apiKeyAuthGuard.canActivate.mockResolvedValue(false);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
      expect(apiKeyAuthGuard.canActivate).toHaveBeenCalled();
    });

    it('should handle Observable returned from Clerk guard', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer jwt_token',
        },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);
      clerkGuard.canActivate.mockReturnValue(of(true));

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(clerkGuard.canActivate).toHaveBeenCalled();
    });

    it('should handle Observable returning false from Clerk guard', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer jwt_token',
        },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);
      clerkGuard.canActivate.mockReturnValue(of(false));

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(false);
    });

    it('should fall back to Clerk authentication when the Bearer token is blank', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer ',
        },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);
      clerkGuard.canActivate.mockResolvedValue(true);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(clerkGuard.canActivate).toHaveBeenCalledWith(mockExecutionContext);
      expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
    });

    it('should fall back to Clerk authentication when the header is not Bearer formatted', async () => {
      const mockRequest = {
        headers: {
          authorization: 'gf_1234567890',
        },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);
      clerkGuard.canActivate.mockResolvedValue(true);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(clerkGuard.canActivate).toHaveBeenCalledWith(mockExecutionContext);
      expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
    });

    it('should handle mixed case authorization header', async () => {
      const mockRequest = {
        headers: {
          authorization: 'bearer gf_api_key_123',
        },
      };

      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);
      apiKeyAuthGuard.canActivate.mockResolvedValue(true);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(apiKeyAuthGuard.canActivate).toHaveBeenCalled();
    });

    it('should handle errors from Clerk guard', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer jwt_token',
        },
      };

      const error = new Error('Authentication failed');
      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);
      clerkGuard.canActivate.mockRejectedValue(error);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        error,
      );
    });

    it('should handle errors from API key guard', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer gf_invalid',
        },
      };

      const error = new Error('Invalid API key');
      (
        mockExecutionContext.switchToHttp().getRequest as vi.Mock
      ).mockReturnValue(mockRequest);
      apiKeyAuthGuard.canActivate.mockRejectedValue(error);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        error,
      );
    });

    it('injectLocalIdentity attaches the default local user metadata', async () => {
      prisma.organization.findFirst.mockResolvedValue({ id: 'org_1' });
      prisma.user.findFirst.mockResolvedValue({ id: 'user_1' });
      prisma.brand.findFirst.mockResolvedValue({ id: 'brand_1' });

      const mockRequest: { user?: Record<string, unknown> } = {};

      await (
        guard as { injectLocalIdentity: (request: object) => Promise<void> }
      ).injectLocalIdentity(mockRequest);

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

    it('injectLocalIdentity leaves existing request users untouched', async () => {
      const existingUser = { id: 'existing-user' };
      const mockRequest = {
        user: existingUser,
      };

      await (
        guard as { injectLocalIdentity: (request: object) => Promise<void> }
      ).injectLocalIdentity(mockRequest);

      expect(mockRequest.user).toBe(existingUser);
      expect(prisma.organization.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.brand.findFirst).not.toHaveBeenCalled();
    });
  });
});
