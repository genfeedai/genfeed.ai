/**
 * @fileoverview Tests for PublisherFactoryService
 * @description Tests covering getPublisher(), isSupported(), getSupportedPlatforms()
 */

import { BeehiivPublisherService } from '@api/services/integrations/publishers/beehiiv-publisher.service';
import { FacebookPublisherService } from '@api/services/integrations/publishers/facebook-publisher.service';
import { FanvuePublisherService } from '@api/services/integrations/publishers/fanvue-publisher.service';
import { GhostPublisherService } from '@api/services/integrations/publishers/ghost-publisher.service';
import { InstagramPublisherService } from '@api/services/integrations/publishers/instagram-publisher.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { LinkedInPublisherService } from '@api/services/integrations/publishers/linkedin-publisher.service';
import { MastodonPublisherService } from '@api/services/integrations/publishers/mastodon-publisher.service';
import { PinterestPublisherService } from '@api/services/integrations/publishers/pinterest-publisher.service';
import { PublisherFactoryService } from '@api/services/integrations/publishers/publisher-factory.service';
import { RedditPublisherService } from '@api/services/integrations/publishers/reddit-publisher.service';
import { ShopifyPublisherService } from '@api/services/integrations/publishers/shopify-publisher.service';
import { SnapchatPublisherService } from '@api/services/integrations/publishers/snapchat-publisher.service';
import { ThreadsPublisherService } from '@api/services/integrations/publishers/threads-publisher.service';
import { TikTokPublisherService } from '@api/services/integrations/publishers/tiktok-publisher.service';
import { TwitterPublisherService } from '@api/services/integrations/publishers/twitter-publisher.service';
import { WhatsappPublisherService } from '@api/services/integrations/publishers/whatsapp-publisher.service';
import { WordpressPublisherService } from '@api/services/integrations/publishers/wordpress-publisher.service';
import { YouTubePublisherService } from '@api/services/integrations/publishers/youtube-publisher.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { Test, type TestingModule } from '@nestjs/testing';

// ─── Mock factory ─────────────────────────────────────────────────────────────

function mockPublisher(platform: CredentialPlatform) {
  return {
    buildPostUrl: vi.fn().mockReturnValue('https://example.com/post/123'),
    platform,
    publish: vi.fn().mockResolvedValue({ success: true }),
    publishThreadChildren: vi.fn().mockResolvedValue(undefined),
    supportsCarousel: false,
    supportsImages: true,
    supportsTextOnly: true,
    supportsThreads: false,
    supportsVideos: false,
    validatePost: vi.fn().mockReturnValue({ valid: true }),
  };
}

