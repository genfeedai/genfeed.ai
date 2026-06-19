import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { AuthResult, AuthService } from '@mcp/services/auth.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

const WHOAMI_URL = 'https://api.genfeed.ai/v1/auth/whoami';

function whoamiResponse(data: Record<string, unknown>, status = 200) {
  return of({ data: { data }, status });
}

describe('AuthService (MCP)', () => {
  let service: AuthService;

  // GENFEEDAI_API_URL is configured WITHOUT /v1; the service normalizes it.
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
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
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
    const apiKey = `gf_${'a'.repeat(30)}`;
    const jwtToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${'a'.repeat(30)}`;

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

    it('resolves identity for an API key via the /v1 whoami endpoint', async () => {
      mockHttpService.get.mockReturnValue(
        whoamiResponse({
          isApiKey: true,
          organization: { id: 'org-123' },
          role: 'admin',
          user: { id: 'user-456' },
        }),
      );

      const result: AuthResult = await service.authenticateRequest(apiKey);

      expect(mockHttpService.get).toHaveBeenCalledWith(WHOAMI_URL, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
      });
      expect(result).toMatchObject({
        organizationId: 'org-123',
        role: 'admin',
        userId: 'user-456',
        valid: true,
      });
    });

    it('resolves identity for a Clerk JWT via the same whoami endpoint', async () => {
      mockHttpService.get.mockReturnValue(
        whoamiResponse({
          isApiKey: false,
          organization: { id: 'org-789' },
          role: 'owner',
          user: { id: 'user-123' },
        }),
      );

      const result: AuthResult = await service.authenticateRequest(jwtToken);

      expect(mockHttpService.get).toHaveBeenCalledWith(WHOAMI_URL, {
        headers: { Authorization: `Bearer ${jwtToken}` },
        timeout: 5000,
      });
      // `owner` is the highest org role → maps to the admin MCP tier.
      expect(result).toMatchObject({
        organizationId: 'org-789',
        role: 'admin',
        userId: 'user-123',
        valid: true,
      });
    });

    it('maps non-privileged and missing roles to the user tier', async () => {
      mockHttpService.get.mockReturnValueOnce(
        whoamiResponse({
          organization: { id: 'o' },
          role: 'creator',
          user: { id: 'u' },
        }),
      );
      const creator = await service.authenticateRequest(apiKey);
      expect(creator.role).toBe('user');

      mockHttpService.get.mockReturnValueOnce(
        whoamiResponse({ organization: { id: 'o' }, user: { id: 'u' } }),
      );
      const noRole = await service.authenticateRequest(apiKey);
      expect(noRole.role).toBe('user');
    });

    it('preserves the superadmin tier', async () => {
      mockHttpService.get.mockReturnValue(
        whoamiResponse({
          organization: { id: 'o' },
          role: 'superadmin',
          user: { id: 'u' },
        }),
      );

      const result = await service.authenticateRequest(apiKey);
      expect(result.role).toBe('superadmin');
    });

    it('keeps an empty-role (no membership) caller authenticated at the user tier', async () => {
      // Empty role legitimately occurs (self-hosted single-tenant has no
      // memberships; a removed member). We keep the caller authenticated but
      // deny-by-default for admin tools by mapping to the user tier. The API
      // re-enforces membership on the actual tool calls.
      mockHttpService.get.mockReturnValue(
        whoamiResponse({
          organization: { id: 'o' },
          role: '',
          user: { id: 'u' },
        }),
      );

      const result = await service.authenticateRequest(apiKey);
      expect(result.valid).toBe(true);
      expect(result.role).toBe('user');
    });

    it('returns invalid when whoami responds with a non-200 status', async () => {
      mockHttpService.get.mockReturnValue(whoamiResponse({}, 204));

      const result = await service.authenticateRequest(jwtToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('returns a transient error on network failure', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      const result = await service.authenticateRequest(jwtToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Auth service temporarily unavailable');
    });

    it('returns invalid on a 401 from whoami', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({ response: { status: 401 } })),
      );

      const result = await service.authenticateRequest(jwtToken);
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
