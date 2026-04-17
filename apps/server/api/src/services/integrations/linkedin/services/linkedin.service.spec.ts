vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
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
  AuthClient: vi.fn().mockImplementation(function () {
    return mockAuthClientInstance;
  }),
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('LinkedInService', () => {
  let service: LinkedInService;
  let credentialsService: CredentialsService;
  let httpService: HttpService;

  const mockCredentialsService = {
    findOne: vi.fn(),
    patch: vi.fn(),
  };

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

  const mockBrandScraperService = {
    scrapeLinkedIn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkedInService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const config: Record<string, string> = {
                LINKEDIN_CLIENT_ID: 'test-client-id',
                LINKEDIN_CLIENT_SECRET: 'test-client-secret',
                LINKEDIN_REDIRECT_URI: 'http://localhost:3000/oauth/linkedin',
              };
              return config[key];
            }),
          },
        },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: CredentialsService, useValue: mockCredentialsService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: BrandScraperService, useValue: mockBrandScraperService },
      ],
    }).compile();

    service = module.get<LinkedInService>(LinkedInService);
    credentialsService = module.get<CredentialsService>(CredentialsService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAuthUrl', () => {
    it('should generate a valid OAuth URL with state', () => {
      const state = JSON.stringify({ brandId: '456', userId: '123' });
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

    it('should throw when auth code exchange fails', async () => {
      mockAuthClientInstance.exchangeAuthCodeForAccessToken.mockRejectedValue(
        new Error('Invalid authorization code'),
      );

      await expect(
        service.exchangeAuthCodeForAccessToken('bad-code'),
      ).rejects.toThrow('Invalid authorization code');
      expect(mockLoggerService.error).toHaveBeenCalled();
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
        { headers: { Authorization: 'Bearer access-token' } },
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
    const orgId = new Types.ObjectId().toString();
    const brandId = new Types.ObjectId().toString();

    it('should refresh token and update credential', async () => {
      const credId = new Types.ObjectId();
      mockCredentialsService.findOne.mockResolvedValue({
        _id: credId,
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
        _id: credId,
        accessToken: 'new-access-token',
        isConnected: true,
      });

      const result = await service.refreshToken(orgId, brandId);

      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        credId,
        expect.objectContaining({
          accessToken: 'new-access-token',
          isConnected: true,
        }),
      );
    });

    it('should throw when credential not found', async () => {
      mockCredentialsService.findOne.mockResolvedValue(null);

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        'LinkedIn credential not found',
      );
    });

    it('should return existing credentials when no refresh token', async () => {
      const cred = {
        _id: new Types.ObjectId(),
        accessToken: 'existing-token',
        refreshToken: null,
      };
      mockCredentialsService.findOne.mockResolvedValue(cred);

      const result = await service.refreshToken(orgId, brandId);
      expect(result).toEqual(cred);
    });

    it('should mark credential as disconnected on refresh failure', async () => {
      const credId = new Types.ObjectId();
      mockCredentialsService.findOne.mockResolvedValue({
        _id: credId,
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

  describe('getTrends', () => {
    it('should derive live topics from scraped public LinkedIn pages', async () => {
      mockBrandScraperService.scrapeLinkedIn.mockResolvedValueOnce({
        companyName: 'OpenAI',
        recentPosts: [
          'We are seeing strong momentum around #AI and enterprise adoption.',
          'Builders are shipping new workflows for #AI teams.',
        ],
        scrapedAt: new Date('2026-03-26T10:00:00.000Z'),
        sourceUrl: 'https://www.linkedin.com/company/openai/',
      });
      mockBrandScraperService.scrapeLinkedIn.mockResolvedValueOnce({
        companyName: 'Anthropic',
        recentPosts: [
          'Teams are investing more in #AI safety and enterprise deployment.',
        ],
        scrapedAt: new Date('2026-03-26T10:00:00.000Z'),
        sourceUrl: 'https://www.linkedin.com/company/anthropic-ai/',
      });
      mockBrandScraperService.scrapeLinkedIn.mockResolvedValue({
        companyName: 'Other',
        recentPosts: [],
        scrapedAt: new Date('2026-03-26T10:00:00.000Z'),
        sourceUrl: 'https://www.linkedin.com/company/other/',
      });

      const trends = await service.getTrends();

      expect(trends.length).toBeGreaterThan(0);
      expect(trends[0]?.topic).toBe('#ai');
      expect(trends[0]?.metadata.source).toBe('public-scrape');
      expect(trends[0]?.mentions).toBeGreaterThan(1);
    });

    it('should fall back to curated topics when scraping yields no signal', async () => {
      mockBrandScraperService.scrapeLinkedIn.mockResolvedValue({
        companyName: 'Empty',
        recentPosts: [],
        scrapedAt: new Date('2026-03-26T10:00:00.000Z'),
        sourceUrl: 'https://www.linkedin.com/company/empty/',
      });

      const trends = await service.getTrends('org-123', 'brand-456');

      expect(trends.length).toBe(10);
      expect(trends[0]).toEqual(
        expect.objectContaining({
          metadata: expect.objectContaining({ source: 'curated' }),
          topic: '#ai',
        }),
      );
      expect(mockLoggerService.warn).toHaveBeenCalled();
    });
  });
});
