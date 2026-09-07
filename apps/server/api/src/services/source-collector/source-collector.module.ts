import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { LinkedInModule } from '@api/services/integrations/linkedin/linkedin.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { ApifySocialProvider } from '@api/services/source-collector/providers/apify-social.provider';
import { InstagramOfficialProvider } from '@api/services/source-collector/providers/instagram-official.provider';
import { LinkedinOfficialProvider } from '@api/services/source-collector/providers/linkedin-official.provider';
import { TiktokOfficialProvider } from '@api/services/source-collector/providers/tiktok-official.provider';
import {
  TwitterAppBearerProvider,
  TwitterBrandOAuthProvider,
} from '@api/services/source-collector/providers/twitter-official.provider';
import { YoutubeOfficialProvider } from '@api/services/source-collector/providers/youtube-official.provider';
import { SourceCollectorService } from '@api/services/source-collector/source-collector.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [SourceCollectorService],
  imports: [
    LoggerModule,
    HttpModule,
    CredentialsCoreModule,
    TwitterModule,
    InstagramModule,
    TiktokModule,
    YoutubeModule,
    LinkedInModule,
    ApifyModule,
  ],
  providers: [
    TwitterBrandOAuthProvider,
    TwitterAppBearerProvider,
    InstagramOfficialProvider,
    TiktokOfficialProvider,
    YoutubeOfficialProvider,
    LinkedinOfficialProvider,
    ApifySocialProvider,
    SourceCollectorService,
  ],
})
export class SourceCollectorModule {}
