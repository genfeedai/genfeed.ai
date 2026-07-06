import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { BeehiivModule } from '@api/services/integrations/beehiiv/beehiiv.module';
import { FacebookModule } from '@api/services/integrations/facebook/facebook.module';
import { FanvueModule } from '@api/services/integrations/fanvue/fanvue.module';
import { GhostModule } from '@api/services/integrations/ghost/ghost.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { LinkedInModule } from '@api/services/integrations/linkedin/linkedin.module';
import { MastodonModule } from '@api/services/integrations/mastodon/mastodon.module';
import { PinterestModule } from '@api/services/integrations/pinterest/pinterest.module';
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
import { RedditModule } from '@api/services/integrations/reddit/reddit.module';
import { ShopifyModule } from '@api/services/integrations/shopify/shopify.module';
import { SnapchatModule } from '@api/services/integrations/snapchat/snapchat.module';
import { ThreadsModule } from '@api/services/integrations/threads/threads.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { WhatsappModule } from '@api/services/integrations/whatsapp/whatsapp.module';
import { WordpressModule } from '@api/services/integrations/wordpress/wordpress.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [
    BeehiivPublisherService,
    FacebookPublisherService,
    FanvuePublisherService,
    GhostPublisherService,
    InstagramPublisherService,
    LinkedInPublisherService,
    MastodonPublisherService,
    PinterestPublisherService,
    // Export factory for use in cron service
    PublisherFactoryService,
    RedditPublisherService,
    ShopifyPublisherService,
    SnapchatPublisherService,
    ThreadsPublisherService,
    TikTokPublisherService,
    // Export individual publishers if needed directly
    TwitterPublisherService,
    WhatsappPublisherService,
    WordpressPublisherService,
    YouTubePublisherService,
  ],
  imports: [
    forwardRef(() => ConfigModule),
    forwardRef(() => HttpModule),
    forwardRef(() => LoggerModule),

    // Platform integration modules
    forwardRef(() => BeehiivModule),
    forwardRef(() => FacebookModule),
    forwardRef(() => FanvueModule),
    forwardRef(() => GhostModule),
    forwardRef(() => InstagramModule),
    forwardRef(() => LinkedInModule),
    forwardRef(() => MastodonModule),
    forwardRef(() => PinterestModule),
    forwardRef(() => RedditModule),
    forwardRef(() => ShopifyModule),
    forwardRef(() => SnapchatModule),
    forwardRef(() => ThreadsModule),
    forwardRef(() => TiktokModule),
    forwardRef(() => TwitterModule),
    forwardRef(() => WhatsappModule),
    forwardRef(() => WordpressModule),
    forwardRef(() => YoutubeModule),

    // Data modules
    forwardRef(() => CredentialsCoreModule),
    forwardRef(() => PostsModule),
  ],
  providers: [
    BeehiivPublisherService,
    FacebookPublisherService,
    FanvuePublisherService,
    GhostPublisherService,
    InstagramPublisherService,
    LinkedInPublisherService,
    MastodonPublisherService,
    PinterestPublisherService,
    // Factory
    PublisherFactoryService,
    RedditPublisherService,
    ShopifyPublisherService,
    SnapchatPublisherService,
    ThreadsPublisherService,
    TikTokPublisherService,
    // Publisher services
    TwitterPublisherService,
    WhatsappPublisherService,
    WordpressPublisherService,
    YouTubePublisherService,
  ],
})
export class PublishersModule {}
