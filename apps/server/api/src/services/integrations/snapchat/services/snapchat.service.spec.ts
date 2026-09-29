import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { SnapchatService } from './snapchat.service';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn() },
}));

const makeAxiosResponse = <T>(data: T) => ({ data });

describe('SnapchatService', () => {
  let service: SnapchatService;
  let configService: vi.Mocked<ConfigService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let loggerService: vi.Mocked<LoggerService>;
  let httpService: vi.Mocked<HttpService>;

  const orgId = 'test-object-id';
  const brandId = 'test-object-id';

  const mockCredential = {
    id: 'test-object-id',
    accessToken: 'encrypted-access',
    refreshToken: 'encrypted-refresh',
  } as unknown as CredentialDocument;

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
      // Multi-account resolution routes through `resolveBrandAccount`; the double
      // answers with whatever `findOne` is primed to return so the existing
      // single-account cases keep describing one connected account.
      resolveBrandAccount: vi.fn((options: { credentialId?: string | null }) =>
        credentialsService.findOne(options),
      ),
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

  describe('generateAuthUrl', () => {
    it('includes response_type=code in URL', () => {
      const url = service.generateAuthUrl('s');
      expect(url).toContain('response_type=code');
    });
  });

  describe('exchangeCodeForToken', () => {
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
    it('calls credentialsService.patch with updated tokens', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential);
      vi.mocked(EncryptionUtil.decrypt).mockReturnValue('plain-refresh-token');
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ access_token: 'new-acc', expires_in: 3600 })),
      );
      credentialsService.patch.mockResolvedValue({} as never);

      await service.refreshToken(orgId, brandId);

      expect(credentialsService.patch).toHaveBeenCalledWith(
        mockCredential.id,
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
    it('logs a warning about the stub implementation', async () => {
      await service.getMediaAnalytics(orgId, brandId, 'ext-123');

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('not fully implemented'),
        expect.any(Object),
      );
    });
  });
});
