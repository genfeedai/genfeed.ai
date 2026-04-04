import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((val: string) => val),
    encrypt: vi.fn((val: string) => val),
  },
}));

describe('TiktokService', () => {
  let service: TiktokService;
  let httpService: HttpService;
  let mockLoggerError: vi.Mock;

  const configMock = {
    get: vi.fn((key: string) => {
      if (key === 'TIKTOK_CLIENT_KEY') {
        return 'key';
      }
      if (key === 'TIKTOK_CLIENT_SECRET') {
        return 'secret';
      }
      return '';
    }),
  } as unknown as ConfigService;

  const credentialsMock = {
    findOne: vi
      .fn()
      .mockResolvedValue({ accessToken: 'access', tokenExpiry: new Date() }),
    patch: vi.fn().mockResolvedValue({}),
  } as unknown as CredentialsService;

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const httpServiceMock = {
    get: vi.fn(),
    post: vi.fn(),
  } as unknown as HttpService;

  beforeEach(async () => {
    mockLoggerError = vi.fn();
    loggerMock.error = mockLoggerError;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TiktokService,
        { provide: ConfigService, useValue: configMock },
        { provide: CredentialsService, useValue: credentialsMock },
        { provide: LoggerService, useValue: loggerMock },
        { provide: HttpService, useValue: httpServiceMock },
      ],
    }).compile();

    service = module.get<TiktokService>(TiktokService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadVideo', () => {
    it('sends request and returns data', async () => {
      const mockPost = { label: 'Test video' };

      // Mock the refreshToken call
      vi.spyOn(service, 'refreshToken').mockResolvedValue({
        accessToken: 'test-token',
      } as unknown as import('@api/collections/credentials/entities/credential.entity').CredentialEntity);

      // Mock getCreatorInfo to avoid real API calls
      vi.spyOn(service, 'getCreatorInfo').mockResolvedValue({
        comment_disabled: false,
        creator_avatar_url: '',
        creator_nickname: 'Test',
        creator_username: 'test',
        duet_disabled: false,
        max_video_post_duration_sec: 600,
        privacy_level_options: ['SELF_ONLY'],
        stitch_disabled: false,
      });

      // Mock the HttpService post call
      (httpService.post as vi.Mock).mockReturnValue(
        of({
          data: { data: { publish_id: 'test-id' } },
          status: 200,
        }),
      );

      // Mock the getPublishStatus call
      vi.spyOn(service, 'getPublishStatus').mockResolvedValue({
        publicly_available_post_id: ['post-123'],
        status: 'PUBLISH_COMPLETE',
      } as unknown as import('@genfeedai/interfaces').ITikTokPublishStatusData);

      const res = await service.uploadVideo(
        'org-id',
        'account-id',
        'http://video.url',
        mockPost,
      );

      expect(res.data.post_id).toEqual('post-123');
      expect(httpService.post).toHaveBeenCalled();
    });

    it('throws on non-200 response', async () => {
      const mockPost = { label: 'Test video' };

      // Mock the refreshToken call
      vi.spyOn(service, 'refreshToken').mockResolvedValue({
        accessToken: 'test-token',
      } as unknown as import('@api/collections/credentials/entities/credential.entity').CredentialEntity);

      // Mock getCreatorInfo to avoid real API calls
      vi.spyOn(service, 'getCreatorInfo').mockResolvedValue({
        comment_disabled: false,
        creator_avatar_url: '',
        creator_nickname: 'Test',
        creator_username: 'test',
        duet_disabled: false,
        max_video_post_duration_sec: 600,
        privacy_level_options: ['SELF_ONLY'],
        stitch_disabled: false,
      });

      (httpService.post as vi.Mock).mockReturnValue(
        of({
          data: {},
          status: 500,
        }),
      );

      await expect(
        service.uploadVideo(
          'org-id',
          'account-id',
          'http://video.url',
          mockPost,
        ),
      ).rejects.toThrow('TikTok API returned non-200 status');

      expect(mockLoggerError).toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('refreshes token and saves credentials', async () => {
      (credentialsMock.findOne as vi.Mock).mockResolvedValue({
        _id: 'credential-id',
        refreshToken: 'ref',
      });

      (httpService.post as vi.Mock).mockReturnValue(
        of({
          data: {
            access_token: 'nac',
            expires_in: 10,
            refresh_token: 'nref',
            refresh_token_expires_in: 20,
          },
        }),
      );

      (credentialsMock.patch as vi.Mock).mockResolvedValue({
        _id: 'credential-id',
        accessToken: 'nac',
        isConnected: true,
        oauthTokenHash: '',
        refreshToken: 'nref',
        toObject: vi.fn().mockReturnValue({
          _id: 'credential-id',
          accessToken: 'nac',
          isConnected: true,
          oauthTokenHash: '',
          refreshToken: 'nref',
        }),
      });

      const result = await service.refreshToken(
        '507f191e810c19729de860ea',
        '507f191e810c19729de860eb',
      );

      expect(result).toBeInstanceOf(CredentialEntity);
      expect(httpService.post).toHaveBeenCalled();
      expect(credentialsMock.patch).toHaveBeenCalledWith('credential-id', {
        accessToken: 'nac',
        accessTokenExpiry: expect.any(Date),
        isConnected: true,
        refreshToken: 'nref',
        refreshTokenExpiry: expect.any(Date),
      });
    });

    it('throws when no refresh token exists', async () => {
      (credentialsMock.findOne as vi.Mock).mockResolvedValue(undefined);

      await expect(
        service.refreshToken(
          '507f191e810c19729de860ea',
          '507f191e810c19729de860eb',
        ),
      ).rejects.toThrow('No refresh token available');
    });
  });

  describe('getTrends', () => {
    it('returns trending hashtags without credentials', async () => {
      (httpService.get as vi.Mock).mockReturnValue(of({ data: {} }));
      (credentialsMock.findOne as vi.Mock).mockResolvedValue(null);

      const result = await service.getTrends('o', 'a');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('topic');
    });
  });

  describe('getMediaAnalytics', () => {
    it('returns stats', async () => {
      (credentialsMock.findOne as vi.Mock).mockResolvedValue({
        accessToken: 'tok',
      });

      (httpService.get as vi.Mock).mockReturnValue(
        of({
          data: {
            data: {
              videos: [
                {
                  comment_count: 1,
                  download_count: 0,
                  like_count: 2,
                  share_count: 0,
                  view_count: 5,
                },
              ],
            },
          },
        }),
      );

      const res = await service.getMediaAnalytics(
        '507f191e810c19729de860ea',
        '507f191e810c19729de860eb',
        'v',
      );

      expect(httpService.get).toHaveBeenCalled();
      expect(res).toEqual({
        averageWatchTime: undefined,
        comments: 1,
        completionRate: undefined,
        downloads: undefined,
        engagementRate: 60,
        impressions: undefined,
        likes: 2,
        mediaType: 'video',
        reach: undefined,
        shares: undefined,
        views: 5,
      });
    });
  });
});
