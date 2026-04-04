import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

describe('InstagramService', () => {
  let service: InstagramService;

  const credentialsMock = {
    findOne: vi.fn(),
  } as CredentialsService;

  const httpServiceMock = {
    get: vi.fn(),
    post: vi.fn(),
  } as HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstagramService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('') },
        },
        { provide: CredentialsService, useValue: credentialsMock },
        { provide: HttpService, useValue: httpServiceMock },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<InstagramService>(InstagramService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendCommentReplyDm', () => {
    it('sends a direct message to commenter', async () => {
      vi.spyOn(service, 'refreshToken').mockResolvedValue({
        accessToken: 'tok',
        externalId: 'acc',
      });

      (httpServiceMock.post as vi.Mock).mockReturnValue(
        of({ data: { id: 'msg' } }),
      );

      const result = await service.sendCommentReplyDm(
        'org',
        'acct',
        'user',
        'hello',
      );

      expect(httpServiceMock.post).toHaveBeenCalledWith(
        `https://graph.facebook.com/v24.0/acc/messages`,
        {
          message: { text: 'hello' },
          messaging_product: 'instagram',
          messaging_type: 'RESPONSE',
          recipient: { id: 'user' },
        },
        { params: { access_token: 'tok' } },
      );

      expect(result).toBe('msg');
    });
  });

  /*
  describe('getAvailableHandles', () => {
    it('should return available Instagram Business handles', async () => {
      const mockAxiosGet = axios.get;

      // Mock Facebook user info
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          id: 'facebook_user_id',
          name: 'Facebook User',
        },
      });

      // Mock pages with Instagram Business brand
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'page_id',
              name: 'Test Page',
              instagram_business_account: {
                id: 'instagram_business_id',
              },
            },
          ],
        },
      });

      // Mock Instagram brand info
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          id: 'instagram_business_id',
          username: 'test_username',
          name: 'Test Account',
        },
      });

      // Mock successful publish test (Business brand)
      const mockAxiosPost = axios.post;
      mockAxiosPost.mockResolvedValueOnce({});

      const result = await service.getAvailableHandles('valid_token');

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://graph.facebook.com/v23.0/me',
        expect.objectContaining({
          params: expect.objectContaining({
            access_token: 'valid_token',
            fields: 'id,name',
          }),
        }),
      );

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://graph.facebook.com/v23.0/me/accounts',
        expect.objectContaining({
          params: expect.objectContaining({
            access_token: 'valid_token',
            fields: 'id,name,instagram_business_account',
          }),
        }),
      );

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://graph.facebook.com/v23.0/instagram_business_id',
        expect.objectContaining({
          params: expect.objectContaining({
            access_token: 'valid_token',
            fields: 'id,username,name',
          }),
        }),
      );

      expect(result).toEqual([
        {
          type: CredentialPlatform.FACEBOOK,
          id: 'facebook_user_id',
          name: 'Facebook User',
          username: null,
          handle: 'Facebook User',
        },
        {
          type: CredentialPlatform.INSTAGRAM,
          id: 'instagram_business_id',
          name: 'Test Account',
          username: 'test_username',
          handle: 'test_username',
          pageName: 'Test Page',
          accountType: 'business',
          canPublish: true,
        },
      ]);
    });

    it('should exclude Creator accounts that cannot publish', async () => {
      const mockAxiosGet = axios.get;
      const mockAxiosPost = axios.post;

      // Mock Facebook user info
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          id: 'facebook_user_id',
          name: 'Facebook User',
        },
      });

      // Mock pages with Instagram brand
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'page_id',
              name: 'Test Page',
              instagram_business_account: {
                id: 'instagram_creator_id',
              },
            },
          ],
        },
      });

      // Mock Instagram brand info
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          id: 'instagram_creator_id',
          username: 'creator_username',
          name: 'Creator Account',
        },
      });

      // Mock Creator brand error (cannot publish)
      mockAxiosPost.mockRejectedValueOnce({
        response: {
          data: {
            error: {
              code: 10,
              message: 'Creator account not supported',
            },
          },
        },
      });

      const result = await service.getAvailableHandles('valid_token');

      // Should only return Facebook profile, not the Creator Instagram brand
      expect(result).toEqual([
        {
          type: CredentialPlatform.FACEBOOK,
          id: 'facebook_user_id',
          name: 'Facebook User',
          username: null,
          handle: 'Facebook User',
        },
      ]);
    });

    it('should handle pages without Instagram accounts', async () => {
      const mockAxiosGet = axios.get;

      // Mock Facebook user info
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          id: 'facebook_user_id',
          name: 'Facebook User',
        },
      });

      // Mock pages without Instagram brand
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'page_id',
              name: 'Test Page',
              // No instagram_business_account
            },
          ],
        },
      });

      const result = await service.getAvailableHandles('valid_token');

      // Should only return Facebook profile
      expect(result).toEqual([
        {
          type: CredentialPlatform.FACEBOOK,
          id: 'facebook_user_id',
          name: 'Facebook User',
          username: null,
          handle: 'Facebook User',
        },
      ]);
    });

    it('should handle Instagram account info fetch errors', async () => {
      const mockAxiosGet = axios.get;

      // Mock Facebook user info
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          id: 'facebook_user_id',
          name: 'Facebook User',
        },
      });

      // Mock pages with Instagram brand
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'page_id',
              name: 'Test Page',
              instagram_business_account: {
                id: 'instagram_business_id',
              },
            },
          ],
        },
      });

      // Mock Instagram brand info error
      mockAxiosGet.mockRejectedValueOnce(new Error('Instagram API error'));

      const result = await service.getAvailableHandles('valid_token');

      // Should only return Facebook profile, skip the problematic Instagram brand
      expect(result).toEqual([
        {
          type: CredentialPlatform.FACEBOOK,
          id: 'facebook_user_id',
          name: 'Facebook User',
          username: null,
          handle: 'Facebook User',
        },
      ]);
    });
  });
  */

  /*
  describe('getMediaAnalytics', () => {
    it('should fetch video stats successfully', async () => {
      credentialsFindOneMock.mockResolvedValue({ accessToken: 'valid_token' });
      const mockAxiosGet = axios.get;
      mockAxiosGet.mockResolvedValue({
        data: { play_count: 100, like_count: 25, comments_count: 5 },
      });

      const result = await service.getMediaAnalytics(
        '507f191e810c19729de860ea',
        '507f191e810c19729de860eb',
        'media_id',
      );

      expect(credentialsFindOneMock).toHaveBeenCalledWith({
        user: expect.any(Object),
        brand: expect.any(Object),
        platform: CredentialPlatform.INSTAGRAM,
      });

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://graph.facebook.com/v23.0/media_id',
        expect.objectContaining({
          params: expect.objectContaining({
            access_token: 'valid_token',
            fields: 'like_count,comments_count,play_count',
          }),
        }),
      );

      expect(result).toEqual({
        views: 100,
        likes: 25,
        comments: 5,
      });
    });

    it('should handle missing credential', async () => {
      credentialsFindOneMock.mockResolvedValue(null);

      await expect(
        service.getMediaAnalytics(
          '507f191e810c19729de860ea',
          '507f191e810c19729de860eb',
          'media_id',
        ),
      ).rejects.toThrow('Instagram credential not found');
    });

    it('should handle missing access token', async () => {
      credentialsFindOneMock.mockResolvedValue({ accessToken: null });

      await expect(
        service.getMediaAnalytics(
          '507f191e810c19729de860ea',
          '507f191e810c19729de860eb',
          'media_id',
        ),
      ).rejects.toThrow('Instagram credential not found');
    });

    it('should handle missing stats data', async () => {
      credentialsFindOneMock.mockResolvedValue({ accessToken: 'valid_token' });
      const mockAxiosGet = axios.get;
      mockAxiosGet.mockResolvedValue({
        data: {}, // No stats data
      });

      const result = await service.getMediaAnalytics(
        '507f191e810c19729de860ea',
        '507f191e810c19729de860eb',
        'media_id',
      );

      expect(result).toEqual({
        views: 0,
        likes: 0,
        comments: 0,
      });
    });
  });
  */

  /*
  describe('uploadVideo', () => {
    it('should upload video successfully', async () => {
      credentialsFindOneMock.mockResolvedValue({
        externalId: 'instagram_business_id',
        accessToken: 'valid_token',
      });

      const mockAxiosPost = axios.post;

      // Mock media creation
      mockAxiosPost.mockResolvedValueOnce({
        data: { id: 'container_id' },
      });

      // Mock media publishing
      mockAxiosPost.mockResolvedValueOnce({
        data: { id: 'published_media_id' },
      });

      const result = await service.uploadVideo(
        '507f191e810c19729de860ea',
        '507f191e810c19729de860eb',
        'https://example.com/video.mp4',
        'Test caption',
      );

      expect(credentialsFindOneMock).toHaveBeenCalledWith({
        user: expect.any(Object),
        brand: expect.any(Object),
        platform: CredentialPlatform.INSTAGRAM,
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://graph.facebook.com/v23.0/instagram_business_id/media',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            media_type: 'VIDEO',
            video_url: 'https://example.com/video.mp4',
            caption: 'Test caption',
            access_token: 'valid_token',
          }),
        }),
      );

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://graph.facebook.com/v23.0/instagram_business_id/media_publish',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            creation_id: 'container_id',
            access_token: 'valid_token',
          }),
        }),
      );

      expect(result).toBe('published_media_id');
    });

    it('should handle missing credential', async () => {
      credentialsFindOneMock.mockResolvedValue(null);

      await expect(
        service.uploadVideo(
          '507f191e810c19729de860ea',
          '507f191e810c19729de860eb',
          'https://example.com/video.mp4',
          'Test caption',
        ),
      ).rejects.toThrow('Instagram credential not found');
    });
  });
  */

  /*
  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const mockAxiosGet = axios.get;
      mockAxiosGet.mockResolvedValue({
        data: { access_token: 'new_token', expires_in: 3600 },
      });

      const result = await service.refreshToken('old_token');

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://graph.facebook.com/oauth/access_token',
        expect.objectContaining({
          params: expect.objectContaining({
            grant_type: 'fb_exchange_token',
            fb_exchange_token: 'old_token',
          }),
        }),
      );

      expect(result).toEqual({
        access_token: 'new_token',
        expires_in: 3600,
      });
    });
  });
  */
});
