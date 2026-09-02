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
    FACEBOOK_API_VERSION: 'v18.0',
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
        'https://graph.facebook.com/v18.0/me/permissions',
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
