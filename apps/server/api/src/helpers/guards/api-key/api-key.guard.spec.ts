import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { createMockExecutionContext } from '@test/mocks/controller.mocks';
import { mockRequest as buildMockRequest } from '@test/mocks/service.mocks';

describe('ApiKeyAuthGuard', () => {
  let guard: ApiKeyAuthGuard;
  let apiKeysService: ApiKeysService;
  let reflector: Reflector;
  let request: ReturnType<typeof buildMockRequest>;
  let mockContext: ExecutionContext;

  const mockApiKey = {
    _id: '507f1f77bcf86cd799439011',
    allowedIps: ['192.168.1.1'],
    createdAt: new Date(),
    isRevoked: false,
    key: 'hashed_key_value',
    name: 'Test API Key',
    organization: '507f1f77bcf86cd799439013',
    rateLimit: 60,
    scopes: ['videos:create', 'videos:read'],
    updatedAt: new Date(),
    usageCount: 0,
    user: '507f1f77bcf86cd799439012',
  };

  beforeEach(async () => {
    request = buildMockRequest({
      connection: { remoteAddress: '192.168.1.1' },
      headers: { authorization: 'Bearer gf_test_abc123' },
      ip: '192.168.1.1',
      user: null,
    });
    mockContext = createMockExecutionContext({ request });

    const mockApiKeysService = {
      checkRateLimit: vi.fn(),
      findByKey: vi.fn(),
      hasScope: vi.fn(),
      isIpAllowed: vi.fn(),
      updateLastUsed: vi.fn(),
    };

    const mockReflector = {
      get: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyAuthGuard,
        {
          provide: ApiKeysService,
          useValue: mockApiKeysService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<ApiKeyAuthGuard>(ApiKeyAuthGuard);
    apiKeysService = module.get<ApiKeysService>(ApiKeysService);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should throw UnauthorizedException when no authorization header', async () => {
      request = buildMockRequest({ ...request, headers: {} });
      mockContext = createMockExecutionContext({ request });

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('API key required'),
      );
    });

    it('should throw UnauthorizedException for invalid authorization format', async () => {
      request = buildMockRequest({
        ...request,
        headers: { authorization: 'InvalidFormat' },
      });
      mockContext = createMockExecutionContext({ request });

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('Invalid authorization format'),
      );
    });

    it('should return true for non-API key tokens', async () => {
      request = buildMockRequest({
        ...request,
        headers: { authorization: 'Bearer jwt_token_123' },
      });
      mockContext = createMockExecutionContext({ request });

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(apiKeysService.findByKey).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid API key', async () => {
      request = buildMockRequest({ ...request });
      mockContext = createMockExecutionContext({ request });
      vi.spyOn(apiKeysService, 'findByKey').mockResolvedValue(null);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired API key'),
      );
    });

    it('should throw UnauthorizedException for IP not allowed', async () => {
      mockContext = createMockExecutionContext({ request });
      vi.spyOn(apiKeysService, 'findByKey').mockResolvedValue(mockApiKey);
      vi.spyOn(apiKeysService, 'isIpAllowed').mockReturnValue(false);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('IP address not allowed'),
      );
    });

    it('should throw UnauthorizedException for rate limit exceeded', async () => {
      mockContext = createMockExecutionContext({ request });
      vi.spyOn(apiKeysService, 'findByKey').mockResolvedValue(mockApiKey);
      vi.spyOn(apiKeysService, 'isIpAllowed').mockReturnValue(true);
      vi.spyOn(apiKeysService, 'checkRateLimit').mockResolvedValue(false);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('Rate limit exceeded'),
      );
    });

    it('should throw UnauthorizedException for insufficient permissions', async () => {
      mockContext = createMockExecutionContext({ request });
      vi.spyOn(apiKeysService, 'findByKey').mockResolvedValue(mockApiKey);
      vi.spyOn(apiKeysService, 'isIpAllowed').mockReturnValue(true);
      vi.spyOn(apiKeysService, 'checkRateLimit').mockResolvedValue(true);
      vi.spyOn(reflector, 'get').mockReturnValue(['images:create']);
      vi.spyOn(apiKeysService, 'hasScope').mockReturnValue(false);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('Insufficient permissions'),
      );
    });

    it('should return true for valid API key with required scopes', async () => {
      mockContext = createMockExecutionContext({ request });
      vi.spyOn(apiKeysService, 'findByKey').mockResolvedValue(mockApiKey);
      vi.spyOn(apiKeysService, 'isIpAllowed').mockReturnValue(true);
      vi.spyOn(apiKeysService, 'checkRateLimit').mockResolvedValue(true);
      vi.spyOn(reflector, 'get').mockReturnValue(['videos:create']);
      vi.spyOn(apiKeysService, 'hasScope').mockReturnValue(true);
      vi.spyOn(apiKeysService, 'updateLastUsed').mockResolvedValue(undefined);

      const result = await guard.canActivate(mockContext);

      // Get the actual request object that the guard mutated
      const mutatedRequest = mockContext.switchToHttp().getRequest();
      expect(result).toBe(true);
      expect(mutatedRequest.user).toEqual({
        publicMetadata: {
          apiKeyId: mockApiKey._id.toString(),
          brand: mockApiKey.organization.toString(),
          isApiKey: true,
          organization: mockApiKey.organization.toString(),
          scopes: mockApiKey.scopes,
          user: mockApiKey.user.toString(),
        },
      });
      expect(apiKeysService.updateLastUsed).toHaveBeenCalledWith(
        mockApiKey._id.toString(),
        '192.168.1.1',
      );
    });

    it('should return true for valid API key without required scopes', async () => {
      mockContext = createMockExecutionContext({ request });
      vi.spyOn(apiKeysService, 'findByKey').mockResolvedValue(mockApiKey);
      vi.spyOn(apiKeysService, 'isIpAllowed').mockReturnValue(true);
      vi.spyOn(apiKeysService, 'checkRateLimit').mockResolvedValue(true);
      vi.spyOn(reflector, 'get').mockReturnValue(null);
      vi.spyOn(apiKeysService, 'updateLastUsed').mockResolvedValue(undefined);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(apiKeysService.hasScope).not.toHaveBeenCalled();
    });

    it('should handle ApiKey authorization type', async () => {
      request = buildMockRequest({
        ...request,
        headers: { authorization: 'ApiKey gf_test_abc123' },
      });
      mockContext = createMockExecutionContext({ request });
      vi.spyOn(apiKeysService, 'findByKey').mockResolvedValue(mockApiKey);
      vi.spyOn(apiKeysService, 'isIpAllowed').mockReturnValue(true);
      vi.spyOn(apiKeysService, 'checkRateLimit').mockResolvedValue(true);
      vi.spyOn(reflector, 'get').mockReturnValue(null);
      vi.spyOn(apiKeysService, 'updateLastUsed').mockResolvedValue(undefined);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should use connection.remoteAddress when ip is not available', async () => {
      request = buildMockRequest({
        connection: { remoteAddress: '192.168.1.2' },
        headers: { authorization: 'Bearer gf_test_abc123' },
        ip: undefined,
        user: null,
      });
      mockContext = createMockExecutionContext({ request });
      vi.spyOn(apiKeysService, 'findByKey').mockResolvedValue(mockApiKey);
      vi.spyOn(apiKeysService, 'isIpAllowed').mockReturnValue(true);
      vi.spyOn(apiKeysService, 'checkRateLimit').mockResolvedValue(true);
      vi.spyOn(reflector, 'get').mockReturnValue(null);
      vi.spyOn(apiKeysService, 'updateLastUsed').mockResolvedValue(undefined);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(apiKeysService.updateLastUsed).toHaveBeenCalledWith(
        mockApiKey._id.toString(),
        '192.168.1.2',
      );
    });
  });
});
