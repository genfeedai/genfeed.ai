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

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

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
          useValue: loggerMock,
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

  describe('listAuthorizedInstagramAccounts', () => {
    it('paginates with the after cursor, not the raw paging.next URL', async () => {
      (httpServiceMock.get as Mock)
        .mockReturnValueOnce(
          of({
            data: {
              data: [
                {
                  id: 'page-1',
                  instagram_business_account: {
                    id: 'ig-1',
                    name: 'Brand One',
                    profile_picture_url: 'https://cdn.example.com/one.jpg',
                    username: 'brandone',
                  },
                },
                { id: 'page-2' },
              ],
              paging: {
                cursors: { after: 'cursor-1' },
                next: 'https://graph.facebook.com/v24.0/me/accounts?after=cursor-1&access_token=token',
              },
            },
          }),
        )
        .mockReturnValueOnce(
          of({
            data: {
              data: [
                {
                  id: 'page-3',
                  instagram_business_account: {
                    id: 'ig-2',
                    name: 'Brand Two',
                    profile_picture_url: 'https://cdn.example.com/two.jpg',
                    username: 'brandtwo',
                  },
                },
              ],
            },
          }),
        );

      const result = await service.listAuthorizedInstagramAccounts('token');

      expect(result).toEqual([
        {
          id: 'ig-1',
          image: 'https://cdn.example.com/one.jpg',
          label: 'Brand One',
          platform: 'instagram',
          username: 'brandone',
        },
        {
          id: 'ig-2',
          image: 'https://cdn.example.com/two.jpg',
          label: 'Brand Two',
          platform: 'instagram',
          username: 'brandtwo',
        },
      ]);
      expect(httpServiceMock.get).toHaveBeenNthCalledWith(
        1,
        'https://graph.facebook.com/v24.0/me/accounts',
        {
          params: {
            access_token: 'token',
            fields:
              'id,name,instagram_business_account{id,username,name,profile_picture_url}',
          },
        },
      );
      // The second request never touches the `paging.next` URL (it embeds
      // access_token in a string that ends up in logs/history) — it reuses
      // the same endpoint with an `after` cursor param instead.
      expect(httpServiceMock.get).toHaveBeenNthCalledWith(
        2,
        'https://graph.facebook.com/v24.0/me/accounts',
        {
          params: {
            access_token: 'token',
            after: 'cursor-1',
            fields:
              'id,name,instagram_business_account{id,username,name,profile_picture_url}',
          },
        },
      );
    });

    it('returns an empty list when the token manages no professional account', async () => {
      (httpServiceMock.get as Mock).mockReturnValue(of({ data: { data: [] } }));

      const result = await service.listAuthorizedInstagramAccounts('token');

      expect(result).toEqual([]);
    });

    it('stops following pagination at the page cap instead of looping forever', async () => {
      (httpServiceMock.get as Mock).mockImplementation(() =>
        of({
          data: {
            data: [],
            paging: {
              cursors: { after: 'always-more' },
              next: 'https://graph.facebook.com/v24.0/me/accounts?after=always-more',
            },
          },
        }),
      );

      await service.listAuthorizedInstagramAccounts('token');

      // 25 is the documented cap (INSTAGRAM_ACCOUNT_LIST_MAX_PAGES).
      expect(httpServiceMock.get).toHaveBeenCalledTimes(25);
    });

    it('never lets access_token reach the logs on failure', async () => {
      (httpServiceMock.get as Mock).mockReturnValue(
        throwError(() => ({
          config: { params: { access_token: 'super-secret-token' } },
          response: {
            data: { error: { code: 190, message: 'Token expired' } },
            status: 401,
          },
        })),
      );

      await expect(
        service.listAuthorizedInstagramAccounts('super-secret-token'),
      ).rejects.toBeTruthy();

      const loggedPayloads = JSON.stringify(loggerMock.error.mock.calls);
      expect(loggedPayloads).not.toContain('super-secret-token');
    });
  });
});
