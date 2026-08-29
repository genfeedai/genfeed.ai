import { ContentPerformanceCoreModule } from '@api/collections/content-performance/content-performance-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { FacebookModule } from '@api/services/integrations/facebook/facebook.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { LinkedInModule } from '@api/services/integrations/linkedin/linkedin.module';
import { MastodonModule } from '@api/services/integrations/mastodon/mastodon.module';
import { PinterestModule } from '@api/services/integrations/pinterest/pinterest.module';
import { ThreadsModule } from '@api/services/integrations/threads/threads.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';
import { AnalyticsProviderCollectionService } from '@server/analytics/services/analytics-provider-collection.service';
import { AnalyticsSocialCollectionService } from '@server/analytics/services/analytics-social-collection.service';
import { AnalyticsTwitterCollectionService } from '@server/analytics/services/analytics-twitter-collection.service';
import { AnalyticsYouTubeCollectionService } from '@server/analytics/services/analytics-youtube-collection.service';
import { PostAnalyticsCollectionStateService } from '@server/analytics/services/post-analytics-collection-state.service';
import { CredentialsService } from '@server/collections/credentials/services/credentials.service';
import { PostAnalyticsService } from '@server/collections/posts/services/post-analytics.service';
import { PostsService } from '@server/collections/posts/services/posts.service';
import { AnalyticsSyncWorkflowService } from '@server/collections/workflows/services/analytics-sync-workflow.service';
import { SERVER_TOKENS } from '@server/server.dependencies';
import { InstagramService } from '@server/services/integrations/instagram/services/instagram.service';
import { LinkedInService } from '@server/services/integrations/linkedin/services/linkedin.service';
import { MastodonService } from '@server/services/integrations/mastodon/services/mastodon.service';
import { PinterestService } from '@server/services/integrations/pinterest/services/pinterest.service';
import { TiktokService } from '@server/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@server/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@server/services/integrations/youtube/services/youtube.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

const ANALYTICS_COLLECTION_SERVICES = [
  AnalyticsProviderCollectionService,
  AnalyticsSocialCollectionService,
  AnalyticsTwitterCollectionService,
  AnalyticsYouTubeCollectionService,
  AnalyticsSyncWorkflowService,
  PostAnalyticsCollectionStateService,
  PostAnalyticsService,
] as const;

@Module({
  exports: [...ANALYTICS_COLLECTION_SERVICES],
  imports: [
    ContentPerformanceCoreModule,
    CredentialsCoreModule,
    FacebookModule,
    InstagramModule,
    LinkedInModule,
    LoggerModule,
    MastodonModule,
    PinterestModule,
    PostsCoreModule,
    PrismaModule,
    QueuesModule,
    ThreadsModule,
    TiktokModule,
    TwitterModule,
    WorkflowsCoreModule,
    YoutubeModule,
  ],
  providers: [
    ...ANALYTICS_COLLECTION_SERVICES,
    {
      provide: SERVER_TOKENS.analyticsCollectionState,
      useExisting: PostAnalyticsCollectionStateService,
    },
    { provide: SERVER_TOKENS.credentials, useExisting: CredentialsService },
    { provide: SERVER_TOKENS.instagram, useExisting: InstagramService },
    { provide: SERVER_TOKENS.linkedIn, useExisting: LinkedInService },
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.mastodon, useExisting: MastodonService },
    { provide: SERVER_TOKENS.pinterest, useExisting: PinterestService },
    { provide: SERVER_TOKENS.postAnalytics, useExisting: PostAnalyticsService },
    { provide: SERVER_TOKENS.posts, useExisting: PostsService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
    { provide: SERVER_TOKENS.tiktok, useExisting: TiktokService },
    { provide: SERVER_TOKENS.twitter, useExisting: TwitterService },
    { provide: SERVER_TOKENS.youtube, useExisting: YoutubeService },
  ],
})
export class AnalyticsCollectionModule {}
