import type { Mock } from 'vitest';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((val: string) => val) },
}));

const mockAuthClientInstance = {
  exchangeAuthCodeForAccessToken: vi.fn(),
  exchangeRefreshTokenForAccessToken: vi.fn(),
  generateMemberAuthorizationUrl: vi
    .fn()
    .mockReturnValue(
      'https://www.linkedin.com/oauth/v2/authorization?client_id=test-client-id&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Foauth%2Flinkedin&scope=openid%20profile%20email%20w_member_social&state=',
    ),
};

vi.mock('linkedin-api-client', () => ({
  AuthClient: vi.fn(function AuthClientMock() {
    return mockAuthClientInstance;
  }),
}));

import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import {
  LinkedInService,
  resolveLinkedInVisibility,
} from '@api/services/integrations/linkedin/services/linkedin.service';
import {
  LINKEDIN_DM_NOT_IMPLEMENTED_REASON,
  LINKEDIN_DM_UNAVAILABLE_REASON,
} from '@api/services/integrations/linkedin/services/linkedin-inbox.constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('LinkedInService', () => {
  let service: LinkedInService;

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

  const mockHttpService = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  };

  const mockLoggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockTrendResolver = {
    resolve: vi.fn(),
  };

  const mockConfig: Record<string, string> = {
    LINKEDIN_CLIENT_ID: 'test-client-id',
    LINKEDIN_CLIENT_SECRET: 'test-client-secret',
    LINKEDIN_REDIRECT_URI: 'http://localhost:3000/oauth/linkedin',
  };

  const mockConfigService = {
    get: vi.fn((key: string) => mockConfig[key]),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConfig.LINKEDIN_CLIENT_ID = 'test-client-id';
    mockConfig.LINKEDIN_CLIENT_SECRET = 'test-client-secret';
    mockConfig.LINKEDIN_REDIRECT_URI = 'http://localhost:3000/oauth/linkedin';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkedInService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        { provide: LoggerService, useValue: mockLoggerService },
        {
          provide: SERVER_TOKENS.credentials,
          useValue: mockCredentialsService,
        },
        { provide: HttpService, useValue: mockHttpService },
        {
          provide: SERVER_TOKENS.linkedInTrends,
          useValue: mockTrendResolver,
        },
      ],
    }).compile();

    service = module.get<LinkedInService>(LinkedInService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveLinkedInVisibility', () => {
    it('maps the connections choice to LinkedIn vocabulary', () => {
      expect(resolveLinkedInVisibility({ visibility: 'CONNECTIONS' })).toBe(
        'CONNECTIONS',
      );
    });

    it('defaults to public when the setting is unset', () => {
      // Every share was public before the setting existed, so an unset value
      // has to keep publishing the way it always did.
      expect(resolveLinkedInVisibility({})).toBe('PUBLIC');
    });

    it('falls back to public for a value LinkedIn does not accept', () => {
      expect(resolveLinkedInVisibility({ visibility: 'FRIENDS' })).toBe(
        'PUBLIC',
      );
    });
  });

  describe('generateAuthUrl', () => {
    it('should generate a valid OAuth URL with state', () => {
      const state = 'opaque-oauth-state';
      const url = service.generateAuthUrl(state);

      expect(url).toContain('https://www.linkedin.com/oauth/v2/authorization');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('scope=');
      expect(url).toContain('state=');
    });

    it('should call authClient.generateMemberAuthorizationUrl with correct scopes', () => {
      service.generateAuthUrl('some-state');

      expect(
        mockAuthClientInstance.generateMemberAuthorizationUrl,
      ).toHaveBeenCalledWith(
        ['openid', 'profile', 'email', 'w_member_social'],
        'some-state',
      );
    });

    it('throws 503 when LinkedIn app credentials are missing', () => {
      delete mockConfig.LINKEDIN_CLIENT_ID;

      try {
        service.generateAuthUrl('some-state');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.SERVICE_UNAVAILABLE,
        );
        expect(
          mockAuthClientInstance.generateMemberAuthorizationUrl,
        ).not.toHaveBeenCalled();
        return;
      }

      expect.fail('expected missing LinkedIn config to throw');
    });
  });

  describe('exchangeAuthCodeForAccessToken', () => {
    it('should exchange code for access token successfully', async () => {
      mockAuthClientInstance.exchangeAuthCodeForAccessToken.mockResolvedValue({
        access_token: 'linkedin-access-token',
        expires_in: 5184000,
      });

      const result = await service.exchangeAuthCodeForAccessToken('auth-code');

      expect(result).toEqual({
        accessToken: 'linkedin-access-token',
        expiresIn: 5184000,
      });
    });

    it('forwards granted scopes from the token response', async () => {
      mockAuthClientInstance.exchangeAuthCodeForAccessToken.mockResolvedValue({
        access_token: 'linkedin-access-token',
        expires_in: 5184000,
        scope: 'openid profile w_member_social',
      });

      const result = await service.exchangeAuthCodeForAccessToken('auth-code');

      expect(result.scope).toBe('openid profile w_member_social');
    });

    it('should throw when auth code exchange fails', async () => {
      mockAuthClientInstance.exchangeAuthCodeForAccessToken.mockRejectedValue(
        new Error('Invalid authorization code'),
      );

      await expect(
        service.exchangeAuthCodeForAccessToken('bad-code'),
      ).rejects.toThrow('Invalid authorization code');
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('logs a safe classification instead of the authorization code or provider payload', async () => {
      mockAuthClientInstance.exchangeAuthCodeForAccessToken.mockRejectedValue({
        response: {
          data: {
            error: 'invalid_grant',
            error_description: 'Authorization code expired',
          },
          status: 400,
        },
      });

      await expect(
        service.exchangeAuthCodeForAccessToken(
          'super-secret-authorization-code',
        ),
      ).rejects.toBeDefined();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          code: 'invalid_grant',
          kind: 'provider_client',
          status: 400,
        }),
      );
      expect(JSON.stringify(mockLoggerService.error.mock.calls)).not.toContain(
        'super-secret-authorization-code',
      );
      expect(JSON.stringify(mockLoggerService.error.mock.calls)).not.toContain(
        'Authorization code expired',
      );
    });
  });

  describe('getUserProfile', () => {
    it('should fetch and map user profile correctly', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            email: 'john@example.com',
            family_name: 'Doe',
            given_name: 'John',
            sub: 'linkedin-user-123',
          },
        }),
      );

      const result = await service.getUserProfile('access-token');

      expect(result).toEqual({
        email: 'john@example.com',
        firstName: 'John',
        id: 'linkedin-user-123',
        lastName: 'Doe',
      });
      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://api.linkedin.com/v2/userinfo',
        expect.objectContaining({
          headers: { Authorization: 'Bearer access-token' },
          timeout: 30000,
        }),
      );
    });

    it('should throw when profile fetch fails', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Unauthorized')),
      );

      await expect(service.getUserProfile('bad-token')).rejects.toThrow(
        'Unauthorized',
      );
    });
  });

  describe('refreshToken', () => {
    const orgId = 'test-object-id';
    const brandId = 'test-object-id';

    it('should refresh token and update credential', async () => {
      const credId = 'test-object-id';
      mockCredentialsService.findOne.mockResolvedValue({
        id: credId,
        refreshToken: 'encrypted-refresh-token',
      });
      mockAuthClientInstance.exchangeRefreshTokenForAccessToken.mockResolvedValue(
        {
          access_token: 'new-access-token',
          expires_in: 5184000,
          refresh_token: 'new-refresh-token',
        },
      );
      mockCredentialsService.patch.mockResolvedValue({
        id: credId,
        accessToken: 'new-access-token',
        isConnected: true,
      });

      await service.refreshToken(orgId, brandId);

      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        credId,
        expect.objectContaining({
          accessToken: 'new-access-token',
          isConnected: true,
        }),
      );
    });

    it('refreshes the account named by credentialId', async () => {
      // A brand may hold several LinkedIn accounts; token repair addresses the
      // named one instead of whichever happens to be the brand default.
      mockCredentialsService.findOne.mockResolvedValue({
        id: 'credential-2',
        refreshToken: 'encrypted-refresh-token',
      });
      mockAuthClientInstance.exchangeRefreshTokenForAccessToken.mockResolvedValue(
        {
          access_token: 'new-access-token',
          expires_in: 5184000,
          refresh_token: 'new-refresh-token',
        },
      );
      mockCredentialsService.patch.mockResolvedValue({ id: 'credential-2' });

      await service.refreshToken(orgId, brandId, 'credential-2');

      expect(mockCredentialsService.resolveBrandAccount).toHaveBeenCalledWith({
        brandId,
        credentialId: 'credential-2',
        isDisconnectedIncluded: true,
        organizationId: orgId,
        platform: 'linkedin',
      });
    });

    it('should throw when credential not found', async () => {
      mockCredentialsService.findOne.mockResolvedValue(null);

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        'LinkedIn credential not found',
      );
    });

    it('should return existing credentials when no refresh token', async () => {
      const cred = {
        id: 'test-object-id',
        accessToken: 'existing-token',
        refreshToken: null,
      };
      mockCredentialsService.findOne.mockResolvedValue(cred);

      const result = await service.refreshToken(orgId, brandId);
      expect(result).toEqual(cred);
    });

    it('should mark credential as disconnected on refresh failure', async () => {
      const credId = 'test-object-id';
      mockCredentialsService.findOne.mockResolvedValue({
        id: credId,
        refreshToken: 'encrypted-token',
      });
      mockAuthClientInstance.exchangeRefreshTokenForAccessToken.mockRejectedValue(
        new Error('Refresh failed'),
      );

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        'Refresh failed',
      );
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(credId, {
        isConnected: false,
      });
    });
  });

  describe('createTextPost', () => {
    it('publishes text posts through the shared integration HTTP client transport', async () => {
      mockCredentialsService.findOne.mockResolvedValue({
        id: 'credential-id',
        accessToken: 'encrypted-access-token',
        refreshToken: null,
      });
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            email: 'john@example.com',
            family_name: 'Doe',
            given_name: 'John',
            sub: 'linkedin-user-123',
          },
          status: 200,
        }),
      );
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            id: 'urn:li:activity:123',
          },
          status: 200,
        }),
      );

      const result = await service.createTextPost(
        'org-id',
        'brand-id',
        'Hello from Genfeed',
      );

      expect(result).toEqual({ id: 'urn:li:activity:123' });
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.linkedin.com/v2/ugcPosts',
        JSON.stringify({
          author: 'urn:li:person:linkedin-user-123',
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: {
                text: 'Hello from Genfeed',
              },
              shareMediaCategory: 'NONE',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer encrypted-access-token',
            'content-type': 'application/json',
          }),
          timeout: 30000,
        }),
      );
    });
  });

  describe('getTrends', () => {
    it('delegates public trend resolution through the server port', async () => {
      const resolvedTrends = [
        {
          growthRate: 20,
          mentions: 1,
          metadata: { source: 'public-reference' },
          topic: '#openai',
        },
      ];
      mockTrendResolver.resolve.mockResolvedValue(resolvedTrends);

      await expect(service.getTrends('org-123', 'brand-456')).resolves.toEqual(
        resolvedTrends,
      );
      expect(mockTrendResolver.resolve).toHaveBeenCalledWith(
        'org-123',
        'brand-456',
      );
    });
  });

  describe('listPostComments', () => {
    it('maps a recorded socialActions comments payload and keeps the start cursor', async () => {
      vi.spyOn(service, 'refreshToken').mockResolvedValue({
        accessToken: 'linkedin-access-token',
        id: 'cred-1',
      });
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            elements: [
              {
                $URN: 'urn:li:comment:(urn:li:activity:123,456)',
                actor: 'urn:li:person:abc',
                created: { time: Date.parse('2026-08-01T10:00:00.000Z') },
                id: 'urn:li:comment:(urn:li:activity:123,456)',
                message: { text: 'Congrats on the launch' },
              },
              {
                actor: 'urn:li:person:def',
                created: { time: Date.parse('2026-08-01T10:01:00.000Z') },
                id: 'urn:li:comment:(urn:li:activity:123,789)',
                message: { text: 'When is the waitlist open?' },
                parentComment: 'urn:li:comment:(urn:li:activity:123,456)',
              },
              {
                id: 'urn:li:comment:(urn:li:activity:123,000)',
                message: {},
              },
            ],
          },
        }),
      );

      const result = await service.listPostComments(
        'org-123',
        'brand-456',
        'urn:li:share:123',
        { limit: 50, start: 0 },
      );

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://api.linkedin.com/v2/socialActions/urn%3Ali%3Ashare%3A123/comments',
        expect.objectContaining({
          params: { count: 50, start: 0 },
          timeout: 30000,
        }),
      );
      expect(result).toEqual([
        {
          authorExternalId: 'urn:li:person:abc',
          commentId: 'urn:li:comment:(urn:li:activity:123,456)',
          createdAt: new Date('2026-08-01T10:00:00.000Z'),
          text: 'Congrats on the launch',
          threadId: 'urn:li:comment:(urn:li:activity:123,456)',
        },
        {
          authorExternalId: 'urn:li:person:def',
          commentId: 'urn:li:comment:(urn:li:activity:123,789)',
          createdAt: new Date('2026-08-01T10:01:00.000Z'),
          text: 'When is the waitlist open?',
          threadId: 'urn:li:comment:(urn:li:activity:123,456)',
        },
      ]);
    });
  });

  describe('listDirectMessages', () => {
    it('does not call LinkedIn when the connected grant has no mailbox scope', async () => {
      mockCredentialsService.findOne.mockResolvedValue({
        grantedScopes: ['openid', 'profile', 'email', 'w_member_social'],
        id: 'cred-1',
      });

      const result = await service.listDirectMessages('org-123', 'brand-456');

      expect(result).toEqual({
        isPermitted: false,
        reason: LINKEDIN_DM_UNAVAILABLE_REASON,
        threads: [],
      });
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it('reports mailbox ingestion as unavailable when the grant includes a mailbox scope', async () => {
      mockCredentialsService.findOne.mockResolvedValue({
        grantedScopes: ['openid', 'profile', 'email', 'r_member_mailbox'],
        id: 'cred-1',
      });

      const result = await service.listDirectMessages('org-123', 'brand-456');

      expect(result).toEqual({
        isImplemented: false,
        isPermitted: true,
        reason: LINKEDIN_DM_NOT_IMPLEMENTED_REASON,
        threads: [],
      });
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });
  });
});
