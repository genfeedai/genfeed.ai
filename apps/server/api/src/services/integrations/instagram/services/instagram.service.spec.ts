import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => value),
    encrypt: vi.fn((value: string) => value),
  },
}));

describe('InstagramService', () => {
  let service: InstagramService;

  const credentialsMock = {
    findAll: vi.fn(),
    findBrandAccounts: vi.fn(),
    findConnectedAccounts: vi.fn(),
    findOne: vi.fn(),
    mergeWarmupSignals: vi.fn(),
    patch: vi.fn(),
    // The service resolves its account through the multi-account resolver;
    // the double answers with whatever `findOne` is primed to return so the
    // existing single-account cases keep describing one connected account.
    resolveBrandAccount: vi.fn(),
  } satisfies ServerCredentialStore;
  credentialsMock.resolveBrandAccount.mockImplementation(
    (options: { credentialId?: string | null }) =>
      (credentialsMock.findOne as Mock)(options),
  );

  const httpServiceMock = {
    get: vi.fn(),
    post: vi.fn(),
  } as unknown as HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstagramService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('') },
        },
        {
          provide: SERVER_TOKENS.credentials,
          useValue: credentialsMock,
        },
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
      vi.spyOn(service, 'getValidCredential').mockResolvedValue({
        id: 'credential-id',
        accessToken: 'tok',
        externalId: 'acc',
      });

      (httpServiceMock.post as Mock).mockReturnValue(
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

  describe('listMediaComments', () => {
    it('flattens replies under the top-level comment id and clamps the limit', async () => {
      vi.spyOn(service, 'getValidCredential').mockResolvedValue({
        id: 'credential-id',
        accessToken: 'tok',
        externalId: 'acc',
      });

      (httpServiceMock.get as Mock).mockReturnValue(
        of({
          data: {
            data: [
              {
                from: { id: 'author-1', username: 'taylor' },
                id: 'comment-1',
                replies: {
                  data: [
                    {
                      from: { id: 'author-2', username: 'sam' },
                      id: 'comment-2',
                      text: 'Same question',
                      timestamp: '2026-08-01T10:05:00+0000',
                    },
                    // No text — a sticker or deleted body carries nothing to ingest.
                    { id: 'comment-3', timestamp: '2026-08-01T10:06:00+0000' },
                  ],
                },
                text: 'Pricing?',
                timestamp: '2026-08-01T10:00:00+0000',
              },
            ],
          },
        }),
      );

      const result = await service.listMediaComments(
        'org',
        'brand',
        'media-1',
        250,
      );

      expect(httpServiceMock.get).toHaveBeenCalledWith(
        'https://graph.facebook.com/v24.0/media-1/comments',
        {
          params: {
            access_token: 'tok',
            fields:
              'id,text,timestamp,username,from{id,username},replies{id,text,timestamp,username,from{id,username}}',
            limit: 100,
          },
        },
      );
      expect(result).toEqual([
        {
          authorExternalId: 'author-1',
          authorUsername: 'taylor',
          commentId: 'comment-1',
          createdAt: new Date('2026-08-01T10:00:00+0000'),
          text: 'Pricing?',
          threadId: 'comment-1',
        },
        {
          authorExternalId: 'author-2',
          authorUsername: 'sam',
          commentId: 'comment-2',
          createdAt: new Date('2026-08-01T10:05:00+0000'),
          text: 'Same question',
          threadId: 'comment-1',
        },
      ]);
    });
  });

  describe('listConversations', () => {
    it('keys threads by conversation id and keeps only inbound messages', async () => {
      vi.spyOn(service, 'getValidCredential').mockResolvedValue({
        id: 'credential-id',
        accessToken: 'tok',
        externalId: 'account-1',
      });

      (httpServiceMock.get as Mock).mockReturnValue(
        of({
          data: {
            data: [
              {
                id: 'conversation-1',
                messages: {
                  data: [
                    {
                      created_time: '2026-08-01T11:00:00+0000',
                      from: {
                        id: 'participant-1',
                        name: 'Taylor',
                        username: 'taylor',
                      },
                      id: 'message-1',
                      message: 'Do you ship to the EU?',
                    },
                    // Our own send — recorded when the DM action ran.
                    {
                      created_time: '2026-08-01T11:02:00+0000',
                      from: { id: 'account-1', username: 'brand' },
                      id: 'message-2',
                      message: 'We do!',
                    },
                  ],
                },
                participants: {
                  data: [
                    { id: 'account-1', username: 'brand' },
                    { id: 'participant-1', name: 'Taylor', username: 'taylor' },
                  ],
                },
                updated_time: '2026-08-01T11:02:00+0000',
              },
            ],
          },
        }),
      );

      const result = await service.listConversations('org', 'brand', 10);

      expect(httpServiceMock.get).toHaveBeenCalledWith(
        'https://graph.facebook.com/v24.0/account-1/conversations',
        {
          params: {
            access_token: 'tok',
            fields:
              'id,updated_time,participants{id,username,name},messages.limit(10){id,message,created_time,from{id,username,name}}',
            limit: 10,
            platform: 'instagram',
          },
        },
      );
      expect(result).toEqual([
        {
          conversationId: 'conversation-1',
          messages: [
            {
              createdAt: new Date('2026-08-01T11:00:00+0000'),
              messageId: 'message-1',
              senderExternalId: 'participant-1',
              senderName: 'Taylor',
              senderUsername: 'taylor',
              text: 'Do you ship to the EU?',
            },
          ],
          participantExternalId: 'participant-1',
          participantName: 'Taylor',
          participantUsername: 'taylor',
          updatedAt: new Date('2026-08-01T11:02:00+0000'),
        },
      ]);
    });
  });

  describe('getTrends', () => {
    it('returns empty trends when no Instagram credential is connected', async () => {
      (credentialsMock.findOne as Mock).mockResolvedValue(null);

      const result = await service.getTrends('org', 'brand');

      expect(result).toEqual([]);
      expect(httpServiceMock.get).not.toHaveBeenCalled();
    });

    it('maps connected account hashtag engagement without static fallback trends', async () => {
      (credentialsMock.findOne as Mock).mockResolvedValue({
        accessToken: 'token',
        accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        externalId: 'instagram-account',
        id: 'credential-id',
        isConnected: true,
      });
      (httpServiceMock.get as Mock).mockReturnValue(
        of({
          data: {
            data: [
              { caption: '#AI #Genfeed', comments_count: 2, like_count: 10 },
              { caption: '#AI', comments_count: 1, like_count: 4 },
            ],
          },
        }),
      );

      const result = await service.getTrends('org', 'brand');

      expect(result).toEqual([
        { growthRate: 0, mentions: 17, topic: '#AI' },
        { growthRate: 0, mentions: 12, topic: '#Genfeed' },
      ]);
    });

    it('does not return hard-coded hashtags when provider lookup fails', async () => {
      (credentialsMock.findOne as Mock).mockResolvedValue({
        accessToken: 'token',
        accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        externalId: 'instagram-account',
        id: 'credential-id',
        isConnected: true,
      });
      (httpServiceMock.get as Mock).mockReturnValue(
        throwError(() => new Error('Meta unavailable')),
      );

      const result = await service.getTrends('org', 'brand');

      expect(result).toEqual([]);
    });
  });

  describe('getValidCredential', () => {
    it('returns stored credential when access token is not near expiry', async () => {
      credentialsMock.findOne = vi.fn().mockResolvedValue({
        accessToken: 'fresh-token',
        accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        externalId: 'ig-account-id',
        id: 'credential-id',
        isConnected: true,
      });
      const refreshSpy = vi.spyOn(service, 'refreshToken');

      const result = await service.getValidCredential('org-id', 'brand-id');

      expect(result).toEqual({
        id: 'credential-id',
        accessToken: 'fresh-token',
        externalId: 'ig-account-id',
        isConnected: true,
      });
      expect(refreshSpy).not.toHaveBeenCalled();
    });

    it('refreshes when access token is inside the refresh buffer', async () => {
      credentialsMock.findOne = vi.fn().mockResolvedValue({
        accessToken: 'stale-token',
        accessTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
        externalId: 'ig-account-id',
        id: 'credential-id',
        isConnected: true,
      });
      const refreshSpy = vi.spyOn(service, 'refreshToken').mockResolvedValue({
        id: 'credential-id',
        accessToken: 'new-token',
        externalId: 'ig-account-id',
        isConnected: true,
      });

      const result = await service.getValidCredential('org-id', 'brand-id');

      expect(refreshSpy).toHaveBeenCalledWith('org-id', 'brand-id', undefined);
      expect(result.accessToken).toBe('new-token');
    });

    it('resolves the named account when a credential id is provided', async () => {
      // A brand may hold several Instagram accounts; publish paths always name
      // the one the post belongs to.
      credentialsMock.findOne = vi.fn().mockResolvedValue({
        accessToken: 'fresh-token',
        accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        externalId: 'ig-account-id',
        id: 'credential-42',
        isConnected: true,
      });

      await service.getValidCredential('org-id', 'brand-id', 'credential-42');

      expect(credentialsMock.resolveBrandAccount).toHaveBeenCalledWith({
        brandId: 'brand-id',
        credentialId: 'credential-42',
        isDisconnectedIncluded: true,
        organizationId: 'org-id',
        platform: 'instagram',
      });
    });

    it('asks for the brand default when no credential id is provided', async () => {
      credentialsMock.findOne = vi.fn().mockResolvedValue({
        accessToken: 'fresh-token',
        accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        externalId: 'ig-account-id',
        id: 'credential-1',
        isConnected: true,
      });

      await service.getValidCredential('org-id', 'brand-id');

      expect(credentialsMock.resolveBrandAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-id',
          credentialId: undefined,
          platform: 'instagram',
        }),
      );
    });
  });

  describe('handleAuthorizationError', () => {
    it('disconnects only on Graph authorization failures', async () => {
      credentialsMock.patch = vi.fn().mockResolvedValue({});

      await expect(
        service.handleAuthorizationError(
          'credential-id',
          {
            response: {
              data: { error: { code: 190, message: 'Invalid token' } },
              status: 401,
            },
          },
          'refresh',
        ),
      ).resolves.toBe(true);
      expect(credentialsMock.patch).toHaveBeenCalledWith('credential-id', {
        isConnected: false,
      });

      await expect(
        service.handleAuthorizationError(
          'credential-id',
          {
            response: {
              data: { error: { code: 10, message: 'Permission denied' } },
              status: 403,
            },
          },
          'refresh',
        ),
      ).resolves.toBe(false);
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
        '000000000000000000000001',
        '000000000000000000000002',
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
          '000000000000000000000001',
          '000000000000000000000002',
          'media_id',
        ),
      ).rejects.toThrow('Instagram credential not found');
    });

    it('should handle missing access token', async () => {
      credentialsFindOneMock.mockResolvedValue({ accessToken: null });

      await expect(
        service.getMediaAnalytics(
          '000000000000000000000001',
          '000000000000000000000002',
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
        '000000000000000000000001',
        '000000000000000000000002',
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
        '000000000000000000000001',
        '000000000000000000000002',
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
          '000000000000000000000001',
          '000000000000000000000002',
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
