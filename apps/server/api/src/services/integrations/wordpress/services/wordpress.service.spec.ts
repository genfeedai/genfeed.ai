import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { WordpressService } from '@api/services/integrations/wordpress/services/wordpress.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => `decrypted_${value}`),
    encrypt: vi.fn((value: string) => `encrypted_${value}`),
  },
}));

describe('WordpressService', () => {
  let service: WordpressService;
  let httpService: vi.Mocked<HttpService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockClientId = 'wp-client-id-12345';
  const mockClientSecret = 'wp-client-secret';
  const mockRedirectUri = 'https://app.example.com/wordpress/callback';

  beforeEach(async () => {
    const mockConfigService = {
      get: vi.fn((key: string) => {
        const config: Record<string, string> = {
          WORDPRESS_CLIENT_ID: mockClientId,
          WORDPRESS_CLIENT_SECRET: mockClientSecret,
          WORDPRESS_REDIRECT_URI: mockRedirectUri,
        };
        return config[key];
      }),
    };

    const mockHttpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    const mockCredentialsService = {
      findOne: vi.fn(),
      patch: vi.fn(),
    };

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WordpressService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: CredentialsService, useValue: mockCredentialsService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<WordpressService>(WordpressService);
    httpService = module.get(HttpService);
    credentialsService = module.get(CredentialsService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAuthUrl', () => {
    it('should return a valid WordPress OAuth URL', () => {
      const state = 'random-state-123';
      const url = service.generateAuthUrl(state);

      expect(url).toContain(
        'https://public-api.wordpress.com/oauth2/authorize',
      );
      expect(url).toContain(`client_id=${mockClientId}`);
      expect(url).toContain(
        `redirect_uri=${encodeURIComponent(mockRedirectUri)}`,
      );
      expect(url).toContain('response_type=code');
      expect(url).toContain(`state=${state}`);
    });

    it('should encode special characters in state', () => {
      const state = 'state with spaces&special=chars';
      const url = service.generateAuthUrl(state);

      expect(url).toContain('state=');
      expect(url).not.toContain('state=state with spaces');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for token successfully', async () => {
      const mockResponseData = {
        access_token: 'wp-access-token-123',
        blog_id: '12345',
        blog_url: 'https://myblog.wordpress.com',
        token_type: 'bearer',
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.exchangeCodeForToken('auth-code-abc');

      expect(result).toEqual({
        accessToken: 'wp-access-token-123',
        blogId: '12345',
        blogUrl: 'https://myblog.wordpress.com',
      });
      expect(httpService.post).toHaveBeenCalledWith(
        'https://public-api.wordpress.com/oauth2/token',
        expect.stringContaining('code=auth-code-abc'),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          blogId: '12345',
          blogUrl: 'https://myblog.wordpress.com',
        }),
      );
    });

    it('should include grant_type authorization_code in request', async () => {
      const mockResponseData = {
        access_token: 'token',
        blog_id: '1',
        blog_url: 'https://blog.com',
        token_type: 'bearer',
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.exchangeCodeForToken('code');

      const postBody = httpService.post.mock.calls[0][1] as string;
      expect(postBody).toContain('grant_type=authorization_code');
      expect(postBody).toContain(`client_id=${mockClientId}`);
      expect(postBody).toContain(`client_secret=${mockClientSecret}`);
    });

    it('should throw and log error when API request fails', async () => {
      const apiError = new Error('Invalid authorization code');
      httpService.post.mockReturnValue(throwError(() => apiError));

      await expect(service.exchangeCodeForToken('bad-code')).rejects.toThrow(
        'Invalid authorization code',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    const orgId = 'test-object-id';
    const brandId = 'test-object-id';

    it('should validate token successfully by making a test API call', async () => {
      const mockCredential = {
        _id: 'test-object-id',
        accessToken: 'encrypted-access-token',
        platform: CredentialPlatform.WORDPRESS,
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: { display_name: 'Test User', ID: 123 },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.refreshToken(orgId, brandId);

      expect(result).toEqual({ isValid: true });
      expect(credentialsService.findOne).toHaveBeenCalledWith({
        brand: brandId,
        isDeleted: false,
        organization: orgId,
        platform: CredentialPlatform.WORDPRESS,
      });
      expect(httpService.get).toHaveBeenCalledWith(
        'https://public-api.wordpress.com/rest/v1.1/me',
        expect.objectContaining({
          headers: { Authorization: expect.stringContaining('Bearer') },
        }),
      );
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('should throw when credential is not found', async () => {
      credentialsService.findOne.mockResolvedValue(null as never);

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        'WordPress credential not found or missing access token',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should throw when credential has no accessToken', async () => {
      const mockCredential = {
        _id: 'test-object-id',
        accessToken: undefined,
        platform: CredentialPlatform.WORDPRESS,
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        'WordPress credential not found or missing access token',
      );
    });

    it('should throw when validation API call fails', async () => {
      const mockCredential = {
        _id: 'test-object-id',
        accessToken: 'encrypted-token',
        platform: CredentialPlatform.WORDPRESS,
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      httpService.get.mockReturnValue(
        throwError(() => new Error('Unauthorized')),
      );

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('createPost', () => {
    const accessToken = 'wp-access-token';
    const siteId = '12345';

    it('should create a post with basic fields', async () => {
      const mockResponseData = {
        ID: 42,
        slug: 'hello-world',
        status: 'publish',
        title: 'Hello World',
        URL: 'https://myblog.wordpress.com/2024/01/01/hello-world',
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.createPost(
        accessToken,
        siteId,
        'Hello World',
        '<p>Post content</p>',
      );

      expect(result).toBe('42');
      expect(httpService.post).toHaveBeenCalledWith(
        `https://public-api.wordpress.com/rest/v1.1/sites/${siteId}/posts/new`,
        expect.objectContaining({
          content: '<p>Post content</p>',
          status: 'publish',
          title: 'Hello World',
        }),
        expect.objectContaining({
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ postId: 42 }),
      );
    });

    it('should create a post with categories and tags', async () => {
      const mockResponseData = {
        ID: 43,
        slug: 'post',
        status: 'publish',
        title: 'Tagged Post',
        URL: 'https://myblog.wordpress.com/post',
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.createPost(
        accessToken,
        siteId,
        'Tagged Post',
        'Content',
        'publish',
        ['Tech', 'AI'],
        ['genfeed', 'automation'],
      );

      const postData = httpService.post.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(postData.categories).toBe('Tech,AI');
      expect(postData.tags).toBe('genfeed,automation');
    });

    it('should create a post with featured image', async () => {
      const mockResponseData = {
        ID: 44,
        slug: 'post',
        status: 'draft',
        title: 'Image Post',
        URL: 'https://myblog.wordpress.com/post',
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.createPost(
        accessToken,
        siteId,
        'Image Post',
        'Content',
        'draft',
        undefined,
        undefined,
        'https://cdn.example.com/featured.jpg',
      );

      const postData = httpService.post.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(postData.featured_image).toBe(
        'https://cdn.example.com/featured.jpg',
      );
      expect(postData.status).toBe('draft');
    });

    it('should not include categories when array is empty', async () => {
      const mockResponseData = {
        ID: 45,
        slug: '',
        status: 'publish',
        title: '',
        URL: '',
      };
      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.createPost(
        accessToken,
        siteId,
        'Title',
        'Content',
        'publish',
        [],
      );

      const postData = httpService.post.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(postData.categories).toBeUndefined();
    });

    it('should not include tags when array is empty', async () => {
      const mockResponseData = {
        ID: 46,
        slug: '',
        status: 'publish',
        title: '',
        URL: '',
      };
      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.createPost(
        accessToken,
        siteId,
        'Title',
        'Content',
        'publish',
        undefined,
        [],
      );

      const postData = httpService.post.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(postData.tags).toBeUndefined();
    });

    it('should default status to publish', async () => {
      const mockResponseData = {
        ID: 47,
        slug: '',
        status: 'publish',
        title: '',
        URL: '',
      };
      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.createPost(accessToken, siteId, 'Title', 'Content');

      const postData = httpService.post.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(postData.status).toBe('publish');
    });

    it('should throw and log error when API call fails', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('WordPress API error')),
      );

      await expect(
        service.createPost(accessToken, siteId, 'Title', 'Content'),
      ).rejects.toThrow('WordPress API error');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('getPostAnalytics', () => {
    const accessToken = 'wp-access-token';
    const siteId = '12345';
    const postId = '42';

    it('should return post analytics successfully', async () => {
      const mockStats = {
        comments: 5,
        likes: 15,
        views: 100,
        visitors: 80,
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: mockStats,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.getPostAnalytics(
        accessToken,
        siteId,
        postId,
      );

      expect(result).toEqual(mockStats);
      expect(httpService.get).toHaveBeenCalledWith(
        `https://public-api.wordpress.com/rest/v1.1/sites/${siteId}/stats/post/${postId}`,
        expect.objectContaining({
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('should throw and log error when API call fails', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Stats unavailable')),
      );

      await expect(
        service.getPostAnalytics(accessToken, siteId, postId),
      ).rejects.toThrow('Stats unavailable');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('getMediaAnalytics', () => {
    it('should return zeroed analytics (not fully implemented)', async () => {
      const orgId = 'test-object-id';
      const brandId = 'test-object-id';
      const externalId = 'ext-123';

      const result = await service.getMediaAnalytics(
        orgId,
        brandId,
        externalId,
      );

      expect(result).toEqual({
        comments: 0,
        likes: 0,
        views: 0,
      });
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('WordPress analytics not fully implemented'),
        expect.objectContaining({
          brandId,
          externalId,
          organizationId: orgId,
        }),
      );
    });
  });
});
