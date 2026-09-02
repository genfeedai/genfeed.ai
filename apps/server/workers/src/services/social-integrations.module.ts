import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import {
  SERVER_TOKENS,
  type ServerLinkedInTrend,
  type ServerLinkedInTrendResolver,
  type ServerYoutubeUploader,
} from '@api/server.dependencies';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { TwitterResponseMapper } from '@api/services/integrations/twitter/services/twitter-response.mapper';
import { YoutubeAnalyticsService } from '@api/services/integrations/youtube/services/modules/youtube-analytics.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeCommentsService } from '@api/services/integrations/youtube/services/modules/youtube-comments.service';
import { YoutubeMetadataService } from '@api/services/integrations/youtube/services/modules/youtube-metadata.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Injectable, Module } from '@nestjs/common';

@Injectable()
class WorkerLinkedInTrendResolver implements ServerLinkedInTrendResolver {
  resolve(): Promise<ServerLinkedInTrend[]> {
    return Promise.resolve([]);
  }
}

@Injectable()
class WorkerYoutubeUploader implements ServerYoutubeUploader {
  uploadVideo(): Promise<string> {
    throw new Error(
      'YouTube upload stays in the API adapter. Workers refresh tokens and read video status only.',
    );
  }
}

const SOCIAL_SERVICES = [
  FacebookService,
  GoogleAdsService,
  InstagramService,
  LinkedInService,
  MastodonService,
  PinterestService,
  RedditService,
  ThreadsService,
  TiktokService,
  TwitterService,
  YoutubeService,
] as const;

@Module({
  exports: [...SOCIAL_SERVICES],
  imports: [
    ActivitiesModule,
    ConfigModule,
    CredentialsModule,
    HttpModule,
    LoggerModule,
  ],
  providers: [
    ...SOCIAL_SERVICES,
    TwitterResponseMapper,
    WorkerLinkedInTrendResolver,
    WorkerYoutubeUploader,
    YoutubeAnalyticsService,
    YoutubeAuthService,
    YoutubeCommentsService,
    YoutubeMetadataService,
    {
      provide: SERVER_TOKENS.linkedInTrends,
      useExisting: WorkerLinkedInTrendResolver,
    },
    {
      provide: SERVER_TOKENS.youtubeUploads,
      useExisting: WorkerYoutubeUploader,
    },
  ],
})
export class SocialIntegrationsModule {}
