import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';

describe('FacebookService', () => {
  let service: FacebookService;

  const facebookConfig: Record<string, string> = {
    FACEBOOK_API_VERSION: 'v26.0',
    FACEBOOK_APP_ID: 'test-app-id',
    FACEBOOK_GRAPH_URL: 'https://graph.facebook.com',
    FACEBOOK_REDIRECT_URI: 'https://genfeed.ai/auth/facebook/callback',
  };

  const mockConfigService = {
    get: vi.fn((key: string) => facebookConfig[key] ?? ''),
  };

  const mockCredentialsService = {
    findAll: vi.fn(),
    findBrandAccounts: vi.fn(),
    findConnectedAccounts: vi.fn(),
    findOne: vi.fn(),
    mergeWarmupSignals: vi.fn(),
    patch: vi.fn(),
    // Multi-account resolution routes through `resolveBrandAccount`; the double
    // answers with whatever `findOne` is primed to return so the existing
    // single-account cases keep describing one connected account.
    resolveBrandAccount: vi.fn(),
  } satisfies ServerCredentialStore;
  mockCredentialsService.resolveBrandAccount.mockImplementation(
    (options: { credentialId?: string | null }) =>
      (mockCredentialsService.findOne as Mock)(options),
  );

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
          provide: SERVER_TOKENS.credentials,
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
  });

  it('retains exact provider keys and paths on learning evidence before display fallbacks', async () => {
    mockHttpService.get.mockReturnValue(
      of({
        data: {
          id: 'post',
          reactions: { summary: { total_count: 0 } },
          comments: { summary: { total_count: 2 } },
          shares: { count: 3 },
          insights: {
            data: [{ name: 'post_media_view', values: [{ value: 100 }] }],
          },
        },
      }),
    );
    const result = await service.getPostAnalytics('post', 'token');
    expect(mockHttpService.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({
          fields: expect.stringContaining('insights.metric(post_media_view)'),
        }),
      }),
    );
    expect(result.reach).toBeUndefined();
    expect(result.impressions).toBeUndefined();
    expect(result.views).toBe(100);
    expect(result.learningMetrics?.metrics).toEqual({
      views: {
        value: 100,
        availability: 'observed',
        source: 'post_media_view',
      },
      likes: {
        value: 0,
        availability: 'observed',
        source: 'reactions.summary.total_count',
      },
      comments: {
        value: 2,
        availability: 'observed',
        source: 'comments.summary.total_count',
      },
      shares: { value: 3, availability: 'observed', source: 'shares.count' },
    });
  });
  it.each([
    [401, 'terminal_unavailable'],
    [404, 'terminal_unavailable'],
    [429, 'retryable_failure'],
    [503, 'retryable_failure'],
  ])(
    'classifies transport status %s without granting observation',
    async (status, outcome) => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({ response: { status } })),
      );
      const result = await service.getPostAnalytics('post', 'token');
      expect(result.learningMetrics?.collection?.outcome).toBe(outcome);
      expect(
        Object.values(result.learningMetrics?.metrics ?? {}).every(
          (metric) => metric?.availability !== 'observed',
        ),
      ).toBe(true);
    },
  );
  it('rejects malformed or wrong-resource HTTP200 instead of marking observation', async () => {
    for (const data of [undefined, {}, { id: 'foreign' }]) {
      mockHttpService.get.mockReturnValue(of({ data }));
      const result = await service.getPostAnalytics('post', 'token');
      expect(result.learningMetrics?.collection?.outcome).toBe(
        'retryable_failure',
      );
      expect(
        Object.values(result.learningMetrics?.metrics ?? {}).some(
          (metric) => metric?.availability === 'observed',
        ),
      ).toBe(false);
    }
    mockHttpService.get.mockReturnValue(of({ data: { id: 'post' } }));
    expect(
      (await service.getPostAnalytics('post', 'token')).learningMetrics
        ?.collection?.outcome,
    ).toBe('observed');
  });
  it.each([
    [190, 'terminal_unavailable'],
    [102, 'terminal_unavailable'],
    [10, 'terminal_unavailable'],
    [200, 'terminal_unavailable'],
    [294, 'terminal_unavailable'],
    [4, 'retryable_failure'],
    [17, 'retryable_failure'],
    [32, 'retryable_failure'],
    [613, 'retryable_failure'],
  ])(
    'recognizes Meta code %s on HTTP400 without guessing another failure',
    async (code, outcome) => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({
          response: { status: 400, data: { error: { code } } },
        })),
      );
      const result = await service.getPostAnalytics('post', 'token');
      expect(result.learningMetrics?.collection).toMatchObject({
        outcome,
        reasonCode:
          outcome === 'terminal_unavailable' ? 'unauthorized' : 'rate_limited',
      });
    },
  );
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('publishes a video by URL using the supplied Page token without an invalid chunk transfer', async () => {
    mockHttpService.post.mockReturnValue(of({ data: { id: 'video-1' } }));
    expect(
      await service.uploadVideo(
        'page',
        'page-token',
        'https://cdn.example/video.mp4',
        'title',
        'caption',
      ),
    ).toBe('video-1');
    expect(mockHttpService.post).toHaveBeenCalledOnce();
    expect(mockHttpService.post).toHaveBeenCalledWith(
      'https://graph.facebook.com/v26.0/page/videos',
      null,
      {
        params: {
          access_token: 'page-token',
          file_url: 'https://cdn.example/video.mp4',
          title: 'title',
          description: 'caption',
        },
      },
    );
  });

  describe('generateAuthUrl', () => {
    it('should generate Facebook OAuth URL', () => {
      const state = 'test-state-123';
      const url = service.generateAuthUrl(state);

      expect(url).toContain('https://www.facebook.com/v26.0/dialog/oauth');
      expect(url).toContain('client_id=test-app-id');
      expect(url).toContain('state=test-state-123');
      expect(url).toContain('scope=');
      expect(url).toContain('pages_manage_posts');
      expect(url).toContain('pages_manage_engagement');
      expect(url).toContain('read_insights');
    });

    it('uses v26.0 when no API version is configured', () => {
      mockConfigService.get.mockImplementationOnce(() => '');
      const defaultService = new FacebookService(
        mockConfigService as unknown as ConfigService,
        mockCredentialsService,
        mockLoggerService as unknown as LoggerService,
        mockHttpService as unknown as HttpService,
      );

      expect(defaultService.generateAuthUrl('state')).toContain(
        'https://www.facebook.com/v26.0/dialog/oauth',
      );
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
      expect(url).toContain('ads_management');
      expect(url).toContain('ads_read');
    });

    it('refuses to start OAuth when the app id is a placeholder', () => {
      mockConfigService.get.mockImplementation(
        (key: string) =>
          ({
            ...facebookConfig,
            FACEBOOK_APP_ID: 'PLACEHOLDER_NOT_CONFIGURED',
          })[key] ?? '',
      );

      expect(() => service.generateAuthUrl('state')).toThrow(
        ServiceUnavailableException,
      );

      mockConfigService.get.mockImplementation(
        (key: string) => facebookConfig[key] ?? '',
      );
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
      expect(result.scope).toBeUndefined();
    });

    it('forwards granted scopes when Facebook returns them', async () => {
      const { of } = await import('rxjs');
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            access_token: 'fb-token-123',
            expires_in: 5183944,
            scope: 'pages_manage_posts,pages_show_list',
          },
        }),
      );

      const result = await service.exchangeAuthCodeForAccessToken('auth-code');
      expect(result.scope).toBe('pages_manage_posts,pages_show_list');
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

  describe('getGrantedPermissions', () => {
    it('captures only permissions Meta reports as granted', async () => {
      const { of } = await import('rxjs');
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            data: [
              { permission: 'ads_read', status: 'granted' },
              { permission: 'ads_management', status: 'granted' },
              { permission: 'pages_manage_posts', status: 'declined' },
            ],
          },
        }),
      );

      const result = await service.getGrantedPermissions('valid-token');

      expect(result).toEqual(['ads_management', 'ads_read']);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://graph.facebook.com/v26.0/me/permissions',
        { params: { access_token: 'valid-token' } },
      );
    });

    it('distinguishes a captured empty grant set from a malformed payload', async () => {
      const { of } = await import('rxjs');
      mockHttpService.get
        .mockReturnValueOnce(of({ data: {} }))
        .mockReturnValueOnce(of({ data: { data: [] } }));

      await expect(
        service.getGrantedPermissions('valid-token'),
      ).resolves.toBeUndefined();
      await expect(
        service.getGrantedPermissions('valid-token'),
      ).resolves.toEqual([]);
    });
  });

  describe('refreshToken', () => {
    it('keeps the refreshed credential connected when permission capture fails', async () => {
      vi.spyOn(EncryptionUtil, 'decrypt').mockReturnValue('decrypted-token');
      mockCredentialsService.findOne.mockResolvedValue({
        accessToken: 'encrypted-token',
        id: 'credential-1',
      });
      mockCredentialsService.patch.mockResolvedValue({
        accessToken: 'long-lived-token',
        id: 'credential-1',
        isConnected: true,
      });
      mockHttpService.get
        .mockReturnValueOnce(
          of({
            data: {
              access_token: 'long-lived-token',
              expires_in: 5_184_000,
            },
          }),
        )
        .mockReturnValueOnce(
          throwError(() => new Error('Graph permissions unavailable')),
        );

      await expect(
        service.refreshToken('organization-1', 'brand-1'),
      ).resolves.toEqual(
        expect.objectContaining({
          accessToken: 'long-lived-token',
          isConnected: true,
        }),
      );

      expect(mockCredentialsService.patch).toHaveBeenCalledTimes(1);
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        'credential-1',
        expect.objectContaining({
          accessToken: 'long-lived-token',
          isConnected: true,
        }),
      );
      expect(mockCredentialsService.patch).not.toHaveBeenCalledWith(
        'credential-1',
        { isConnected: false },
      );
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('permission capture failed'),
        expect.any(Error),
      );
    });
  });
});
