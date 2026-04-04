import { BeehiivPublisherService } from '@api/services/integrations/publishers/beehiiv-publisher.service';
import { FacebookPublisherService } from '@api/services/integrations/publishers/facebook-publisher.service';
import { FanvuePublisherService } from '@api/services/integrations/publishers/fanvue-publisher.service';
import { GhostPublisherService } from '@api/services/integrations/publishers/ghost-publisher.service';
import { InstagramPublisherService } from '@api/services/integrations/publishers/instagram-publisher.service';
import type { IPublisher } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { LinkedInPublisherService } from '@api/services/integrations/publishers/linkedin-publisher.service';
import { MastodonPublisherService } from '@api/services/integrations/publishers/mastodon-publisher.service';
import { PinterestPublisherService } from '@api/services/integrations/publishers/pinterest-publisher.service';
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
import { Injectable } from '@nestjs/common';

/**
 * Factory service to get the appropriate publisher for a platform
 */
@Injectable()
export class PublisherFactoryService {
  private readonly publishers: Map<CredentialPlatform, IPublisher>;

  constructor(
    private readonly twitterPublisher: TwitterPublisherService,
    private readonly instagramPublisher: InstagramPublisherService,
    private readonly tiktokPublisher: TikTokPublisherService,
    private readonly youtubePublisher: YouTubePublisherService,
    private readonly facebookPublisher: FacebookPublisherService,
    private readonly linkedinPublisher: LinkedInPublisherService,
    private readonly pinterestPublisher: PinterestPublisherService,
    private readonly redditPublisher: RedditPublisherService,
    private readonly threadsPublisher: ThreadsPublisherService,
    private readonly fanvuePublisher: FanvuePublisherService,
    private readonly wordpressPublisher: WordpressPublisherService,
    private readonly snapchatPublisher: SnapchatPublisherService,
    private readonly whatsappPublisher: WhatsappPublisherService,
    private readonly mastodonPublisher: MastodonPublisherService,
    private readonly ghostPublisher: GhostPublisherService,
    private readonly shopifyPublisher: ShopifyPublisherService,
    private readonly beehiivPublisher: BeehiivPublisherService,
  ) {
    this.publishers = new Map<CredentialPlatform, IPublisher>([
      [CredentialPlatform.TWITTER, this.twitterPublisher],
      [CredentialPlatform.INSTAGRAM, this.instagramPublisher],
      [CredentialPlatform.TIKTOK, this.tiktokPublisher],
      [CredentialPlatform.YOUTUBE, this.youtubePublisher],
      [CredentialPlatform.FACEBOOK, this.facebookPublisher],
      [CredentialPlatform.LINKEDIN, this.linkedinPublisher],
      [CredentialPlatform.PINTEREST, this.pinterestPublisher],
      [CredentialPlatform.REDDIT, this.redditPublisher],
      [CredentialPlatform.THREADS, this.threadsPublisher],
      [CredentialPlatform.FANVUE, this.fanvuePublisher],
      [CredentialPlatform.WORDPRESS, this.wordpressPublisher],
      [CredentialPlatform.SNAPCHAT, this.snapchatPublisher],
      [CredentialPlatform.WHATSAPP, this.whatsappPublisher],
      [CredentialPlatform.MASTODON, this.mastodonPublisher],
      [CredentialPlatform.GHOST, this.ghostPublisher],
      [CredentialPlatform.SHOPIFY, this.shopifyPublisher],
      [CredentialPlatform.BEEHIIV, this.beehiivPublisher],
    ]);
  }

  /**
   * Get the publisher for a specific platform
   * @param platform The platform to get the publisher for
   * @returns The publisher for the platform, or null if not supported
   */
  getPublisher(platform: CredentialPlatform): IPublisher | null {
    return this.publishers.get(platform) || null;
  }

  /**
   * Check if a platform is supported
   * @param platform The platform to check
   * @returns True if the platform is supported
   */
  isSupported(platform: CredentialPlatform): boolean {
    return this.publishers.has(platform);
  }

  /**
   * Get all supported platforms
   * @returns Array of supported platforms
   */
  getSupportedPlatforms(): CredentialPlatform[] {
    return Array.from(this.publishers.keys());
  }
}
