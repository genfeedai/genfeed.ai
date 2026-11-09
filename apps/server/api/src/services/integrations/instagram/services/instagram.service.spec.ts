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

  it('rejects a messaging success response without message_id', async () => {
    vi.spyOn(service, 'getValidCredential').mockResolvedValue({
      id: 'credential-id',
      accessToken: 'tok',
      externalId: 'acc',
    });
    (httpServiceMock.post as Mock).mockReturnValue(
      of({ data: { recipient_id: 'user' } }),
    );
    await expect(
      service.sendDirectMessage('org', 'brand', 'user', 'hello'),
    ).rejects.toThrow('message_id');
  });

  it('reports missing captured messaging grants before attempting any provider request', async () => {
    vi.spyOn(service, 'getValidCredential').mockResolvedValue({
      id: 'credential',
      accessToken: 'tok',
      externalId: 'acc',
      grantedScopes: ['instagram_basic'],
    });
    await expect(
      service.sendDirectMessage('org', 'brand', 'user', 'hello'),
    ).rejects.toThrow('instagram_manage_messages');
    expect(httpServiceMock.post).not.toHaveBeenCalled();
    expect(httpServiceMock.get).not.toHaveBeenCalled();
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
        'https://graph.facebook.com/v26.0/media-1/comments',
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
                    {
                      id: 'participant-1',
                      name: 'Taylor',
                      username: 'taylor',
                    },
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
        'https://graph.facebook.com/v26.0/account-1/conversations',
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
        externalBusinessId: 'business-1',
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
        externalBusinessId: 'business-1',
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
        externalBusinessId: 'business-1',
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

    it('keeps a Unified Login token without a stored expiry and never exchanges it', async () => {
      credentialsMock.findOne = vi.fn().mockResolvedValue({
        accessToken: 'business-token',
        accessTokenExpiry: null,
        externalBusinessId: 'business-1',
        externalId: 'ig-account-id',
        id: 'credential-id',
        isConnected: true,
      });

      const result = await service.getValidCredential('org-id', 'brand-id');

      expect(result).toEqual({
        accessToken: 'business-token',
        externalId: 'ig-account-id',
        id: 'credential-id',
        isConnected: true,
      });
      expect(httpServiceMock.get).not.toHaveBeenCalled();
    });

    it('disconnects a Unified Login token whose stored expiry has passed', async () => {
      credentialsMock.findOne = vi.fn().mockResolvedValue({
        accessToken: 'business-token',
        accessTokenExpiry: new Date(Date.now() - 1000),
        externalBusinessId: 'business-1',
        externalId: 'ig-account-id',
        id: 'credential-id',
        isConnected: true,
      });
      credentialsMock.patch = vi.fn().mockResolvedValue({});

      await expect(
        service.getValidCredential('org-id', 'brand-id'),
      ).rejects.toThrow('Please reconnect your account');
      expect(credentialsMock.patch).toHaveBeenCalledWith('credential-id', {
        isConnected: false,
      });
    });

    it('disconnects a retired Facebook-Login credential and asks for a reconnect', async () => {
      credentialsMock.findOne = vi.fn().mockResolvedValue({
        accessToken: 'facebook-user-token',
        accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        externalBusinessId: null,
        externalId: 'ig-account-id',
        id: 'credential-id',
        isConnected: true,
      });
      credentialsMock.patch = vi.fn().mockResolvedValue({});

      await expect(
        service.getValidCredential('org-id', 'brand-id'),
      ).rejects.toThrow('Instagram now connects without a Facebook Page');
      expect(credentialsMock.patch).toHaveBeenCalledWith('credential-id', {
        isConnected: false,
      });
      expect(httpServiceMock.get).not.toHaveBeenCalled();
    });

    it('resolves the named account when a credential id is provided', async () => {
      // A brand may hold several Instagram accounts; publish paths always name
      // the one the post belongs to.
      credentialsMock.findOne = vi.fn().mockResolvedValue({
        accessToken: 'fresh-token',
        accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        externalBusinessId: 'business-1',
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
        externalBusinessId: 'business-1',
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

  describe('refreshToken', () => {
    const unifiedRow = {
      accessToken: 'business-token',
      accessTokenExpiry: null,
      externalBusinessId: 'business-1',
      externalId: 'ig-account-id',
      id: 'credential-id',
      isConnected: true,
    };

    it('keeps the token and re-records scopes and expiry from debug_token', async () => {
      credentialsMock.findOne = vi.fn().mockResolvedValue(unifiedRow);
      credentialsMock.patch = vi
        .fn()
        .mockImplementation(
          async (_id: string, update: Record<string, unknown>) => ({
            ...unifiedRow,
            ...update,
          }),
        );
      (httpServiceMock.get as Mock).mockReturnValue(
        of({
          data: {
            data: {
              expires_at: 1_700_000_000,
              is_valid: true,
              scopes: ['instagram_basic', 'instagram_manage_messages'],
            },
          },
        }),
      );

      const result = await service.refreshToken('org-id', 'brand-id');

      expect(result.accessToken).toBe('business-token');
      expect(result.grantedScopes).toEqual([
        'instagram_basic',
        'instagram_manage_messages',
      ]);
      const request = (httpServiceMock.get as Mock).mock.calls[0];
      expect(request[0]).toBe('https://graph.facebook.com/v26.0/debug_token');
      expect(request[1].params.input_token).toBe('business-token');
      expect(request[1].params).not.toHaveProperty('fb_exchange_token');
      expect(credentialsMock.patch).toHaveBeenCalledWith(
        'credential-id',
        expect.objectContaining({
          accessTokenExpiry: new Date(1_700_000_000 * 1000),
          isConnected: true,
        }),
      );
    });

    it('disconnects a token Meta reports invalid', async () => {
      credentialsMock.findOne = vi.fn().mockResolvedValue(unifiedRow);
      credentialsMock.patch = vi.fn().mockResolvedValue({});
      (httpServiceMock.get as Mock).mockReturnValue(
        of({ data: { data: { is_valid: false } } }),
      );

      await expect(service.refreshToken('org-id', 'brand-id')).rejects.toThrow(
        'no longer valid',
      );
      expect(credentialsMock.patch).toHaveBeenCalledWith('credential-id', {
        isConnected: false,
      });
    });

    it('disconnects a retired Facebook-Login credential instead of exchanging its token', async () => {
      credentialsMock.findOne = vi.fn().mockResolvedValue({
        ...unifiedRow,
        accessToken: 'facebook-user-token',
        externalBusinessId: null,
      });
      credentialsMock.patch = vi.fn().mockResolvedValue({});

      await expect(service.refreshToken('org-id', 'brand-id')).rejects.toThrow(
        'Instagram now connects without a Facebook Page',
      );
      expect(credentialsMock.patch).toHaveBeenCalledWith('credential-id', {
        isConnected: false,
      });
      expect(httpServiceMock.get).not.toHaveBeenCalled();
    });

    it('leaves the account connected when Meta is only temporarily unavailable', async () => {
      credentialsMock.findOne = vi.fn().mockResolvedValue(unifiedRow);
      credentialsMock.patch = vi.fn().mockResolvedValue({});
      (httpServiceMock.get as Mock).mockReturnValue(
        throwError(() => new Error('Meta unavailable')),
      );

      await expect(service.refreshToken('org-id', 'brand-id')).rejects.toThrow(
        'Meta unavailable',
      );
      expect(credentialsMock.patch).not.toHaveBeenCalled();
    });
  });

  describe('messaging', () => {
    const unifiedCredential = {
      accessToken: 'business-token',
      externalId: 'ig-account-id',
      id: 'credential-id',
    };

    it('sends a direct message from the account itself, with no Facebook Page lookup', async () => {
      vi.spyOn(service, 'getValidCredential').mockResolvedValue(
        unifiedCredential,
      );
      (httpServiceMock.post as Mock).mockReturnValue(
        of({ data: { message_id: 'msg-1', recipient_id: 'user' } }),
      );

      const result = await service.sendDirectMessage(
        'org',
        'brand',
        'user',
        'hello',
      );

      expect(result).toBe('msg-1');
      expect(httpServiceMock.post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v26.0/ig-account-id/messages',
        {
          message: { text: 'hello' },
          messaging_type: 'RESPONSE',
          recipient: { id: 'user' },
        },
        { params: { access_token: 'business-token' } },
      );
      expect(httpServiceMock.get).not.toHaveBeenCalled();
    });

    it('sends a private reply to a comment from the account itself', async () => {
      vi.spyOn(service, 'getValidCredential').mockResolvedValue(
        unifiedCredential,
      );
      (httpServiceMock.post as Mock).mockReturnValue(
        of({ data: { message_id: 'msg-2' } }),
      );

      await service.sendPrivateReply('org', 'brand', 'comment-9', 'thanks');

      expect(httpServiceMock.post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v26.0/ig-account-id/messages',
        {
          message: { text: 'thanks' },
          recipient: { comment_id: 'comment-9' },
        },
        { params: { access_token: 'business-token' } },
      );
    });

    it('asks for a reconnect when the captured grant lacks the messaging permission', async () => {
      vi.spyOn(service, 'getValidCredential').mockResolvedValue({
        ...unifiedCredential,
        grantedScopes: ['instagram_basic'],
      });

      await expect(
        service.sendDirectMessage('org', 'brand', 'user', 'hello'),
      ).rejects.toThrow('instagram_manage_messages');
      expect(httpServiceMock.post).not.toHaveBeenCalled();
    });

    it('subscribes the account itself to message webhooks', async () => {
      vi.spyOn(service, 'getValidCredential').mockResolvedValue(
        unifiedCredential,
      );
      (httpServiceMock.post as Mock).mockReturnValue(
        of({ data: { success: true } }),
      );

      await service.subscribeToMessageWebhooks('org', 'brand');

      expect(httpServiceMock.post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v26.0/ig-account-id/subscribed_apps',
        null,
        {
          params: {
            access_token: 'business-token',
            subscribed_fields: 'messages',
          },
        },
      );
    });

    it('lists conversations on the account with the business token', async () => {
      vi.spyOn(service, 'getValidCredential').mockResolvedValue(
        unifiedCredential,
      );
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
                      from: { id: 'participant-1', username: 'taylor' },
                      id: 'message-1',
                      message: 'Do you ship to the EU?',
                    },
                  ],
                },
                participants: {
                  data: [{ id: 'participant-1' }, { id: 'ig-account-id' }],
                },
              },
            ],
          },
        }),
      );

      const result = await service.listConversations('org', 'brand', 10);

      expect(httpServiceMock.get).toHaveBeenCalledTimes(1);
      expect(httpServiceMock.get).toHaveBeenCalledWith(
        'https://graph.facebook.com/v26.0/ig-account-id/conversations',
        expect.objectContaining({
          params: expect.objectContaining({
            access_token: 'business-token',
            platform: 'instagram',
          }),
        }),
      );
      expect(result[0]?.messages[0]?.text).toBe('Do you ship to the EU?');
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
    it('lists assigned accounts, enriches each, and paginates with the after cursor', async () => {
      (httpServiceMock.get as Mock).mockImplementation(
        (url: string, config: { params: Record<string, string> }) => {
          if (url.endsWith('/me/assigned_instagram_accounts')) {
            return config.params.after === 'cursor-1'
              ? of({ data: { data: [{ id: 'ig-2', username: 'brandtwo' }] } })
              : of({
                  data: {
                    data: [{ id: 'ig-1', username: 'brandone' }, {}],
                    paging: {
                      cursors: { after: 'cursor-1' },
                      next: 'https://graph.facebook.com/v26.0/me/assigned_instagram_accounts?after=cursor-1&access_token=token',
                    },
                  },
                });
          }
          const profiles: Record<string, unknown> = {
            'https://graph.facebook.com/v26.0/ig-1': {
              name: 'Brand One',
              profile_picture_url: 'https://cdn.example.com/one.jpg',
              username: 'brandone',
            },
            'https://graph.facebook.com/v26.0/ig-2': {
              name: 'Brand Two',
              profile_picture_url: 'https://cdn.example.com/two.jpg',
              username: 'brandtwo',
            },
          };
          return of({ data: profiles[url] });
        },
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
        'https://graph.facebook.com/v26.0/me/assigned_instagram_accounts',
        {
          timeout: 10_000,
          params: { access_token: 'token', fields: 'id,username' },
        },
      );
      // The next page never touches the `paging.next` URL (it embeds
      // access_token in a string that ends up in logs/history) — it reuses
      // the same endpoint with an `after` cursor param instead.
      const secondPageCall = (httpServiceMock.get as Mock).mock.calls.find(
        ([url, config]) =>
          String(url).endsWith('/me/assigned_instagram_accounts') &&
          config.params.after === 'cursor-1',
      );
      expect(secondPageCall?.[1]).toEqual({
        timeout: 10_000,
        params: {
          access_token: 'token',
          after: 'cursor-1',
          fields: 'id,username',
        },
      });
    });

    it('keeps an account whose profile read fails, with the username the list gave', async () => {
      (httpServiceMock.get as Mock).mockImplementation((url: string) =>
        url.endsWith('/me/assigned_instagram_accounts')
          ? of({ data: { data: [{ id: 'ig-1', username: 'brandone' }] } })
          : throwError(() => new Error('profile unavailable')),
      );

      const result = await service.listAuthorizedInstagramAccounts('token');

      expect(result).toEqual([
        { id: 'ig-1', platform: 'instagram', username: 'brandone' },
      ]);
    });

    it('returns an empty list when the token manages no professional account', async () => {
      (httpServiceMock.get as Mock).mockReturnValue(of({ data: { data: [] } }));

      const result = await service.listAuthorizedInstagramAccounts('token');

      expect(result).toEqual([]);
    });

    it('lists the accounts named in the token grant when the assigned-accounts edge is empty', async () => {
      (httpServiceMock.get as Mock).mockImplementation((url: string) => {
        if (url.endsWith('/me/assigned_instagram_accounts')) {
          return of({ data: { data: [] } });
        }
        if (url.endsWith('/debug_token')) {
          return of({
            data: {
              data: {
                granular_scopes: [
                  {
                    scope: 'instagram_basic',
                    target_ids: ['ig-shayla', 'ig-genfeed'],
                  },
                  { scope: 'instagram_content_publish', target_ids: [] },
                ],
                is_valid: true,
              },
            },
          });
        }
        const profiles: Record<string, unknown> = {
          'https://graph.facebook.com/v26.0/ig-genfeed': {
            name: 'Genfeed',
            username: 'genfeedai',
          },
          'https://graph.facebook.com/v26.0/ig-shayla': {
            name: 'Shayla',
            username: 'itsshaylamonroe',
          },
        };
        return of({ data: profiles[url] });
      });

      const result = await service.listAuthorizedInstagramAccounts('token');

      expect(result).toEqual([
        {
          id: 'ig-shayla',
          label: 'Shayla',
          platform: 'instagram',
          username: 'itsshaylamonroe',
        },
        {
          id: 'ig-genfeed',
          label: 'Genfeed',
          platform: 'instagram',
          username: 'genfeedai',
        },
      ]);
    });

    it('describes the grant accounts a caller already read without asking Meta again', async () => {
      (httpServiceMock.get as Mock).mockImplementation((url: string) => {
        if (url.endsWith('/me/assigned_instagram_accounts')) {
          return of({ data: { data: [] } });
        }
        if (url.endsWith('/debug_token')) {
          return throwError(() => new Error('debug_token unavailable'));
        }
        return of({ data: { name: 'Shayla', username: 'itsshaylamonroe' } });
      });

      const result = await service.listAuthorizedInstagramAccounts('token', [
        'ig-shayla',
      ]);

      expect(result).toEqual([
        {
          id: 'ig-shayla',
          label: 'Shayla',
          platform: 'instagram',
          username: 'itsshaylamonroe',
        },
      ]);
    });

    it('returns an empty list when the edge is empty and Meta will not describe the grant', async () => {
      (httpServiceMock.get as Mock).mockImplementation((url: string) =>
        url.endsWith('/debug_token')
          ? throwError(() => new Error('debug_token unavailable'))
          : of({ data: { data: [] } }),
      );

      const result = await service.listAuthorizedInstagramAccounts('token');

      expect(result).toEqual([]);
    });

    it('finds accounts on a business edge when the assigned list and the grant name none', async () => {
      (httpServiceMock.get as Mock).mockImplementation((url: string) => {
        if (url.endsWith('/biz-1/owned_instagram_accounts')) {
          return of({
            data: {
              data: [
                { id: 'ig-shared', username: 'sharedone' },
                { id: 'ig-unshared', username: 'unshared' },
              ],
            },
          });
        }
        if (url.endsWith('/ig-shared')) {
          return of({ data: { name: 'Shared One', username: 'sharedone' } });
        }
        if (url.endsWith('/ig-unshared')) {
          return throwError(() => new Error('(#10) not authorized'));
        }
        if (url.endsWith('/debug_token')) {
          return of({
            data: { data: { granular_scopes: [], is_valid: true } },
          });
        }
        return of({ data: { data: [] } });
      });

      const result = await service.listAuthorizedInstagramAccounts(
        'token',
        undefined,
        'biz-1',
      );

      expect(result).toEqual([
        {
          id: 'ig-shared',
          label: 'Shared One',
          platform: 'instagram',
          username: 'sharedone',
        },
      ]);
    });

    it('finds the Instagram account linked to a Page the token can list', async () => {
      (httpServiceMock.get as Mock).mockImplementation((url: string) => {
        if (url.endsWith('/me/accounts')) {
          return of({
            data: {
              data: [
                {
                  id: 'page-1',
                  instagram_business_account: { id: 'ig-linked' },
                },
                { id: 'page-2' },
              ],
            },
          });
        }
        if (url.endsWith('/ig-linked')) {
          return of({ data: { name: 'Linked', username: 'linkedone' } });
        }
        if (url.endsWith('/debug_token')) {
          return of({ data: { data: { is_valid: true } } });
        }
        return of({ data: { data: [] } });
      });

      const result = await service.listAuthorizedInstagramAccounts(
        'token',
        undefined,
        'biz-1',
      );

      expect(result).toEqual([
        {
          id: 'ig-linked',
          label: 'Linked',
          platform: 'instagram',
          username: 'linkedone',
        },
      ]);
    });

    it('stays empty when every business edge fails or lists nothing', async () => {
      (httpServiceMock.get as Mock).mockImplementation((url: string) => {
        if (url.endsWith('/debug_token')) {
          return of({ data: { data: { is_valid: true } } });
        }
        return url.includes('/biz-1/')
          ? throwError(() => new Error('(#100) nonexisting field'))
          : of({ data: { data: [] } });
      });

      const result = await service.listAuthorizedInstagramAccounts(
        'token',
        undefined,
        'biz-1',
      );

      expect(result).toEqual([]);
    });

    it('stops following pagination at the page cap instead of looping forever', async () => {
      (httpServiceMock.get as Mock).mockImplementation(() =>
        of({
          data: {
            data: [],
            paging: {
              cursors: { after: 'always-more' },
              next: 'https://graph.facebook.com/v26.0/me/assigned_instagram_accounts?after=always-more',
            },
          },
        }),
      );

      await service.listAuthorizedInstagramAccounts('token');

      // 25 is the documented cap (INSTAGRAM_ACCOUNT_LIST_MAX_PAGES).
      const edgeCalls = (httpServiceMock.get as Mock).mock.calls.filter(
        ([url]) => String(url).endsWith('/me/assigned_instagram_accounts'),
      );
      expect(edgeCalls).toHaveLength(25);
    });

    it('sanitizes a timed out account request', async () => {
      (httpServiceMock.get as Mock).mockReturnValue(
        throwError(() => ({
          code: 'ECONNABORTED',
          message:
            'timeout https://graph.facebook.com?access_token=secret-timeout-token',
          config: { params: { access_token: 'secret-timeout-token' } },
        })),
      );
      await expect(
        service.listAuthorizedInstagramAccounts('secret-timeout-token'),
      ).rejects.toBeTruthy();
      expect(httpServiceMock.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 10_000 }),
      );
      expect(JSON.stringify(loggerMock.error.mock.calls)).not.toContain(
        'secret-timeout-token',
      );
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
