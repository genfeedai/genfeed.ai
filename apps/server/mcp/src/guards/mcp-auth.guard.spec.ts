import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import { McpAuthGuard } from '@mcp/guards/mcp-auth.guard';
import { AuthService } from '@mcp/services/auth.service';
import { RateLimitService } from '@mcp/services/rate-limit.service';
import {
  ExecutionContext,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

describe('McpAuthGuard', () => {
  let guard: McpAuthGuard;
  let _authService: AuthService;
  let _reflector: Reflector;

  const mockAuthService = {
    authenticateRequest: vi.fn(),
    extractBearerToken: vi.fn(),
  };

  const mockReflector = {
    getAllAndOverride: vi.fn(),
  };

  const allowedResult = {
    allowed: true,
    limit: 60,
    remaining: 59,
    resetAt: 0,
    retryAfterSeconds: 0,
  };

  const mockRateLimitService = {
    consume: vi.fn(),
    keyFor: vi.fn().mockReturnValue('mcp:ratelimit:tok:abc'),
  };

  const mockResponse = { setHeader: vi.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpAuthGuard,
        { provide: AuthService, useValue: mockAuthService },
        { provide: RateLimitService, useValue: mockRateLimitService },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get<McpAuthGuard>(McpAuthGuard);
    _authService = module.get<AuthService>(AuthService);
    _reflector = module.get<Reflector>(Reflector);
    mockRateLimitService.consume.mockResolvedValue(allowedResult);
    mockRateLimitService.keyFor.mockReturnValue('mcp:ratelimit:tok:abc');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createMockExecutionContext = (
    authHeader?: string,
  ): ExecutionContext => {
    return {
      getClass: vi.fn(),
      getHandler: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({
          headers: {
            authorization: authHeader,
          },
        }),
        getResponse: vi.fn().mockReturnValue(mockResponse),
      }),
    } as unknown as ExecutionContext;
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow access to public routes', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(true);
      const context = createMockExecutionContext();

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
        IS_PUBLIC_KEY,
        [context.getHandler(), context.getClass()],
      );
    });

    it('should throw UnauthorizedException when no auth header', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockAuthService.extractBearerToken.mockReturnValue(null);
      const context = createMockExecutionContext();

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Authorization header with Bearer token required',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('resource_metadata='),
      );
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockAuthService.extractBearerToken.mockReturnValue('invalid-token');
      mockAuthService.authenticateRequest.mockResolvedValue({
        error: 'Invalid token',
        valid: false,
      });
      const context = createMockExecutionContext('Bearer invalid-token');

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow('Invalid token');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('resource_metadata='),
      );
    });

    it('should allow access and attach context for valid token', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockAuthService.extractBearerToken.mockReturnValue('valid-token');
      mockAuthService.authenticateRequest.mockResolvedValue({
        organizationId: 'org-123',
        userId: 'user-456',
        valid: true,
      });

      const mockRequest: {
        authContext?: Record<string, unknown>;
        headers: { authorization: string };
      } = {
        headers: { authorization: 'Bearer valid-token' },
      };
      const context = {
        getClass: vi.fn(),
        getHandler: vi.fn(),
        switchToHttp: vi.fn().mockReturnValue({
          getRequest: vi.fn().mockReturnValue(mockRequest),
          getResponse: vi.fn().mockReturnValue(mockResponse),
        }),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockRequest.authContext).toEqual({
        organizationId: 'org-123',
        role: 'user',
        token: 'valid-token',
        userId: 'user-456',
      });
    });

    it('should validate API key format', async () => {
      const apiKey = `gf_${'a'.repeat(30)}`;
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockAuthService.extractBearerToken.mockReturnValue(apiKey);
      mockAuthService.authenticateRequest.mockResolvedValue({
        organizationId: 'org-789',
        userId: 'user-101',
        valid: true,
      });

      const mockRequest: {
        authContext?: Record<string, unknown>;
        headers: { authorization: string };
      } = {
        headers: { authorization: `Bearer ${apiKey}` },
      };
      const context = {
        getClass: vi.fn(),
        getHandler: vi.fn(),
        switchToHttp: vi.fn().mockReturnValue({
          getRequest: vi.fn().mockReturnValue(mockRequest),
          getResponse: vi.fn().mockReturnValue(mockResponse),
        }),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockAuthService.authenticateRequest).toHaveBeenCalledWith(apiKey);
    });

    it('should use default error message when none provided', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockAuthService.extractBearerToken.mockReturnValue('bad-token');
      mockAuthService.authenticateRequest.mockResolvedValue({
        valid: false,
      });
      const context = createMockExecutionContext('Bearer bad-token');

      await expect(guard.canActivate(context)).rejects.toThrow('Invalid token');
    });

    it('throws 429 when the rate limit is exceeded, before auth runs', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockAuthService.extractBearerToken.mockReturnValue('some-token');
      mockRateLimitService.consume.mockResolvedValue({
        allowed: false,
        limit: 60,
        remaining: 0,
        resetAt: 123,
        retryAfterSeconds: 42,
      });
      const context = createMockExecutionContext('Bearer some-token');

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: 429,
      });
      expect(guard.canActivate(context)).rejects.toBeInstanceOf(HttpException);
      // Auth must not run once the caller is over the limit.
      expect(mockAuthService.authenticateRequest).not.toHaveBeenCalled();
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '42');
    });
  });

  // Exercises the REAL static gate (no mocks) — this is the logic that actually
  // denies/allows role-gated MCP tools once the caller's role is threaded in.
  describe('checkToolRole (role gate)', () => {
    it('denies a user-tier caller a tool requiring admin', () => {
      expect(() => McpAuthGuard.checkToolRole('user', 'admin')).toThrow(
        "Tool requires 'admin' role, but user has 'user'",
      );
    });

    it('denies a user-tier caller a tool requiring superadmin', () => {
      expect(() => McpAuthGuard.checkToolRole('user', 'superadmin')).toThrow();
    });

    it('allows an admin caller an admin-gated tool', () => {
      expect(() => McpAuthGuard.checkToolRole('admin', 'admin')).not.toThrow();
    });

    it('allows a higher tier to satisfy a lower requirement', () => {
      expect(() => McpAuthGuard.checkToolRole('admin', 'user')).not.toThrow();
      expect(() =>
        McpAuthGuard.checkToolRole('superadmin', 'admin'),
      ).not.toThrow();
    });

    it('allows a user-tier caller a user-gated tool', () => {
      expect(() => McpAuthGuard.checkToolRole('user', 'user')).not.toThrow();
    });

    it('denies by default when no required role is defined', () => {
      expect(() => McpAuthGuard.checkToolRole('superadmin', undefined)).toThrow(
        'deny-by-default',
      );
    });
  });

  describe('hasRequiredRole (hierarchy)', () => {
    it('honors the user < admin < superadmin hierarchy', () => {
      expect(AuthService.hasRequiredRole('admin', 'admin')).toBe(true);
      expect(AuthService.hasRequiredRole('superadmin', 'admin')).toBe(true);
      expect(AuthService.hasRequiredRole('admin', 'user')).toBe(true);
      expect(AuthService.hasRequiredRole('user', 'admin')).toBe(false);
      expect(AuthService.hasRequiredRole('admin', 'superadmin')).toBe(false);
    });
  });
});
