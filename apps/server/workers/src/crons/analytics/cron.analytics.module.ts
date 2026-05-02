import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { FacebookModule } from '@api/services/integrations/facebook/facebook.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { LinkedInModule } from '@api/services/integrations/linkedin/linkedin.module';
import { MastodonModule } from '@api/services/integrations/mastodon/mastodon.module';
import { ThreadsModule } from '@api/services/integrations/threads/threads.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronAnalyticsFacebookService } from '@workers/crons/analytics/cron.analytics-facebook.service';
import { CronAnalyticsSocialService } from '@workers/crons/analytics/cron.analytics-social.service';
import { CronAnalyticsSyncService } from '@workers/crons/analytics/cron.analytics-sync.service';
import { CronAnalyticsThreadsService } from '@workers/crons/analytics/cron.analytics-threads.service';
import { CronAnalyticsTwitterService } from '@workers/crons/analytics/cron.analytics-twitter.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  imports: [
    forwardRef(() => CredentialsModule),
    forwardRef(() => FacebookModule),
    forwardRef(() => InstagramModule),
    forwardRef(() => LinkedInModule),
    forwardRef(() => MastodonModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => PostsModule),
    forwardRef(() => ThreadsModule),
    forwardRef(() => TiktokModule),
    forwardRef(() => TwitterModule),
    forwardRef(() => WorkersQueuesModule),
  ],
  providers: [
    CronAnalyticsFacebookService,
    CronAnalyticsSocialService,
    CronAnalyticsSyncService,
    CronAnalyticsThreadsService,
    CronAnalyticsTwitterService,
  ],
})
export class CronAnalyticsModule {}
