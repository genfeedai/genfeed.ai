import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { SnapchatService } from './snapchat.service';

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn() },
}));

const makeAxiosResponse = <T>(data: T) => ({ data });

describe('SnapchatService', () => {
  let service: SnapchatService;
  let configService: vi.Mocked<ConfigService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let loggerService: vi.Mocked<LoggerService>;
  let httpService: vi.Mocked<HttpService>;

  const orgId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();

  const mockCredential = {
    _id: new Types.ObjectId(),
    accessToken: 'encrypted-access',
    refreshToken: 'encrypted-refresh',
  };

  beforeEach(async () => {
    configService = {
      get: vi.fn((key: string) => {
        const cfg: Record<string, string> = {
          SNAPCHAT_CLIENT_ID: 'snap-client-id',
          SNAPCHAT_CLIENT_SECRET: 'snap-client-secret',
          SNAPCHAT_REDIRECT_URI:
            'https://app.genfeed.ai/oauth/snapchat/callback',
        };
        return cfg[key];
      }),
    } as unknown as vi.Mocked<ConfigService>;

    credentialsService = {
      findOne: vi.fn(),
      patch: vi.fn(),
    } as unknown as vi.Mocked<CredentialsService>;

    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    httpService = {
      post: vi.fn(),
    } as unknown as vi.Mocked<HttpService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnapchatService,
        { provide: ConfigService, useValue: configService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: loggerService },
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get<SnapchatService>(SnapchatService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAuthUrl', () => {
    it('returns a URL pointing to accounts.snapchat.com', () => {
      const url = service.generateAuthUrl('state-token');
      expect(url).toContain(
        'https://accounts.snapchat.com/login/oauth2/authorize',
      );
    });

    it('includes client_id in URL', () => {
      const url = service.generateAuthUrl('state-token');
      expect(url).toContain('client_id=snap-client-id');
    });

    it('includes the provided state in URL', () => {
      const url = service.generateAuthUrl('my-state-123');
      expect(url).toContain('state=my-state-123');
    });

    it('includes redirect_uri in URL', () => {
      const url = service.generateAuthUrl('state-token');
      expect(url).toContain('redirect_uri=');
    });

    it('includes response_type=code in URL', () => {
      const url = service.generateAuthUrl('s');
      expect(url).toContain('response_type=code');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('returns accessToken and refreshToken on success', async () => {
      httpService.post.mockReturnValue(
        of(
          makeAxiosResponse({
            access_token: 'acc-tok',
            refresh_token: 'ref-tok',
          }),
        ),
      );

      const result = await service.exchangeCodeForToken('auth-code');

      expect(result).toEqual({
        accessToken: 'acc-tok',
        refreshToken: 'ref-tok',
      });
    });

    it('sends correct grant_type in request body', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ access_token: 'tok' })),
      );

      await service.exchangeCodeForToken('code');

      const body = httpService.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body.grant_type).toBe(OAuthGrantType.AUTHORIZATION_CODE);
    });

    it('uses Basic auth header with base64-encoded credentials', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ access_token: 'tok' })),
      );

      await service.exchangeCodeForToken('code');

      const headers = (
        httpService.post.mock.calls[0][2] as { headers: Record<string, string> }
      ).headers;
      const expected = `Basic ${Buffer.from('snap-client-id:snap-client-secret').toString('base64')}`;
      expect(headers.Authorization).toBe(expected);
    });

    it('throws and logs on HTTP error', async () => {
      const err = new Error('Snapchat API failure');
      httpService.post.mockReturnValue(throwError(() => err));

      await expect(service.exchangeCodeForToken('bad-code')).rejects.toThrow(
        'Snapchat API failure',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('throws when credential is not found', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        'Snapchat credential not found or missing refresh token',
      );
    });

    it('throws when credential has no refreshToken', async () => {
      credentialsService.findOne.mockResolvedValue({
        ...mockCredential,
        refreshToken: undefined,
      });

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        'Snapchat credential not found or missing refresh token',
      );
    });

    it('decrypts the refresh token before use', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential);
      vi.mocked(EncryptionUtil.decrypt).mockReturnValue('plain-refresh-token');
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ access_token: 'new-acc', expires_in: 3600 })),
      );
      credentialsService.patch.mockResolvedValue({} as never);

      await service.refreshToken(orgId, brandId);

      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('encrypted-refresh');
    });

    it('calls credentialsService.patch with updated tokens', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential);
      vi.mocked(EncryptionUtil.decrypt).mockReturnValue('plain-refresh-token');
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ access_token: 'new-acc', expires_in: 3600 })),
      );
      credentialsService.patch.mockResolvedValue({} as never);

      await service.refreshToken(orgId, brandId);

      expect(credentialsService.patch).toHaveBeenCalledWith(
        mockCredential._id,
        expect.objectContaining({ accessToken: 'new-acc', isConnected: true }),
      );
    });

    it('looks up credential with correct platform filter', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      await service.refreshToken(orgId, brandId).catch(() => {});

      expect(credentialsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ platform: CredentialPlatform.SNAPCHAT }),
      );
    });

    it('throws and logs on HTTP error during token refresh', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential);
      vi.mocked(EncryptionUtil.decrypt).mockReturnValue('plain-token');
      httpService.post.mockReturnValue(
        throwError(() => new Error('OAuth failed')),
      );

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        'OAuth failed',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('createMedia', () => {
    it('returns the media ID from the API response', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ media: [{ media: { id: 'media-id-1' } }] })),
      );

      const result = await service.createMedia(
        'tok',
        'acct-id',
        'https://example.com/video.mp4',
        'My Video',
        'VIDEO',
      );

      expect(result).toBe('media-id-1');
    });

    it('uses Bearer token in Authorization header', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ media: [{ media: { id: 'x' } }] })),
      );

      await service.createMedia(
        'my-access-token',
        'acct',
        'url',
        'name',
        'IMAGE',
      );

      const headers = (
        httpService.post.mock.calls[0][2] as { headers: Record<string, string> }
      ).headers;
      expect(headers.Authorization).toBe('Bearer my-access-token');
    });

    it('logs and rethrows on API error', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Media upload failed')),
      );

      await expect(
        service.createMedia('tok', 'acct', 'url', 'name', 'IMAGE'),
      ).rejects.toThrow('Media upload failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('publishStory', () => {
    it('returns the creative ID from the API response', async () => {
      httpService.post.mockReturnValue(
        of(
          makeAxiosResponse({
            creatives: [{ creative: { id: 'creative-123' } }],
          }),
        ),
      );

      const result = await service.publishStory('tok', 'acct-id', 'media-id-1');

      expect(result).toBe('creative-123');
    });

    it('includes the headline in the request when provided', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ creatives: [{ creative: { id: 'x' } }] })),
      );

      await service.publishStory('tok', 'acct', 'media-123', 'Check this out!');

      const body = httpService.post.mock.calls[0][1] as {
        creatives: Array<Record<string, unknown>>;
      };
      expect(body.creatives[0].headline).toBe('Check this out!');
    });

    it('throws and logs on API error', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Snap publish failed')),
      );

      await expect(service.publishStory('tok', 'acct', 'mid')).rejects.toThrow(
        'Snap publish failed',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('getMediaAnalytics', () => {
    it('returns zeroed analytics stub', async () => {
      const result = await service.getMediaAnalytics(orgId, brandId, 'ext-123');

      expect(result).toEqual({
        comments: 0,
        impressions: 0,
        likes: 0,
        views: 0,
      });
    });

    it('logs a warning about the stub implementation', async () => {
      await service.getMediaAnalytics(orgId, brandId, 'ext-123');

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('not fully implemented'),
        expect.any(Object),
      );
    });
  });
});
