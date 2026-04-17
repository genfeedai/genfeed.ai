import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { YoutubeOAuth2Util } from '@api/shared/utils/youtube-oauth/youtube-oauth.util';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

// Mock external utils
vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn(),
  },
}));

vi.mock('@api/shared/utils/youtube-oauth/youtube-oauth.util', () => ({
  YoutubeOAuth2Util: {
    createClient: vi.fn(),
  },
}));

describe('YoutubeAuthService', () => {
  let service: YoutubeAuthService;
  let credentialsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let configService: { get: ReturnType<typeof vi.fn> };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const orgId = 'test-object-id'.toHexString();
  const brandId = 'test-object-id'.toHexString();

  const mockCredential = {
    _id: 'test-object-id',
    refreshToken: 'encrypted-refresh-token-value-that-is-long-enough',
    refreshTokenExpiry: new Date(),
  };

  const mockOAuthClient = {
    credentials: {} as Record<string, unknown>,
    getAccessToken: vi.fn(),
    setCredentials: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    credentialsService = {
      findOne: vi.fn().mockResolvedValue(mockCredential),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    configService = {
      get: vi.fn().mockReturnValue('test-value'),
    };

    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    vi.mocked(EncryptionUtil.decrypt).mockReturnValue(
      'decrypted-refresh-token-that-is-definitely-longer-than-fifty-characters-here',
    );
    vi.mocked(YoutubeOAuth2Util.createClient).mockReturnValue(mockOAuthClient);

    // Default: successful token refresh
    mockOAuthClient.credentials = {
      access_token: 'new-access-token',
      expiry_date: Date.now() + 3600000,
    };
    mockOAuthClient.getAccessToken.mockResolvedValue({
      res: { status: 200 },
      token: 'new-access-token',
    });
    mockOAuthClient.setCredentials.mockImplementation(
      (creds: Record<string, unknown>) => {
        mockOAuthClient.credentials = {
          ...mockOAuthClient.credentials,
          ...creds,
        };
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeAuthService,
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: loggerService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<YoutubeAuthService>(YoutubeAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return an OAuth2 client on successful token refresh', async () => {
    const result = await service.refreshToken(orgId, brandId);

    expect(result).toBe(mockOAuthClient);
    expect(credentialsService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        isDeleted: false,
        platform: 'youtube',
      }),
    );
    expect(EncryptionUtil.decrypt).toHaveBeenCalledWith(
      mockCredential.refreshToken,
    );
    expect(mockOAuthClient.setCredentials).toHaveBeenCalledWith({
      refresh_token: expect.any(String),
    });
  });

  it('should throw when no credentials are found', async () => {
    credentialsService.findOne.mockResolvedValueOnce(null);

    await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
      'Youtube credential not found',
    );
  });

  it('should mark credential as disconnected and throw when refreshToken is missing', async () => {
    credentialsService.findOne.mockResolvedValueOnce({
      _id: 'test-object-id',
      refreshToken: null,
    });

    await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
      'Youtube refresh token not found',
    );
    expect(credentialsService.patch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ isConnected: false }),
    );
  });

  it('should throw when decryption returns null/empty', async () => {
    vi.mocked(EncryptionUtil.decrypt).mockReturnValueOnce(
      null as unknown as string,
    );

    await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
      'Failed to decrypt refresh token',
    );
  });

  it('should update credential with new access token and expiry on success', async () => {
    await service.refreshToken(orgId, brandId);

    expect(credentialsService.patch).toHaveBeenCalledWith(
      mockCredential._id,
      expect.objectContaining({
        accessToken: 'new-access-token',
        isConnected: true,
        isDeleted: false,
      }),
    );
  });

  it('should update refresh token in credentials when a new one is returned', async () => {
    // Override setCredentials so that after getAccessToken, credentials include a new refresh_token
    mockOAuthClient.setCredentials.mockImplementation(() => {
      // After setCredentials + getAccessToken, the final credentials state:
      mockOAuthClient.credentials = {
        access_token: 'new-access',
        expiry_date: Date.now() + 3600000,
        refresh_token: 'rotated-refresh-token',
      };
    });

    await service.refreshToken(orgId, brandId);

    expect(credentialsService.patch).toHaveBeenCalledWith(
      mockCredential._id,
      expect.objectContaining({
        refreshToken: 'rotated-refresh-token',
      }),
    );
  });

  it('should throw HttpException with UNAUTHORIZED for invalid_grant errors', async () => {
    const invalidGrantError = new Error('invalid_grant') as Error & {
      response?: { data?: Record<string, unknown> };
    };
    invalidGrantError.response = { data: { error: 'invalid_grant' } };
    mockOAuthClient.getAccessToken.mockRejectedValueOnce(invalidGrantError);

    try {
      await service.refreshToken(orgId, brandId);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }

    // Should mark credential as disconnected
    expect(credentialsService.patch).toHaveBeenCalledWith(
      mockCredential._id,
      expect.objectContaining({ isConnected: false }),
    );
  });

  it('should rethrow non-invalid_grant errors as-is', async () => {
    const genericError = new Error('Network timeout');
    mockOAuthClient.getAccessToken.mockRejectedValueOnce(genericError);

    await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
      'Network timeout',
    );
    expect(credentialsService.patch).toHaveBeenCalledWith(
      mockCredential._id,
      expect.objectContaining({ isConnected: false }),
    );
  });

  it('should throw when access_token is missing from refresh response', async () => {
    mockOAuthClient.credentials = { access_token: null };
    mockOAuthClient.getAccessToken.mockResolvedValueOnce({
      res: null,
      token: null,
    });

    await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
      'Failed to obtain access token from refresh',
    );
  });

  it('should warn when decrypted refresh token is too short (< 50 chars)', async () => {
    vi.mocked(EncryptionUtil.decrypt).mockReturnValueOnce('short-token');

    // Still has access_token so will succeed
    await service.refreshToken(orgId, brandId);

    expect(loggerService.warn).toHaveBeenCalledWith(
      'Refresh token seems too short',
      expect.objectContaining({ length: 11 }),
    );
  });
});
