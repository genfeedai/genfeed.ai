import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CombinedAuthGuard } from '@api/helpers/guards/combined-auth/combined-auth.guard';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

describe('CombinedAuthGuard', () => {
  let guard: CombinedAuthGuard;
  let clerkGuard: vi.Mocked<ClerkGuard>;
  let apiKeyAuthGuard: vi.Mocked<ApiKeyAuthGuard>;

  const mockExecutionContext = {
    getClass: vi.fn(),
    getHandler: vi.fn(),
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn(),
    }),
  } as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CombinedAuthGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: vi.fn().mockReturnValue(false),
          },
        },
        {
          provide: ClerkGuard,
          useValue: {
            canActivate: vi.fn(),
          },
        },
        {
          provide: ApiKeyAuthGuard,
          useValue: {
            canActivate: vi.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<CombinedAuthGuard>(CombinedAuthGuard);
    clerkGuard = module.get(ClerkGuard);
    apiKeyAuthGuard = module.get(ApiKeyAuthGuard);

    vi.clearAllMocks();
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

    it('should use Clerk authentication when no authorization header is present', async () => {
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

    it('should handle authorization header with no token', async () => {
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
      expect(clerkGuard.canActivate).toHaveBeenCalled();
      expect(apiKeyAuthGuard.canActivate).not.toHaveBeenCalled();
    });

    it('should handle authorization header without Bearer prefix', async () => {
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
      // Should fall through to Clerk guard since there's no proper Bearer token
      expect(clerkGuard.canActivate).toHaveBeenCalled();
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
  });
});