describe('PublisherFactoryService', () => {
  let service: PublisherFactoryService;
  let twitter: ReturnType<typeof mockPublisher>;
  const issueServerPublish = vi.fn();
  const config = { isAuthorizedMediaDeliveryEnabled: true };

  beforeEach(async () => {
    issueServerPublish.mockReset();
    config.isAuthorizedMediaDeliveryEnabled = true;
    twitter = mockPublisher(CredentialPlatform.TWITTER);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublisherFactoryService,
        { provide: ConfigService, useValue: config },
        {
          provide: AuthorizedMediaUrlService,
          useValue: { issueServerPublish },
        },
        {
          provide: TwitterPublisherService,
          useValue: twitter,
        },
        {
          provide: InstagramPublisherService,
          useValue: mockPublisher(CredentialPlatform.INSTAGRAM),
        },
        {
          provide: TikTokPublisherService,
          useValue: mockPublisher(CredentialPlatform.TIKTOK),
        },
        {
          provide: YouTubePublisherService,
          useValue: mockPublisher(CredentialPlatform.YOUTUBE),
        },
        {
          provide: FacebookPublisherService,
          useValue: mockPublisher(CredentialPlatform.FACEBOOK),
        },
        {
          provide: LinkedInPublisherService,
          useValue: mockPublisher(CredentialPlatform.LINKEDIN),
        },
        {
          provide: PinterestPublisherService,
          useValue: mockPublisher(CredentialPlatform.PINTEREST),
        },
        {
          provide: RedditPublisherService,
          useValue: mockPublisher(CredentialPlatform.REDDIT),
        },
        {
          provide: ThreadsPublisherService,
          useValue: mockPublisher(CredentialPlatform.THREADS),
        },
        {
          provide: FanvuePublisherService,
          useValue: mockPublisher(CredentialPlatform.FANVUE),
        },
        {
          provide: WordpressPublisherService,
          useValue: mockPublisher(CredentialPlatform.WORDPRESS),
        },
        {
          provide: SnapchatPublisherService,
          useValue: mockPublisher(CredentialPlatform.SNAPCHAT),
        },
        {
          provide: WhatsappPublisherService,
          useValue: mockPublisher(CredentialPlatform.WHATSAPP),
        },
        {
          provide: MastodonPublisherService,
          useValue: mockPublisher(CredentialPlatform.MASTODON),
        },
        {
          provide: GhostPublisherService,
          useValue: mockPublisher(CredentialPlatform.GHOST),
        },
        {
          provide: ShopifyPublisherService,
          useValue: mockPublisher(CredentialPlatform.SHOPIFY),
        },
        {
          provide: BeehiivPublisherService,
          useValue: mockPublisher(CredentialPlatform.BEEHIIV),
        },
      ],
    }).compile();

    await module.init();
    service = module.get<PublisherFactoryService>(PublisherFactoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('fails application initialization when a required publisher is unregistered', async () => {
    const module = await Test.createTestingModule({
      providers: [
        PublisherFactoryService,
        { provide: ConfigService, useValue: config },
        {
          provide: AuthorizedMediaUrlService,
          useValue: { issueServerPublish },
        },
      ],
    }).compile();

    await expect(module.init()).rejects.toThrow(/TwitterPublisherService/);
  });

  // ─── getPublisher() ─────────────────────────────────────────────────────────

  describe('getPublisher()', () => {
    it('should return the twitter publisher for TWITTER platform', () => {
      const publisher = service.getPublisher(CredentialPlatform.TWITTER);
      expect(publisher).toBeDefined();
      expect(publisher?.platform).toBe(CredentialPlatform.TWITTER);
    });

    it('resolves a Prisma SCREAMING platform onto the domain publisher', () => {
      const publisher = service.getPublisher('TWITTER');
      expect(publisher).toBeDefined();
      expect(publisher?.platform).toBe(CredentialPlatform.TWITTER);
      expect(service.getPublisher('INSTAGRAM')?.platform).toBe(
        CredentialPlatform.INSTAGRAM,
      );
    });

    it('should return the instagram publisher for INSTAGRAM platform', () => {
      const publisher = service.getPublisher(CredentialPlatform.INSTAGRAM);
      expect(publisher).toBeDefined();
      expect(publisher?.platform).toBe(CredentialPlatform.INSTAGRAM);
    });

    it('should return the threads publisher for THREADS platform', () => {
      const publisher = service.getPublisher(CredentialPlatform.THREADS);
      expect(publisher).toBeDefined();
      expect(publisher?.platform).toBe(CredentialPlatform.THREADS);
    });

    it('should return the mastodon publisher for MASTODON platform', () => {
      const publisher = service.getPublisher(CredentialPlatform.MASTODON);
      expect(publisher?.platform).toBe(CredentialPlatform.MASTODON);
    });

    it('should return the beehiiv publisher for BEEHIIV platform', () => {
      const publisher = service.getPublisher(CredentialPlatform.BEEHIIV);
      expect(publisher?.platform).toBe(CredentialPlatform.BEEHIIV);
    });

    it('should return null for an unsupported platform', () => {
      const publisher = service.getPublisher(
        'UNSUPPORTED_PLATFORM' as CredentialPlatform,
      );
      expect(publisher).toBeNull();
    });

    it('should return distinct publisher instances for different platforms', () => {
      const twitter = service.getPublisher(CredentialPlatform.TWITTER);
      const instagram = service.getPublisher(CredentialPlatform.INSTAGRAM);
      expect(twitter).not.toBe(instagram);
    });
  });

  describe('authorized execution media', () => {
    function context(
      ingredients: PublishContext['post']['ingredients'],
    ): PublishContext {
      return {
        organization: { id: 'org-1' },
        organizationId: 'org-1',
        brandId: 'brand-1',
        credential: {},
        postId: 'post-1',
        settings: {},
        post: {
          id: 'post-1',
          ingredients,
          category: 'image',
          description: 'caption',
        },
      } as unknown as PublishContext;
    }

    it('reissues provider URLs from canonical IDs instead of accepting caller URLs', async () => {
      issueServerPublish.mockResolvedValue(
        new Map([
          ['ingredient-1', 'https://signed.test/random-object?grant=1'],
        ]),
      );
      const original = context([
        { id: 'ingredient-1', mediaUrl: 'http://169.254.169.254/metadata' },
      ]);
      await service.getPublisher('TWITTER')?.publish(original);
      expect(issueServerPublish).toHaveBeenCalledWith('org-1', [
        'ingredient-1',
      ]);
      expect(twitter.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          post: expect.objectContaining({
            ingredients: [
              {
                id: 'ingredient-1',
                mediaUrl: 'https://signed.test/random-object?grant=1',
              },
            ],
          }),
        }),
      );
      expect(original.post.ingredients).toEqual([
        { id: 'ingredient-1', mediaUrl: 'http://169.254.169.254/metadata' },
      ]);
    });

    it('rejects cross-organization ingredient resolution before any provider execution', async () => {
      issueServerPublish.mockRejectedValue(new Error('Media not found'));
      await expect(
        service
          .getPublisher('TWITTER')
          ?.publish(context(['foreign-ingredient'])),
      ).rejects.toThrow('Media not found');
      expect(twitter.publish).not.toHaveBeenCalled();
    });

    it('rejects a mismatched execution organization before issuing a grant', async () => {
      const mismatched = {
        ...context(['ingredient-1']),
        organizationId: 'other-org',
      };
      await expect(
        service.getPublisher('TWITTER')?.publish(mismatched),
      ).rejects.toThrow('organization does not match');
      expect(issueServerPublish).not.toHaveBeenCalled();
      expect(twitter.publish).not.toHaveBeenCalled();
    });

    it('hydrates parent and child media together without persisting signed URLs', async () => {
      issueServerPublish.mockResolvedValue(
        new Map([
          ['ingredient-1', 'https://signed.test/one?grant=1'],
          ['ingredient-2', 'https://signed.test/two?grant=1'],
        ]),
      );
      const children = [
        { id: 'child-1', ingredients: ['ingredient-1', 'ingredient-2'] },
      ];
      await service
        .getPublisher('TWITTER')
        ?.publishThreadChildren?.(
          context(['ingredient-1']),
          children,
          'parent-external',
        );
      expect(issueServerPublish).toHaveBeenCalledWith('org-1', [
        'ingredient-1',
        'ingredient-2',
      ]);
      expect(twitter.publishThreadChildren).toHaveBeenCalledWith(
        expect.any(Object),
        [
          expect.objectContaining({
            ingredients: [
              {
                id: 'ingredient-1',
                mediaUrl: 'https://signed.test/one?grant=1',
              },
              {
                id: 'ingredient-2',
                mediaUrl: 'https://signed.test/two?grant=1',
              },
            ],
          }),
        ],
        'parent-external',
      );
      expect(children[0].ingredients).toEqual(['ingredient-1', 'ingredient-2']);
    });

    it('reissues grants on a retry and refuses a missing resolver result', async () => {
      issueServerPublish
        .mockResolvedValueOnce(
          new Map([['ingredient-1', 'https://signed.test/one?grant=1']]),
        )
        .mockResolvedValueOnce(new Map());
      const publisher = service.getPublisher('TWITTER');
      await publisher?.publish(context(['ingredient-1']));
      await expect(
        publisher?.publish(context(['ingredient-1'])),
      ).rejects.toThrow('no authorized execution URL');
      expect(issueServerPublish).toHaveBeenCalledTimes(2);
      expect(twitter.publish).toHaveBeenCalledTimes(1);
    });

    it('publishes text-only content without requesting media grants', async () => {
      await service.getPublisher('TWITTER')?.publish(context([]));
      expect(issueServerPublish).not.toHaveBeenCalled();
      expect(twitter.publish).toHaveBeenCalledTimes(1);
    });

    it('preserves bound provider verification without issuing media or publishing', async () => {
      const confirmed = { success: true, externalId: 'confirmed-post' };
      const verifyPublished = vi.fn().mockResolvedValue(confirmed);
      const publisher = { ...twitter, verifyPublished };
      const wrapped = service['authorizePublisher'](publisher);
      const original = context(['ingredient-1']);
      const attemptStartedAt = new Date('2026-10-03T12:00:00Z');

      await expect(
        wrapped.verifyPublished?.(original, attemptStartedAt),
      ).resolves.toBe(confirmed);
      expect(verifyPublished).toHaveBeenCalledWith(original, attemptStartedAt);
      expect(verifyPublished.mock.contexts[0]).toBe(publisher);
      expect(issueServerPublish).not.toHaveBeenCalled();
      expect(twitter.publish).not.toHaveBeenCalled();

      verifyPublished.mockResolvedValueOnce(null);
      await expect(
        wrapped.verifyPublished?.(original, attemptStartedAt),
      ).resolves.toBeNull();
      verifyPublished.mockRejectedValueOnce(new Error('Provider unavailable'));
      await expect(
        wrapped.verifyPublished?.(original, attemptStartedAt),
      ).rejects.toThrow('Provider unavailable');
    });

    it('keeps provider verification absent when the provider has no hook', () => {
      expect(service.getPublisher('TWITTER')?.verifyPublished).toBeUndefined();
    });
  });

  // ─── isSupported() ──────────────────────────────────────────────────────────

  describe('isSupported()', () => {
    const SUPPORTED = [
      CredentialPlatform.TWITTER,
      CredentialPlatform.INSTAGRAM,
      CredentialPlatform.TIKTOK,
      CredentialPlatform.YOUTUBE,
      CredentialPlatform.FACEBOOK,
      CredentialPlatform.LINKEDIN,
      CredentialPlatform.PINTEREST,
      CredentialPlatform.REDDIT,
      CredentialPlatform.THREADS,
      CredentialPlatform.FANVUE,
      CredentialPlatform.WORDPRESS,
      CredentialPlatform.SNAPCHAT,
      CredentialPlatform.WHATSAPP,
      CredentialPlatform.MASTODON,
      CredentialPlatform.GHOST,
      CredentialPlatform.SHOPIFY,
      CredentialPlatform.BEEHIIV,
    ] as const;

    it.each(SUPPORTED)(
      'should return true for supported platform: %s',
      (platform) => {
        expect(service.isSupported(platform)).toBe(true);
      },
    );

    it('should return false for an unsupported platform', () => {
      expect(service.isSupported('NOT_A_PLATFORM' as CredentialPlatform)).toBe(
        false,
      );
    });
  });

  // ─── getSupportedPlatforms() ────────────────────────────────────────────────

  describe('getSupportedPlatforms()', () => {
    it('should return an array', () => {
      expect(Array.isArray(service.getSupportedPlatforms())).toBe(true);
    });

    it('should include all 17 registered platforms', () => {
      expect(service.getSupportedPlatforms()).toHaveLength(17);
    });

    it('should include TWITTER', () => {
      expect(service.getSupportedPlatforms()).toContain(
        CredentialPlatform.TWITTER,
      );
    });

    it('should include MASTODON', () => {
      expect(service.getSupportedPlatforms()).toContain(
        CredentialPlatform.MASTODON,
      );
    });

    it('should include BEEHIIV', () => {
      expect(service.getSupportedPlatforms()).toContain(
        CredentialPlatform.BEEHIIV,
      );
    });

    it('should not contain unsupported platforms', () => {
      expect(service.getSupportedPlatforms()).not.toContain(
        'UNSUPPORTED_PLATFORM',
      );
    });
  });
});
