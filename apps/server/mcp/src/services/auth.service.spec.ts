import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { AuthResult, AuthService } from '@mcp/services/auth.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('AuthService (MCP)', () => {
  let service: AuthService;

  const mockConfigService = {
    get: vi.fn().mockReturnValue('https://api.genfeed.ai'),
  };

  const mockHttpService = {
    get: vi.fn(),
    post: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('authenticateRequest', () => {
    it('should return invalid for short token', async () => {
      const result: AuthResult = await service.authenticateRequest('short');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should return invalid for empty token', async () => {
      const result: AuthResult = await service.authenticateRequest('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should validate API key and return user context', async () => {
      const apiKey = `gf_${'a'.repeat(30)}`;
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            organizationId: 'org-123',
            userId: 'user-456',
            valid: true,
          },
          status: 200,
        }),
      );

      const result: AuthResult = await service.authenticateRequest(apiKey);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.genfeed.ai/api-keys/validate',
        { key: apiKey },
        { timeout: 5000 },
      );
      expect(result.valid).toBe(true);
      expect(result.userId).toBe('user-456');
      expect(result.organizationId).toBe('org-123');
    });

    it('should return invalid for invalid API key', async () => {
      const apiKey = `gf_${'a'.repeat(30)}`;
      mockHttpService.post.mockReturnValue(
        of({ data: { valid: false }, status: 200 }),
      );

      const result: AuthResult = await service.authenticateRequest(apiKey);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('should validate JWT token and return user context', async () => {
      const jwtToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${'a'.repeat(30)}`;
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            data: [
              {
                attributes: {
                  organization: 'org-789',
                },
                id: 'user-123',
              },
            ],
          },
          status: 200,
        }),
      );

      const result: AuthResult = await service.authenticateRequest(jwtToken);

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://api.genfeed.ai/accounts',
        {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
          },
          timeout: 5000,
        },
      );
      expect(result.valid).toBe(true);
      expect(result.userId).toBe('user-123');
      expect(result.organizationId).toBe('org-789');
    });

    it('should return invalid with error on non-401 error (network issues)', async () => {
      const jwtToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${'a'.repeat(30)}`;
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      const result: AuthResult = await service.authenticateRequest(jwtToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Auth service temporarily unavailable');
    });

    it('should return invalid on 401 authentication error', async () => {
      const jwtToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${'a'.repeat(30)}`;
      mockHttpService.get.mockReturnValue(
        throwError(() => ({ response: { status: 401 } })),
      );

      const result: AuthResult = await service.authenticateRequest(jwtToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid bearer token');
    });
  });

  describe('extractBearerToken', () => {
    it('should extract token from valid Bearer header', () => {
      const token = service.extractBearerToken('Bearer my-token-123');
      expect(token).toBe('my-token-123');
    });

    it('should return null for missing header', () => {
      const token = service.extractBearerToken(undefined);
      expect(token).toBeNull();
    });

    it('should return null for non-Bearer header', () => {
      const token = service.extractBearerToken('Basic abc123');
      expect(token).toBeNull();
    });

    it('should return null for empty header', () => {
      const token = service.extractBearerToken('');
      expect(token).toBeNull();
    });
  });
});
