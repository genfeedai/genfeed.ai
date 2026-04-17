import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { FanvueService } from '@api/services/integrations/fanvue/services/fanvue.service';
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

describe('FanvueService', () => {
  let service: FanvueService;
  let httpService: vi.Mocked<HttpService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockClientId = 'fanvue-client-id';
  const mockClientSecret = 'fanvue-client-secret';
  const mockRedirectUri = 'https://app.example.com/fanvue/callback';

  beforeEach(async () => {
    const mockConfigService = {
      get: vi.fn((key: string) => {
        const config: Record<string, string> = {
          FANVUE_CLIENT_ID: mockClientId,
          FANVUE_CLIENT_SECRET: mockClientSecret,
          FANVUE_REDIRECT_URI: mockRedirectUri,
        };
        return config[key];
      }),
    };

    const mockHttpService = {
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
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
        FanvueService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: CredentialsService, useValue: mockCredentialsService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<FanvueService>(FanvueService);
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

  describe('generatePkce', () => {
    it('should return codeVerifier and codeChallenge', () => {
      const result = service.generatePkce();

      expect(result).toHaveProperty('codeVerifier');
      expect(result).toHaveProperty('codeChallenge');
      expect(typeof result.codeVerifier).toBe('string');
      expect(typeof result.codeChallenge).toBe('string');
    });

    it('should generate codeVerifier with maximum 128 characters', () => {
      const result = service.generatePkce();

      expect(result.codeVerifier.length).toBeLessThanOrEqual(128);
      expect(result.codeVerifier.length).toBeGreaterThan(0);
    });

    it('should generate different PKCE pairs on each call', () => {
      const result1 = service.generatePkce();
      const result2 = service.generatePkce();

      expect(result1.codeVerifier).not.toBe(result2.codeVerifier);
      expect(result1.codeChallenge).not.toBe(result2.codeChallenge);
    });

    it('should generate base64url-safe codeChallenge', () => {
      const result = service.generatePkce();

      // base64url should not contain +, /, or =
      expect(result.codeChallenge).not.toMatch(/[+/=]/);
    });
  });

  describe('buildAuthUrl', () => {
    it('should return a valid Fanvue OAuth URL', () => {
      const state = 'random-state';
      const codeChallenge = 'challenge-abc';
      const url = service.buildAuthUrl(state, codeChallenge);

      expect(url).toContain('https://auth.fanvue.com/oauth2/auth');
      expect(url).toContain(`client_id=${mockClientId}`);
      expect(url).toContain(
        `redirect_uri=${encodeURIComponent(mockRedirectUri)}`,
      );
      expect(url).toContain('response_type=code');
      expect(url).toContain('code_challenge_method=S256');
      expect(url).toContain(`code_challenge=${codeChallenge}`);
      expect(url).toContain(`state=${state}`);
    });

    it('should include all required scopes', () => {
      const url = service.buildAuthUrl('state', 'challenge');

      expect(url).toContain('scope=');
      expect(url).toContain('openid');
      expect(url).toContain('offline_access');
      expect(url).toContain('read%3Aself');
      expect(url).toContain('read%3Amedia');
      expect(url).toContain('write%3Amedia');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange code for tokens successfully', async () => {
      const mockTokenResponse = {
        access_token: 'fv-access-token',
        expires_in: 3600,
        id_token: 'fv-id-token',
        refresh_token: 'fv-refresh-token',
        scope: 'openid offline_access',
        token_type: 'Bearer',
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockTokenResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.exchangeCodeForTokens(
        'auth-code',
        'verifier-123',
      );

      expect(result).toEqual(mockTokenResponse);
      expect(httpService.post).toHaveBeenCalledWith(
        'https://auth.fanvue.com/oauth2/token',
        expect.stringContaining('code=auth-code'),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          expiresIn: 3600,
          hasAccessToken: true,
          hasRefreshToken: true,
        }),
      );
    });

    it('should include code_verifier in token exchange request', async () => {
      const mockTokenResponse = {
        access_token: 'token',
        expires_in: 3600,
        id_token: 'id',
        refresh_token: 'refresh',
        scope: 'openid',
        token_type: 'Bearer',
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockTokenResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.exchangeCodeForTokens('code', 'my-verifier');

      const postBody = httpService.post.mock.calls[0][1] as string;
      expect(postBody).toContain('code_verifier=my-verifier');
      expect(postBody).toContain('grant_type=authorization_code');
      expect(postBody).toContain(`client_id=${mockClientId}`);
      expect(postBody).toContain(`client_secret=${mockClientSecret}`);
    });

    it('should throw and log error when API request fails', async () => {
      const apiError = Object.assign(new Error('Bad Request'), {
        response: { data: { error: 'invalid_grant' }, status: 400 },
      });

      httpService.post.mockReturnValue(throwError(() => apiError));

      await expect(
        service.exchangeCodeForTokens('bad-code', 'verifier'),
      ).rejects.toThrow('Bad Request');
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          error: { error: 'invalid_grant' },
          httpCode: 400,
        }),
      );
    });
  });

  describe('refreshToken', () => {
    const orgId = new Types.ObjectId().toString();
    const brandId = new Types.ObjectId().toString();

    it('should return existing token when it does not need refresh', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      const mockCredential = {
        _id: new Types.ObjectId(),
        accessToken: 'encrypted-access-token',
        accessTokenExpiry: futureDate,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh-token',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);

      const result = await service.refreshToken(orgId, brandId);

      expect(result.accessToken).toBe('decrypted_encrypted-access-token');
      expect(result.credential).toEqual(mockCredential);
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('should refresh token when it expires within 10 minutes', async () => {
      const nearExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
      const mockCredential = {
        _id: new Types.ObjectId(),
        accessToken: 'encrypted-old-token',
        accessTokenExpiry: nearExpiry,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh-token',
      };

      const mockTokenResponse = {
        access_token: 'new-access-token',
        expires_in: 3600,
        refresh_token: 'new-refresh-token',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockTokenResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );
      credentialsService.patch.mockResolvedValue({
        ...mockCredential,
        accessToken: 'new-access-token',
      } as never);

      const result = await service.refreshToken(orgId, brandId);

      expect(result.accessToken).toBe('new-access-token');
      expect(httpService.post).toHaveBeenCalledWith(
        'https://auth.fanvue.com/oauth2/token',
        expect.stringContaining('grant_type=refresh_token'),
        expect.any(Object),
      );
      expect(credentialsService.patch).toHaveBeenCalledWith(
        mockCredential._id,
        expect.objectContaining({
          accessToken: 'new-access-token',
          isConnected: true,
          refreshToken: 'new-refresh-token',
        }),
      );
    });

    it('should throw when credential is not found', async () => {
      credentialsService.findOne.mockResolvedValue(null as never);

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        'Fanvue credential not found',
      );
    });

    it('should disconnect and throw when tokens are missing', async () => {
      const mockCredential = {
        _id: new Types.ObjectId(),
        accessToken: undefined,
        platform: CredentialPlatform.FANVUE,
        refreshToken: undefined,
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        'Fanvue tokens not found',
      );
      expect(credentialsService.patch).toHaveBeenCalledWith(
        mockCredential._id,
        { isConnected: false },
      );
    });

    it('should disconnect when token refresh API call fails', async () => {
      const nearExpiry = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes from now
      const mockCredential = {
        _id: new Types.ObjectId(),
        accessToken: 'encrypted-token',
        accessTokenExpiry: nearExpiry,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      httpService.post.mockReturnValue(
        throwError(() => new Error('Token refresh failed')),
      );

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        'Token refresh failed',
      );
      expect(credentialsService.patch).toHaveBeenCalledWith(
        mockCredential._id,
        { isConnected: false },
      );
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should use old refresh token when new one is not returned', async () => {
      const nearExpiry = new Date(Date.now() + 3 * 60 * 1000);
      const mockCredential = {
        _id: new Types.ObjectId(),
        accessToken: 'encrypted-token',
        accessTokenExpiry: nearExpiry,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-old-refresh',
      };

      const mockTokenResponse = {
        access_token: 'new-access',
        expires_in: 7200,
        refresh_token: undefined,
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockTokenResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );
      credentialsService.patch.mockResolvedValue(mockCredential as never);

      await service.refreshToken(orgId, brandId);

      expect(credentialsService.patch).toHaveBeenCalledWith(
        mockCredential._id,
        expect.objectContaining({
          refreshToken: 'decrypted_encrypted-old-refresh',
        }),
      );
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile successfully', async () => {
      const mockProfile = {
        displayName: 'Test User',
        email: 'test@example.com',
        handle: 'testuser',
        uuid: 'fv-uuid-123',
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: mockProfile,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.getUserProfile('access-token');

      expect(result).toEqual(mockProfile);
      expect(httpService.get).toHaveBeenCalledWith(
        'https://api.fanvue.com/users/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer access-token',
            'X-Fanvue-API-Version': '2025-06-26',
          }),
        }),
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ handle: 'testuser', uuid: 'fv-uuid-123' }),
      );
    });

    it('should throw and log error when API call fails', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Profile fetch failed')),
      );

      await expect(service.getUserProfile('bad-token')).rejects.toThrow(
        'Profile fetch failed',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('uploadMedia', () => {
    const accessToken = 'fv-access-token';
    const mediaUrl = 'https://cdn.example.com/media/photo.jpg';

    it('should upload a small image (single chunk) successfully', async () => {
      // Step 0: Download file from CDN
      const smallFile = Buffer.alloc(1024, 'a'); // 1KB file
      httpService.get
        .mockReturnValueOnce(
          of({
            config: {} as never,
            data: smallFile,
            headers: {},
            status: 200,
            statusText: 'OK',
          }),
        )
        // Step 2: Get signed URL
        .mockReturnValueOnce(
          of({
            config: {} as never,
            data: {
              expiresAt: '2024-01-01T01:00:00Z',
              method: 'PUT',
              partNumber: 1,
              signedUrl: 'https://s3.example.com/signed-url',
            },
            headers: {},
            status: 200,
            statusText: 'OK',
          }),
        );

      // Step 1: Create upload session
      httpService.post.mockReturnValueOnce(
        of({
          config: {} as never,
          data: {
            mediaUuid: 'media-uuid-123',
            status: 'created',
            uploadId: 'upload-id-456',
          },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      // Step 3: Upload chunk
      httpService.put.mockReturnValueOnce(
        of({
          config: {} as never,
          data: {},
          headers: { etag: '"abc123"' },
          status: 200,
          statusText: 'OK',
        }),
      );

      // Step 4: Complete upload
      httpService.patch.mockReturnValueOnce(
        of({
          config: {} as never,
          data: { status: 'completed' },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.uploadMedia(accessToken, mediaUrl, 'image');

      expect(result).toBe('media-uuid-123');
      expect(httpService.post).toHaveBeenCalledWith(
        'https://api.fanvue.com/media/uploads',
        expect.objectContaining({
          fileName: 'photo.jpg',
          fileSize: 1024,
          mediaType: 'image',
          mimeType: 'image/jpeg',
        }),
        expect.any(Object),
      );
      expect(httpService.put).toHaveBeenCalledWith(
        'https://s3.example.com/signed-url',
        expect.any(Buffer),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      );
      expect(httpService.patch).toHaveBeenCalledWith(
        'https://api.fanvue.com/media/uploads/upload-id-456',
        expect.objectContaining({
          parts: [{ etag: '"abc123"', partNumber: 1 }],
        }),
        expect.any(Object),
      );
    });

    it('should use video mime type for video uploads', async () => {
      const smallFile = Buffer.alloc(512, 'v');
      httpService.get
        .mockReturnValueOnce(
          of({
            config: {} as never,
            data: smallFile,
            headers: {},
            status: 200,
            statusText: 'OK',
          }),
        )
        .mockReturnValueOnce(
          of({
            config: {} as never,
            data: {
              expiresAt: '',
              method: 'PUT',
              partNumber: 1,
              signedUrl: 'https://s3.example.com/url',
            },
            headers: {},
            status: 200,
            statusText: 'OK',
          }),
        );

      httpService.post.mockReturnValueOnce(
        of({
          config: {} as never,
          data: {
            mediaUuid: 'video-uuid',
            status: 'created',
            uploadId: 'upload-vid',
          },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      httpService.put.mockReturnValueOnce(
        of({
          config: {} as never,
          data: {},
          headers: { etag: '"xyz"' },
          status: 200,
          statusText: 'OK',
        }),
      );

      httpService.patch.mockReturnValueOnce(
        of({
          config: {} as never,
          data: {},
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const videoUrl = 'https://cdn.example.com/media/clip.mp4';
      const result = await service.uploadMedia(accessToken, videoUrl, 'video');

      expect(result).toBe('video-uuid');
      const postData = httpService.post.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(postData.mimeType).toBe('video/mp4');
      expect(postData.mediaType).toBe('video');
    });

    it('should throw and log error when file download fails', async () => {
      httpService.get.mockReturnValueOnce(
        throwError(() => new Error('CDN unavailable')),
      );

      await expect(
        service.uploadMedia(accessToken, mediaUrl, 'image'),
      ).rejects.toThrow('CDN unavailable');
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should throw and log error when upload session creation fails', async () => {
      httpService.get.mockReturnValueOnce(
        of({
          config: {} as never,
          data: Buffer.alloc(100),
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );
      httpService.post.mockReturnValueOnce(
        throwError(() => new Error('Session creation failed')),
      );

      await expect(
        service.uploadMedia(accessToken, mediaUrl, 'image'),
      ).rejects.toThrow('Session creation failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('createPost', () => {
    const orgId = new Types.ObjectId().toString();
    const brandId = new Types.ObjectId().toString();

    it('should create a post successfully', async () => {
      // Mock refreshToken internals
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const mockCredential = {
        _id: new Types.ObjectId(),
        accessToken: 'encrypted-token',
        accessTokenExpiry: futureDate,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);

      const mockPostResponse = {
        content: 'Hello Fanvue!',
        createdAt: '2024-01-01T00:00:00Z',
        uuid: 'post-uuid-123',
        visibility: 'public',
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockPostResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.createPost(orgId, brandId, 'Hello Fanvue!');

      expect(result).toEqual(mockPostResponse);
      expect(httpService.post).toHaveBeenCalledWith(
        'https://api.fanvue.com/posts',
        expect.objectContaining({
          content: 'Hello Fanvue!',
          isLocked: false,
          price: 0,
          visibility: 'public',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Fanvue-API-Version': '2025-06-26',
          }),
        }),
      );
    });

    it('should include mediaUuids when provided', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const mockCredential = {
        _id: new Types.ObjectId(),
        accessToken: 'encrypted-token',
        accessTokenExpiry: futureDate,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);

      const mockPostResponse = {
        content: 'Post with media',
        createdAt: '2024-01-01T00:00:00Z',
        uuid: 'post-uuid-456',
        visibility: 'public',
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockPostResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.createPost(orgId, brandId, 'Post with media', [
        'media-1',
        'media-2',
      ]);

      const postBody = httpService.post.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(postBody.mediaUuids).toEqual(['media-1', 'media-2']);
    });

    it('should not include mediaUuids when not provided', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const mockCredential = {
        _id: new Types.ObjectId(),
        accessToken: 'encrypted-token',
        accessTokenExpiry: futureDate,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: {
            content: 'Text only',
            createdAt: '',
            uuid: 'uuid',
            visibility: 'public',
          },
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await service.createPost(orgId, brandId, 'Text only');

      const postBody = httpService.post.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(postBody.mediaUuids).toBeUndefined();
    });

    it('should throw when refreshToken fails (credential not found)', async () => {
      credentialsService.findOne.mockResolvedValue(null as never);

      await expect(
        service.createPost(orgId, brandId, 'Content'),
      ).rejects.toThrow('Fanvue credential not found');
    });

    it('should throw and log error when post creation API fails', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const mockCredential = {
        _id: new Types.ObjectId(),
        accessToken: 'encrypted-token',
        accessTokenExpiry: futureDate,
        platform: CredentialPlatform.FANVUE,
        refreshToken: 'encrypted-refresh',
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      httpService.post.mockReturnValue(
        throwError(() => new Error('Post creation failed')),
      );

      await expect(
        service.createPost(orgId, brandId, 'Content'),
      ).rejects.toThrow('Post creation failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
