import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { OAuthGrantType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { of, throwError } from 'rxjs';

vi.mock('@api/shared/utils/encryption/encryption.util');

describe('MastodonService', () => {
  let service: MastodonService;
  let configService: vi.Mocked<ConfigService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let loggerService: vi.Mocked<LoggerService>;
  let httpService: vi.Mocked<HttpService>;

  const instanceUrl = 'https://mastodon.social';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MastodonService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn((k: string) => `mock-${k}`) },
        },
        {
          provide: CredentialsService,
          useValue: { findOne: vi.fn() },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        {
          provide: HttpService,
          useValue: { get: vi.fn(), post: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<MastodonService>(MastodonService);
    configService = module.get(ConfigService);
    credentialsService = module.get(CredentialsService);
    loggerService = module.get(LoggerService);
    httpService = module.get(HttpService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('normalizeInstanceUrl (via registerApp)', () => {
    it('should throw BadRequestException for http:// URLs', async () => {
      await expect(
        service.registerApp('http://mastodon.social', 'https://callback'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for localhost', async () => {
      await expect(
        service.registerApp('https://localhost', 'https://callback'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for private IP ranges', async () => {
      await expect(
        service.registerApp('https://192.168.1.1', 'https://callback'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.registerApp('https://10.0.0.1', 'https://callback'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for .internal hostnames', async () => {
      await expect(
        service.registerApp('https://app.cluster.internal', 'https://cb'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('registerApp', () => {
    it('should register app on valid Mastodon instance', async () => {
      const mockRegistration = {
        client_id: 'client-id',
        client_secret: 'client-secret',
        id: 'app-id',
        name: 'Genfeed.ai',
        redirect_uri: 'https://callback',
      };

      httpService.post.mockReturnValue(of({ data: mockRegistration }) as never);

      const result = await service.registerApp(instanceUrl, 'https://callback');

      expect(result).toEqual(mockRegistration);
      expect(httpService.post).toHaveBeenCalledWith(
        `${instanceUrl}/api/v1/apps`,
        expect.objectContaining({
          client_name: 'Genfeed.ai',
          redirect_uris: 'https://callback',
          scopes: 'read write push',
        }),
      );
    });

    it('should log error and rethrow on HTTP failure', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Connection refused')) as never,
      );

      await expect(
        service.registerApp(instanceUrl, 'https://callback'),
      ).rejects.toThrow('Connection refused');

      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('generateAuthUrl', () => {
    it('should generate correct OAuth authorization URL', () => {
      const url = service.generateAuthUrl(
        instanceUrl,
        'client-id-123',
        'https://callback',
        'state-xyz',
      );

      expect(url).toContain(`${instanceUrl}/oauth/authorize`);
      expect(url).toContain('client_id=client-id-123');
      expect(url).toContain('state=state-xyz');
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=read+write+push');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange authorization code for access token', async () => {
      httpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'masto-token',
            created_at: 1234567890,
            scope: 'read write push',
            token_type: 'Bearer',
          },
        }) as never,
      );

      const result = await service.exchangeCodeForToken(
        instanceUrl,
        'client-id',
        'client-secret',
        'auth-code',
        'https://callback',
      );

      expect(result).toEqual({ accessToken: 'masto-token' });
      expect(httpService.post).toHaveBeenCalledWith(
        `${instanceUrl}/oauth/token`,
        expect.objectContaining({
          client_id: 'client-id',
          client_secret: 'client-secret',
          code: 'auth-code',
          grant_type: OAuthGrantType.AUTHORIZATION_CODE,
        }),
      );
    });
  });

  describe('verifyCredentials', () => {
    it('should verify and return account info', async () => {
      const mockAccount = {
        acct: 'testuser',
        avatar: 'https://cdn.example.com/avatar.jpg',
        display_name: 'Test User',
        id: 'account-123',
        url: 'https://mastodon.social/@testuser',
        username: 'testuser',
      };

      httpService.get.mockReturnValue(of({ data: mockAccount }) as never);

      const result = await service.verifyCredentials(instanceUrl, 'token-abc');

      expect(result).toEqual(mockAccount);
      expect(httpService.get).toHaveBeenCalledWith(
        `${instanceUrl}/api/v1/accounts/verify_credentials`,
        expect.objectContaining({
          headers: { Authorization: 'Bearer token-abc' },
        }),
      );
    });
  });

  describe('publishStatus', () => {
    it('should publish a status and return status data', async () => {
      const mockStatus = {
        created_at: '2026-03-15T00:00:00Z',
        id: 'status-123',
        uri: 'https://mastodon.social/users/test/statuses/123',
        url: 'https://mastodon.social/@test/123',
      };

      httpService.post.mockReturnValue(of({ data: mockStatus }) as never);

      const result = await service.publishStatus(
        instanceUrl,
        'token-abc',
        'Hello Mastodon!',
      );

      expect(result).toEqual(mockStatus);
      expect(httpService.post).toHaveBeenCalledWith(
        `${instanceUrl}/api/v1/statuses`,
        expect.objectContaining({
          status: 'Hello Mastodon!',
          visibility: 'public',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token-abc',
          }),
        }),
      );
    });

    it('should include media_ids when provided', async () => {
      const mockStatus = {
        created_at: '2026-03-15T00:00:00Z',
        id: 's2',
        uri: 'uri',
        url: 'url',
      };

      httpService.post.mockReturnValue(of({ data: mockStatus }) as never);

      await service.publishStatus(instanceUrl, 'token', 'Media post', [
        'media-1',
        'media-2',
      ]);

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ media_ids: ['media-1', 'media-2'] }),
        expect.anything(),
      );
    });
  });

  describe('getMediaAnalytics', () => {
    const orgId = new Types.ObjectId().toString();
    const brandId = new Types.ObjectId().toString();

    it('should return analytics data from status endpoint', async () => {
      credentialsService.findOne.mockResolvedValue({
        accessToken: 'encrypted-token',
        description: instanceUrl,
      } as never);

      vi.mocked(EncryptionUtil.decrypt).mockReturnValue('plain-token');

      httpService.get.mockReturnValue(
        of({
          data: {
            created_at: '2026-03-15',
            favourites_count: 10,
            id: 'status-id',
            reblogs_count: 3,
            replies_count: 2,
            uri: 'uri',
            url: 'url',
          },
        }) as never,
      );

      const result = await service.getMediaAnalytics(
        orgId,
        brandId,
        'status-id',
      );

      expect(result).toEqual({
        boosts: 3,
        comments: 2,
        likes: 10,
        views: 0,
      });
    });

    it('should return zero counts when credential is missing', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      const result = await service.getMediaAnalytics(orgId, brandId, 's1');

      expect(result).toEqual({
        boosts: 0,
        comments: 0,
        likes: 0,
        views: 0,
      });
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('should return zero counts on API error', async () => {
      credentialsService.findOne.mockResolvedValue({
        accessToken: 'enc',
        description: instanceUrl,
      } as never);
      vi.mocked(EncryptionUtil.decrypt).mockReturnValue('token');
      httpService.get.mockReturnValue(
        throwError(() => new Error('Not found')) as never,
      );

      const result = await service.getMediaAnalytics(orgId, brandId, 'bad-id');

      expect(result).toEqual({
        boosts: 0,
        comments: 0,
        likes: 0,
        views: 0,
      });
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
