/**
 * @fileoverview Tests for PublisherFactoryService
 * @description Tests covering getPublisher(), isSupported(), getSupportedPlatforms()
 */

import { BeehiivPublisherService } from '@api/services/integrations/publishers/beehiiv-publisher.service';
import { FacebookPublisherService } from '@api/services/integrations/publishers/facebook-publisher.service';
import { FanvuePublisherService } from '@api/services/integrations/publishers/fanvue-publisher.service';
import { GhostPublisherService } from '@api/services/integrations/publishers/ghost-publisher.service';
import { InstagramPublisherService } from '@api/services/integrations/publishers/instagram-publisher.service';
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
import { CredentialPlatform } from '@genfeedai/enums';
import { Test, type TestingModule } from '@nestjs/testing';

// ─── Mock factory ─────────────────────────────────────────────────────────────

function mockPublisher(platform: CredentialPlatform) {
  return {
    buildPostUrl: vi.fn().mockReturnValue('https://example.com/post/123'),
    platform,
    publish: vi.fn().mockResolvedValue({ success: true }),
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublisherFactoryService,
        {
          provide: TwitterPublisherService,
          useValue: mockPublisher(CredentialPlatform.TWITTER),
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

    service = module.get<PublisherFactoryService>(PublisherFactoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── getPublisher() ─────────────────────────────────────────────────────────

  describe('getPublisher()', () => {
    it('should return the twitter publisher for TWITTER platform', () => {
      const publisher = service.getPublisher(CredentialPlatform.TWITTER);
      expect(publisher).toBeDefined();
      expect(publisher?.platform).toBe(CredentialPlatform.TWITTER);
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

    it.each(
      SUPPORTED,
    )('should return true for supported platform: %s', (platform) => {
      expect(service.isSupported(platform)).toBe(true);
    });

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
