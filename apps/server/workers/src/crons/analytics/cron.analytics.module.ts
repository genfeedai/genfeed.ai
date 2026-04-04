import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronAnalyticsSocialService } from '@workers/crons/analytics/cron.analytics-social.service';
import { CronAnalyticsTwitterService } from '@workers/crons/analytics/cron.analytics-twitter.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  imports: [
    forwardRef(() => CredentialsModule),
    forwardRef(() => InstagramModule),
    forwardRef(() => PostsModule),
    forwardRef(() => WorkersQueuesModule),
    forwardRef(() => TiktokModule),
    forwardRef(() => TwitterModule),
  ],
  providers: [CronAnalyticsTwitterService, CronAnalyticsSocialService],
})
export class CronAnalyticsModule {}
