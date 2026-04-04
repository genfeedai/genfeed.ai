import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';

describe('FacebookService', () => {
  let service: FacebookService;
  let configService: ConfigService;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      const config: Record<string, string> = {
        FACEBOOK_API_VERSION: 'v18.0',
        FACEBOOK_APP_ID: 'test-app-id',
        FACEBOOK_GRAPH_URL: 'https://graph.facebook.com',
        FACEBOOK_REDIRECT_URI: 'https://genfeed.ai/auth/facebook/callback',
      };
      return config[key] ?? null;
    }),
  };

  const mockCredentialsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockHttpService = {
    get: vi.fn(),
    post: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacebookService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: CredentialsService,
          useValue: mockCredentialsService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    service = module.get<FacebookService>(FacebookService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAuthUrl', () => {
    it('should generate Facebook OAuth URL', () => {
      const state = 'test-state-123';
      const url = service.generateAuthUrl(state);

      expect(url).toContain('https://www.facebook.com/v18.0/dialog/oauth');
      expect(url).toContain('client_id=test-app-id');
      expect(url).toContain('state=test-state-123');
      expect(url).toContain('scope=');
      expect(url).toContain('pages_manage_posts');
    });

    it('should include redirect_uri in auth URL', () => {
      const url = service.generateAuthUrl('state-1');
      expect(url).toContain(
        'redirect_uri=https://genfeed.ai/auth/facebook/callback',
      );
    });

    it('should include required OAuth scopes', () => {
      const url = service.generateAuthUrl('state-2');
      expect(url).toContain('public_profile');
      expect(url).toContain('email');
      expect(url).toContain('pages_read_engagement');
      expect(url).toContain('publish_video');
    });
  });

  describe('exchangeAuthCodeForAccessToken', () => {
    it('should exchange code for access token', async () => {
      const { of } = await import('rxjs');
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            access_token: 'fb-token-123',
            expires_in: 5183944,
          },
        }),
      );

      const result = await service.exchangeAuthCodeForAccessToken('auth-code');
      expect(result.accessToken).toBe('fb-token-123');
      expect(result.expiresIn).toBe(5183944);
    });

    it('should throw when exchange fails', async () => {
      const { throwError } = await import('rxjs');
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Invalid code')),
      );

      await expect(
        service.exchangeAuthCodeForAccessToken('bad-code'),
      ).rejects.toThrow('Invalid code');
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile data', async () => {
      const { of } = await import('rxjs');
      mockHttpService.get.mockReturnValue(
        of({
          data: { email: 'test@fb.com', id: '123', name: 'Test User' },
        }),
      );

      const profile = await service.getUserProfile('valid-token');
      expect(profile.id).toBe('123');
      expect(profile.name).toBe('Test User');
      expect(profile.email).toBe('test@fb.com');
    });
  });
});
