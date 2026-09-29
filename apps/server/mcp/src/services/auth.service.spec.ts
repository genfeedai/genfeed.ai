import { MCP_ACTION_ORIGIN_PROOF_HEADER } from '@genfeedai/contracts';
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
    get: vi.fn((key: string) =>
      key === 'GENFEEDAI_API_KEY'
        ? 'internal-service-key'
        : 'https://api.genfeed.ai',
    ),
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
          scopes: ['videos:read'],
          user: { id: 'user-456' },
        }),
      );

      const result: AuthResult = await service.authenticateRequest(apiKey);

      expect(mockHttpService.get).toHaveBeenCalledWith(WHOAMI_URL, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          [MCP_ACTION_ORIGIN_PROOF_HEADER]:
            'Qr4bP6k-qVZGg3vfc9dLxHTynsF-ZfeCH_0bjXWLlaA',
        },
        timeout: 5000,
      });
      expect(result).toMatchObject({
        isApiKey: true,
        organizationId: 'org-123',
        role: 'user',
        userId: 'user-456',
        valid: true,
      });
    });

    it('does not cache gf_ API keys so revocation takes effect immediately', async () => {
      mockHttpService.get
        .mockReturnValueOnce(
          whoamiResponse({
            isApiKey: true,
            organization: { id: 'org-123' },
            role: 'user',
            user: { id: 'user-456' },
          }),
        )
        .mockReturnValueOnce(throwError(() => ({ response: { status: 401 } })));

      const first = await service.authenticateRequest(apiKey);
      expect(first.valid).toBe(true);

      const second = await service.authenticateRequest(apiKey);
      expect(second.valid).toBe(false);
      expect(mockHttpService.get).toHaveBeenCalledTimes(2);
    });

    it('caches successful Better Auth session resolutions', async () => {
      mockHttpService.get.mockReturnValue(
        whoamiResponse({
          isApiKey: false,
          organization: { id: 'org-789' },
          role: 'creator',
          user: { id: 'user-123' },
        }),
      );

      await service.authenticateRequest(jwtToken);
      await service.authenticateRequest(jwtToken);
      expect(mockHttpService.get).toHaveBeenCalledTimes(1);
    });

    it('resolves identity for a Better Auth JWT via the same whoami endpoint', async () => {
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
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          [MCP_ACTION_ORIGIN_PROOF_HEADER]:
            'Qr4bP6k-qVZGg3vfc9dLxHTynsF-ZfeCH_0bjXWLlaA',
        },
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

    it('preserves the superadmin tier for session tokens', async () => {
      mockHttpService.get.mockReturnValue(
        whoamiResponse({
          isApiKey: false,
          organization: { id: 'o' },
          role: 'superadmin',
          user: { id: 'u' },
        }),
      );

      const result = await service.authenticateRequest(jwtToken);
      expect(result.role).toBe('superadmin');
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
  });

  describe('extractBearerToken', () => {
    it('should return null for empty header', () => {
      const token = service.extractBearerToken('');
      expect(token).toBeNull();
    });

    it('should return null for a single-field header', () => {
      const token = service.extractBearerToken('Bearer');
      expect(token).toBeNull();
    });

    it.each([
      ['bearer', 'bearer my-token-123'],
      ['BEARER', 'BEARER my-token-123'],
      ['BeArEr', 'BeArEr my-token-123'],
    ])(
      // RFC 7235: scheme names are case-insensitive.
      'should extract the token from a %s scheme',
      (_label, authHeader) => {
        const token = service.extractBearerToken(authHeader);
        expect(token).toBe('my-token-123');
      },
    );
  });
});
