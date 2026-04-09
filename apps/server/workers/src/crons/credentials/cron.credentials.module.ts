import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { FacebookModule } from '@api/services/integrations/facebook/facebook.module';
import { GoogleAdsModule } from '@api/services/integrations/google-ads/google-ads.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { LinkedInModule } from '@api/services/integrations/linkedin/linkedin.module';
import { PinterestModule } from '@api/services/integrations/pinterest/pinterest.module';
import { RedditModule } from '@api/services/integrations/reddit/reddit.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronCredentialsService } from '@workers/crons/credentials/cron.credentials.service';

@Module({
  imports: [
    forwardRef(() => CredentialsModule),
    forwardRef(() => FacebookModule),
    forwardRef(() => GoogleAdsModule),
    forwardRef(() => InstagramModule),
    forwardRef(() => LinkedInModule),
    forwardRef(() => PinterestModule),
    forwardRef(() => RedditModule),
    forwardRef(() => TiktokModule),
    forwardRef(() => TwitterModule),
    forwardRef(() => YoutubeModule),
  ],
  providers: [CronCredentialsService],
})
export class CronCredentialsModule {}
