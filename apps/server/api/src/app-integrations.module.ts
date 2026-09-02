/** Platform integrations, notifications, and onboarding HTTP modules. */

import { IntegrationsModule } from '@api/endpoints/integrations/integrations.module';
import { OnboardingModule } from '@api/endpoints/onboarding/onboarding.module';
import { PublicModule } from '@api/endpoints/public/public.module';
import { ManagedInferenceModule } from '@api/endpoints/v1/managed-inference/managed-inference.module';
import { WebhooksModule } from '@api/endpoints/webhooks/webhooks.module';
import { ArgilModule } from '@api/services/integrations/argil/argil.module';
import { BeehiivModule } from '@api/services/integrations/beehiiv/beehiiv.module';
import { DevtoModule } from '@api/services/integrations/devto/devto.module';
import { DiscordModule } from '@api/services/integrations/discord/discord.module';
import { GhostModule } from '@api/services/integrations/ghost/ghost.module';
import { GoogleSearchConsoleModule } from '@api/services/integrations/google-search-console/google-search-console.module';
import { HedraModule } from '@api/services/integrations/hedra/hedra.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { LinkedInModule } from '@api/services/integrations/linkedin/linkedin.module';
import { MastodonModule } from '@api/services/integrations/mastodon/mastodon.module';
import { MediumModule } from '@api/services/integrations/medium/medium.module';
import { OpusProModule } from '@api/services/integrations/opuspro/opuspro.module';
import { PinterestModule } from '@api/services/integrations/pinterest/pinterest.module';
import { RedditModule } from '@api/services/integrations/reddit/reddit.module';
import { RestreamModule } from '@api/services/integrations/restream/restream.module';
import { ShopifyModule } from '@api/services/integrations/shopify/shopify.module';
import { SnapchatModule } from '@api/services/integrations/snapchat/snapchat.module';
import { SolanaModule } from '@api/services/integrations/solana/solana.module';
import { TelegramModule } from '@api/services/integrations/telegram/telegram.module';
import { ThreadsModule } from '@api/services/integrations/threads/threads.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { UnipileModule } from '@api/services/integrations/unipile/unipile.module';
import { WhatsappModule } from '@api/services/integrations/whatsapp/whatsapp.module';
import { WordpressModule } from '@api/services/integrations/wordpress/wordpress.module';
import { XaiModule } from '@api/services/integrations/xai/xai.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { YoutubeUploadCompletionModule } from '@api/services/integrations/youtube/youtube-upload-completion.module';
import { LifecycleEmailsModule } from '@api/services/lifecycle-emails/lifecycle-emails.module';
import { MicroservicesModule } from '@api/services/microservices/microservices.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { RouterModule as ModelRouterModule } from '@api/services/router/router.module';
import { TelegramBotModule } from '@api/services/telegram-bot/telegram-bot.module';
import { VideoCompletionModule } from '@api/services/video-completion/video-completion.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [MicroservicesModule],
  imports: [
    BeehiivModule,
    DevtoModule,
    DiscordModule,
    GhostModule,
    GoogleSearchConsoleModule,
    HedraModule,
    ArgilModule,
    HeyGenModule,
    InstagramModule,
    IntegrationsModule,
    LinkedInModule,
    MastodonModule,
    OpusProModule,
    OnboardingModule,
    MediumModule,
    LifecycleEmailsModule,
    ManagedInferenceModule,
    MicroservicesModule,
    ModelRouterModule,
    NotificationsModule,
    NotificationsPublisherModule,
    PinterestModule,
    PublicModule,
    RedditModule,
    RestreamModule,
    ShopifyModule,
    SnapchatModule,
    SolanaModule,
    TelegramModule,
    TelegramBotModule,
    ThreadsModule,
    TiktokModule,
    TwitterModule,
    UnipileModule,
    VideoCompletionModule,
    WebhooksModule,
    WhatsappModule,
    WordpressModule,
    XaiModule,
    YoutubeModule,
    YoutubeUploadCompletionModule,
  ],
})
export class AppIntegrationsModule {}
