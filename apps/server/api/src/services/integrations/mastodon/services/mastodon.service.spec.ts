import { Agent as HttpsAgent } from 'node:https';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { OAuthGrantType } from '@genfeedai/contracts';
import { MAX_FILE_SIZE } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import FormData from 'form-data';
import { of, throwError } from 'rxjs';
import type { Mocked } from 'vitest';

const { dnsLookupMock, safeFetchMock } = vi.hoisted(() => ({
  dnsLookupMock: vi.fn(),
  safeFetchMock: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({ lookup: dnsLookupMock }));
vi.mock('@libs/security/destination-guard', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@libs/security/destination-guard')>();
  return { ...actual, safeFetch: safeFetchMock };
});

vi.mock('@libs/utils/encryption/encryption.util');

describe('MastodonService', () => {
  let service: MastodonService;
  let configService: Mocked<ConfigService>;
  let loggerService: Mocked<LoggerService>;
  let httpService: Mocked<HttpService>;

  const instanceUrl = 'https://mastodon.social';
  const resolveBrandAccount = vi.fn();
  const credentialsStore = {
    findAll: vi.fn(),
    findBrandAccounts: vi.fn(),
    findConnectedAccounts: vi.fn(),
    findOne: vi.fn(),
    mergeWarmupSignals: vi.fn(),
    patch: vi.fn(),
    resolveBrandAccount,
  } satisfies ServerCredentialStore;

  beforeEach(async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    safeFetchMock.mockImplementation(
      async () =>
        new Response('media', { headers: { 'content-type': 'image/png' } }),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MastodonService,
        {
          provide: ConfigService,
          useValue: {
            cdnUrl: 'https://cdn.example.com',
            ingredientsEndpoint: 'https://cdn.example.com/ingredients',
            get: vi.fn((key: string) =>
              // default: no app URL configured → allowlist warn-skips;
              // the redirectUri allowlist suite overrides per test
              String(key) === 'GENFEEDAI_APP_URL'
                ? undefined
                : `mock-${String(key)}`,
            ),
          },
        },
        {
          provide: SERVER_TOKENS.credentials,
          useValue: credentialsStore,
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
    loggerService = module.get(LoggerService);
    httpService = module.get(HttpService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
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
        expect.any(Object),
      );
    });

    it('should remove every trailing slash from the instance URL', async () => {
      const mockRegistration = {
        client_id: 'client-id',
        client_secret: 'client-secret',
        id: 'app-id',
        name: 'Genfeed.ai',
        redirect_uri: 'https://callback',
      };
      httpService.post.mockReturnValue(of({ data: mockRegistration }) as never);

      await service.registerApp(`${instanceUrl}///`, 'https://callback');

      expect(httpService.post).toHaveBeenCalledWith(
        `${instanceUrl}/api/v1/apps`,
        expect.any(Object),
        expect.any(Object),
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
        expect.any(Object),
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
    const orgId = 'test-object-id';
    const brandId = 'test-object-id';

    it('should return analytics data from status endpoint', async () => {
      resolveBrandAccount.mockResolvedValue({
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
      resolveBrandAccount.mockResolvedValue(null);

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
      resolveBrandAccount.mockResolvedValue({
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

  describe('outbound destination policy', () => {
    const operations = [
      'register',
      'exchange',
      'verify',
      'publish',
      'upload',
      'analytics',
    ] as const;
    function runOperation(operation: (typeof operations)[number]) {
      switch (operation) {
        case 'register':
          return service.registerApp(instanceUrl, 'https://callback');
        case 'exchange':
          return service.exchangeCodeForToken(
            instanceUrl,
            'client',
            'secret',
            'code',
            'https://callback',
          );
        case 'verify':
          return service.verifyCredentials(instanceUrl, 'token');
        case 'publish':
          return service.publishStatus(instanceUrl, 'token', 'Hello');
        case 'upload':
          return service.uploadMedia(
            instanceUrl,
            'token',
            'https://media.example.com/image.png',
          );
        case 'analytics':
          return service.getMediaAnalytics('org', 'brand', 'status');
      }
    }
    beforeEach(() => {
      resolveBrandAccount.mockResolvedValue({
        accessToken: 'encrypted',
        description: instanceUrl,
      });
      vi.mocked(EncryptionUtil.decrypt).mockReturnValue('token');
      httpService.post.mockReturnValue(
        of({ data: { id: 'result', access_token: 'token' } }) as never,
      );
      httpService.get.mockReturnValue(of({ data: { id: 'result' } }) as never);
    });

    it.each(operations)(
      'pins %s requests and disables redirects, including HTTP downgrade',
      async (operation) => {
        const destroy = vi.spyOn(HttpsAgent.prototype, 'destroy');
        await runOperation(operation);
        const calls =
          operation === 'verify' || operation === 'analytics'
            ? httpService.get.mock.calls
            : httpService.post.mock.calls;
        const options = calls[0]?.at(-1);
        expect(options).toEqual(
          expect.objectContaining({
            httpsAgent: expect.any(HttpsAgent),
            maxRedirects: 0,
            timeout: 30_000,
          }),
        );
        expect(dnsLookupMock).toHaveBeenCalledTimes(1);
        expect(destroy).toHaveBeenCalledTimes(1);
      },
    );

    it.each(operations)(
      'releases %s agents when the provider fails',
      async (operation) => {
        const destroy = vi.spyOn(HttpsAgent.prototype, 'destroy');
        httpService.post.mockReturnValue(
          throwError(() => new Error('provider failed')) as never,
        );
        httpService.get.mockReturnValue(
          throwError(() => new Error('provider failed')) as never,
        );
        if (operation === 'analytics') await runOperation(operation);
        else
          await expect(runOperation(operation)).rejects.toThrow(
            'provider failed',
          );
        expect(destroy).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      [{ address: '10.0.0.1', family: 4 }],
      [
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.1.2', family: 4 },
      ],
      [{ address: '::ffff:7f00:1', family: 6 }],
    ])(
      'rejects private DNS answers before contacting an instance: %j',
      async (...records) => {
        dnsLookupMock.mockResolvedValue(records);
        await expect(
          service.registerApp(instanceUrl, 'https://callback'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(httpService.post).not.toHaveBeenCalled();
      },
    );

    it('rejects embedded instance credentials', async () => {
      const url = new URL(instanceUrl);
      url.username = 'test-user';
      url.password = 'test-password';
      await expect(
        service.registerApp(url.href, 'https://callback'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it.each([
      'https://mastodon.social?next=http://127.0.0.1',
      'https://mastodon.social#ignored',
    ])('rejects ambiguous instance identity: %s', async (url) => {
      await expect(
        service.registerApp(url, 'https://callback'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('downloads external media through the public destination boundary', async () => {
      await service.uploadMedia(
        instanceUrl,
        'token',
        'https://media.example.com/image.png',
      );
      expect(safeFetchMock).toHaveBeenCalledWith(
        'https://media.example.com/image.png',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
        { maxRedirects: 0 },
      );
    });

    it('permits private media only on the configured CDN origin', async () => {
      Object.defineProperty(configService, 'cdnUrl', {
        value: 'http://files:3000',
        configurable: true,
      });
      await service.uploadMedia(
        instanceUrl,
        'token',
        'http://files:3000/ingredients/image.png',
      );
      expect(safeFetchMock).toHaveBeenCalledWith(
        'http://files:3000/ingredients/image.png',
        expect.any(Object),
        {
          allowedOrigins: ['http://files:3000'],
          allowPrivateNetwork: true,
          maxRedirects: 0,
        },
      );
    });

    it('does not trust another port on the configured CDN host', async () => {
      Object.defineProperty(configService, 'cdnUrl', {
        value: 'http://files:3000',
        configurable: true,
      });
      await service.uploadMedia(
        instanceUrl,
        'token',
        'http://files:3001/ingredients/image.png',
      );
      expect(safeFetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        { maxRedirects: 0 },
      );
    });

    it('preserves media bytes, content type and description in the upload', async () => {
      await service.uploadMedia(
        instanceUrl,
        'token',
        'https://media.example.com/image.png',
        'Alt text',
      );
      const form = httpService.post.mock.calls[0]?.[1] as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect(form.getBuffer().toString()).toContain('Content-Type: image/png');
      expect(form.getBuffer().toString()).toContain('media');
      expect(form.getBuffer().toString()).toContain('Alt text');
    });

    it('cancels oversized downloads without allocating or uploading the body', async () => {
      const response = new Response('oversized', {
        headers: { 'content-length': String(MAX_FILE_SIZE + 1) },
      });
      if (!response.body) throw new Error('Expected a response body');
      const cancel = vi.spyOn(response.body, 'cancel');
      safeFetchMock.mockResolvedValue(response);
      await expect(
        service.uploadMedia(
          instanceUrl,
          'token',
          'https://media.example.com/large.mp4',
        ),
      ).rejects.toThrow('100 MB limit');
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('cancels rejected HTTP responses instead of uploading their body', async () => {
      const response = new Response('not found', { status: 404 });
      if (!response.body) throw new Error('Expected a response body');
      const cancel = vi.spyOn(response.body, 'cancel');
      safeFetchMock.mockResolvedValue(response);
      await expect(
        service.uploadMedia(
          instanceUrl,
          'token',
          'https://media.example.com/missing.png',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('does not upload after a guarded media download is denied', async () => {
      safeFetchMock.mockRejectedValue(
        new Error('private destination rejected'),
      );
      await expect(
        service.uploadMedia(instanceUrl, 'token', 'http://127.0.0.1/private'),
      ).rejects.toThrow('private destination rejected');
      expect(httpService.post).not.toHaveBeenCalled();
    });
  });

  describe('redirectUri allowlist', () => {
    it('rejects redirect URIs outside the configured app origin', () => {
      configService.get.mockImplementation((key) =>
        String(key) === 'GENFEEDAI_APP_URL'
          ? 'https://app.genfeed.ai'
          : `mock-${String(key)}`,
      );

      expect(() =>
        service.generateAuthUrl(
          instanceUrl,
          'client-id',
          'https://evil.example.com/callback',
          'state',
        ),
      ).toThrow('redirectUri is not allowed');
    });

    it('accepts redirect URIs under the configured app origin', () => {
      configService.get.mockImplementation((key) =>
        String(key) === 'GENFEEDAI_APP_URL'
          ? 'https://app.genfeed.ai///'
          : `mock-${String(key)}`,
      );

      expect(() =>
        service.generateAuthUrl(
          instanceUrl,
          'client-id',
          'https://app.genfeed.ai/integrations/mastodon/callback',
          'state',
        ),
      ).not.toThrow();
    });
  });
});
