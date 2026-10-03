import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { BeehiivService } from '@api/services/integrations/beehiiv/services/beehiiv.service';
import { GhostService } from '@api/services/integrations/ghost/services/ghost.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { BeehiivPublisherService } from '@api/services/integrations/publishers/beehiiv-publisher.service';
import { GhostPublisherService } from '@api/services/integrations/publishers/ghost-publisher.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { LinkedInPublisherService } from '@api/services/integrations/publishers/linkedin-publisher.service';
import { MastodonPublisherService } from '@api/services/integrations/publishers/mastodon-publisher.service';
import { ShopifyPublisherService } from '@api/services/integrations/publishers/shopify-publisher.service';
import { ThreadsPublisherService } from '@api/services/integrations/publishers/threads-publisher.service';
import { TwitterPublisherService } from '@api/services/integrations/publishers/twitter-publisher.service';
import { WordpressPublisherService } from '@api/services/integrations/publishers/wordpress-publisher.service';
import { ShopifyService } from '@api/services/integrations/shopify/services/shopify.service';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { WordpressService } from '@api/services/integrations/wordpress/services/wordpress.service';
import {
  CredentialPlatform,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const startedAt = new Date('2026-10-03T10:00:00Z');
const context = {
  brandId: testId('brand'),
  credential: {
    accessToken: 'encrypted-fixture',
    externalId: 'account',
    externalHandle: 'account',
    id: testId('credential'),
    isDeleted: false,
    organizationId: testId('org'),
  },
  hasThreadChildren: false,
  organizationId: testId('org'),
  post: {
    category: PostCategory.TEXT,
    description: '<p>Exact caption</p>',
    id: testId('post'),
    ingredients: [],
    label: 'caption',
  },
  postId: testId('post'),
  settings: {},
} as unknown as PublishContext;

vi.mock('@api/shared/utils/webhook-validator/webhook-validator.util', () => ({
  createSafeWebhookHttpsAgent: vi.fn().mockResolvedValue({ destroy: vi.fn() }),
}));

const cases = [
  {
    platform: CredentialPlatform.TWITTER,
    provider: TwitterPublisherService,
    found: {
      data: [
        {
          id: 'landed',
          author_id: 'account',
          created_at: '2026-10-03T10:00:01Z',
          text: 'Exact caption',
        },
      ],
      meta: { result_count: 1 },
    },
    absent: { meta: { result_count: 0 } },
  },
  {
    platform: CredentialPlatform.LINKEDIN,
    provider: LinkedInPublisherService,
    found: {
      elements: [
        {
          id: 'landed',
          author: 'urn:li:person:account',
          created: { time: new Date('2026-10-03T10:00:01Z').getTime() },
          lifecycleState: 'PUBLISHED',
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: 'Exact caption' },
              shareMediaCategory: 'NONE',
            },
          },
        },
      ],
      paging: { start: 0, count: 100, total: 1 },
    },
    absent: { elements: [], paging: { start: 0, count: 100, total: 0 } },
  },
  {
    platform: CredentialPlatform.THREADS,
    provider: ThreadsPublisherService,
    found: {
      data: [
        {
          id: 'landed',
          timestamp: '2026-10-03T10:00:01Z',
          text: 'Exact caption',
          media_type: 'TEXT_POST',
          is_reply: false,
          is_quote_post: false,
        },
      ],
    },
    absent: { data: [] },
  },
  {
    platform: CredentialPlatform.WORDPRESS,
    provider: WordpressPublisherService,
    found: {
      found: 1,
      posts: [
        {
          ID: 42,
          date: '2026-10-03T10:00:01Z',
          title: 'caption',
          content: '<p>Exact caption</p>',
          status: 'publish',
          featured_image: '',
        },
      ],
    },
    absent: { found: 0, posts: [] },
  },
  {
    platform: CredentialPlatform.GHOST,
    provider: GhostPublisherService,
    found: {
      posts: [
        {
          id: 'landed',
          created_at: '2026-10-03T10:00:01Z',
          title: 'caption',
          html: '<p>Exact caption</p>',
          status: 'published',
          feature_image: null,
          url: 'https://ghost.example/p/landed',
        },
      ],
      meta: { pagination: { page: 1, total: 1, limit: 100 } },
    },
    absent: {
      posts: [],
      meta: { pagination: { page: 1, total: 0, limit: 100 } },
    },
  },
  {
    platform: CredentialPlatform.SHOPIFY,
    provider: ShopifyPublisherService,
    found: {
      data: {
        products: {
          edges: [
            {
              node: {
                id: 'landed',
                createdAt: '2026-10-03T10:00:01Z',
                title: 'caption',
                descriptionHtml: '<p>Exact caption</p>',
                status: 'ACTIVE',
                images: { nodes: [] },
                handle: 'landed',
                onlineStoreUrl: null,
              },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
    absent: {
      data: {
        products: {
          edges: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
  },
  {
    platform: CredentialPlatform.BEEHIIV,
    provider: BeehiivPublisherService,
    found: {
      data: [
        {
          id: 'landed',
          created: 1791021601,
          title: 'caption',
          content: { free: { web: '<p>Exact caption</p>' } },
          status: 'confirmed',
          web_url: 'https://newsletter.example/landed',
        },
      ],
      page: 1,
      total_results: 1,
      total_pages: 1,
    },
    absent: { data: [], page: 1, total_results: 0, total_pages: 0 },
  },
  {
    platform: CredentialPlatform.MASTODON,
    provider: MastodonPublisherService,
    found: [
      {
        id: 'landed',
        created_at: '2026-10-03T10:00:01Z',
        content: '<p>Exact caption</p>',
        account: { id: 'account' },
        media_attachments: [],
        in_reply_to_id: null,
        reblog: null,
        spoiler_text: '',
        visibility: 'public',
        url: 'https://mastodon.example/@account/landed',
      },
    ],
    absent: [],
  },
];

describe.each(cases)(
  '$platform publisher verification',
  ({ platform, provider, found, absent }) => {
    const input = {
      ...context,
      credential: {
        ...context.credential,
        externalId:
          platform === CredentialPlatform.GHOST
            ? 'https://ghost.example'
            : 'account',
        externalHandle:
          platform === CredentialPlatform.SHOPIFY
            ? 'fixture.myshopify.com'
            : 'account',
        description: 'https://mastodon.example',
      },
    };
    const credentials = { findOne: vi.fn(), resolveBrandAccount: vi.fn() };
    const http = { get: vi.fn(), post: vi.fn() };

    async function createPublisher() {
      const module = await Test.createTestingModule({
        providers: [
          provider,
          LinkedInService,
          ThreadsService,
          WordpressService,
          GhostService,
          ShopifyService,
          BeehiivService,
          MastodonService,
          { provide: CredentialsService, useValue: credentials },
          { provide: SERVER_TOKENS.credentials, useValue: credentials },
          { provide: SERVER_TOKENS.linkedInTrends, useValue: {} },
          { provide: PostsService, useValue: {} },
          {
            provide: TwitterService,
            useValue: {
              buildTweetUrl: (id: string) =>
                `https://x.com/account/status/${id}`,
            },
          },
          { provide: HttpService, useValue: http },
          {
            provide: ConfigService,
            useValue: {
              get: vi
                .fn()
                .mockImplementation((key: string) =>
                  key === 'BEEHIIV_API_URL' ? undefined : '',
                ),
            },
          },
          {
            provide: LoggerService,
            useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
          },
        ],
      }).compile();
      return module.get(provider);
    }

    beforeEach(() => {
      vi.restoreAllMocks();
      vi.clearAllMocks();
      vi.spyOn(EncryptionUtil, 'decrypt').mockReturnValue('fixture-access');
      vi.spyOn(GhostService.prototype, 'generateToken').mockReturnValue(
        'fixture-jwt',
      );
      credentials.findOne.mockResolvedValue(input.credential);
      credentials.resolveBrandAccount.mockResolvedValue(input.credential);
    });

    it('finds accepted content through the real account-scoped API reader', async () => {
      http.get.mockImplementation((url: string) =>
        of({
          data: url.endsWith('/verify_credentials') ? { id: 'account' } : found,
        }),
      );
      http.post.mockReturnValue(of({ data: found }));
      const publisher = await createPublisher();
      expect(await publisher.verifyPublished(input, startedAt)).toMatchObject({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: platform === CredentialPlatform.WORDPRESS ? '42' : 'landed',
        platform,
        success: true,
      });
      const call = (
        platform === CredentialPlatform.SHOPIFY ? http.post : http.get
      ).mock.calls.find(
        (args) => !String(args[0]).endsWith('/verify_credentials'),
      );
      expect(call).toBeDefined();
      const config = call?.[platform === CredentialPlatform.SHOPIFY ? 2 : 1];
      expect(config).toMatchObject({ timeout: 10000 });
      expect(config.headers).toEqual(
        expect.objectContaining(
          platform === CredentialPlatform.GHOST
            ? { Authorization: 'Ghost fixture-jwt' }
            : platform === CredentialPlatform.SHOPIFY
              ? { 'X-Shopify-Access-Token': 'fixture-access' }
              : { Authorization: 'Bearer fixture-access' },
        ),
      );
      if (platform === CredentialPlatform.TWITTER) {
        expect(credentials.findOne).toHaveBeenCalledWith({
          id: context.credential.id,
          isDeleted: false,
          organizationId: context.organizationId,
        });
      } else {
        expect(credentials.resolveBrandAccount).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId: context.organizationId,
            brandId: context.brandId,
            credentialId: context.credential.id,
            platform,
          }),
        );
      }
    });

    it('returns null for a complete old-enough absent listing', async () => {
      http.get.mockImplementation((url: string) =>
        of({
          data: url.endsWith('/verify_credentials')
            ? { id: 'account' }
            : absent,
        }),
      );
      http.post.mockReturnValue(of({ data: absent }));
      expect(
        await (await createPublisher()).verifyPublished(input, startedAt),
      ).toBeNull();
    });

    it('throws on unavailable API or unconfirmed media/thread identity', async () => {
      http.get.mockReturnValue(throwError(() => new Error('provider 503')));
      http.post.mockReturnValue(throwError(() => new Error('provider 503')));
      const publisher = await createPublisher();
      await expect(publisher.verifyPublished(input, startedAt)).rejects.toThrow(
        'provider 503',
      );
      http.get.mockClear();
      http.post.mockClear();
      await expect(
        publisher.verifyPublished(
          { ...input, hasThreadChildren: true },
          startedAt,
        ),
      ).rejects.toThrow('proof');
      await expect(
        publisher.verifyPublished(
          {
            ...input,
            post: { ...context.post, ingredients: [testId('ingredient')] },
          },
          startedAt,
        ),
      ).rejects.toThrow('proof');
      expect(http.get).not.toHaveBeenCalled();
      expect(http.post).not.toHaveBeenCalled();
    });

    it('never searches a changed or disconnected sibling account', async () => {
      credentials.findOne.mockResolvedValue({
        ...input.credential,
        externalId: 'sibling',
        externalHandle: 'sibling.myshopify.com',
      });
      credentials.resolveBrandAccount.mockResolvedValue({
        ...input.credential,
        externalId: 'sibling',
        externalHandle: 'sibling.myshopify.com',
      });
      await expect(
        (await createPublisher()).verifyPublished(input, startedAt),
      ).rejects.toThrow('account');
      expect(http.get).not.toHaveBeenCalled();
      expect(http.post).not.toHaveBeenCalled();
    });
  },
);
