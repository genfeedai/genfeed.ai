import { McpAuthGuard, PUBLIC_KEY } from '@mcp/guards/mcp-auth.guard';
import { AuthService } from '@mcp/services/auth.service';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpAuthGuard,
        { provide: AuthService, useValue: mockAuthService },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get<McpAuthGuard>(McpAuthGuard);
    _authService = module.get<AuthService>(AuthService);
    _reflector = module.get<Reflector>(Reflector);
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
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
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
    });

    it('should allow access and attach context for valid token', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockAuthService.extractBearerToken.mockReturnValue('valid-token');
      mockAuthService.authenticateRequest.mockResolvedValue({
        organizationId: 'org-123',
        userId: 'user-456',
        valid: true,
      });

      const mockRequest: any = {
        headers: { authorization: 'Bearer valid-token' },
      };
      const context = {
        getClass: vi.fn(),
        getHandler: vi.fn(),
        switchToHttp: vi.fn().mockReturnValue({
          getRequest: vi.fn().mockReturnValue(mockRequest),
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

      const mockRequest: any = {
        headers: { authorization: `Bearer ${apiKey}` },
      };
      const context = {
        getClass: vi.fn(),
        getHandler: vi.fn(),
        switchToHttp: vi.fn().mockReturnValue({
          getRequest: vi.fn().mockReturnValue(mockRequest),
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
  });
});
