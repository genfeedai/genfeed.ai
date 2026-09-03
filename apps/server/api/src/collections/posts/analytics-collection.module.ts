import { AnalyticsProviderCollectionService } from '@api/analytics/services/analytics-provider-collection.service';
import { AnalyticsSocialCollectionService } from '@api/analytics/services/analytics-social-collection.service';
import { AnalyticsTwitterCollectionService } from '@api/analytics/services/analytics-twitter-collection.service';
import { AnalyticsYouTubeCollectionService } from '@api/analytics/services/analytics-youtube-collection.service';
import { PostAnalyticsCollectionStateService } from '@api/analytics/services/post-analytics-collection-state.service';
import { ContentPerformanceCoreModule } from '@api/collections/content-performance/content-performance-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { AccountAnalyticsSnapshotService } from '@api/endpoints/analytics/account-analytics-snapshot.service';
import { QueuesModule } from '@api/queues/core/queues.module';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { FacebookModule } from '@api/services/integrations/facebook/facebook.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LinkedInModule } from '@api/services/integrations/linkedin/linkedin.module';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { MastodonModule } from '@api/services/integrations/mastodon/mastodon.module';
import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { PinterestModule } from '@api/services/integrations/pinterest/pinterest.module';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { ThreadsModule } from '@api/services/integrations/threads/threads.module';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

const ANALYTICS_COLLECTION_SERVICES = [
  AccountAnalyticsSnapshotService,
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
