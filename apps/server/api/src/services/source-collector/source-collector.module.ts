import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { ApifySocialProvider } from '@api/services/source-collector/providers/apify-social.provider';
import {
  TwitterAppBearerProvider,
  TwitterBrandOAuthProvider,
} from '@api/services/source-collector/providers/twitter-official.provider';
import { SourceCollectorService } from '@api/services/source-collector/source-collector.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [SourceCollectorService],
  imports: [LoggerModule, TwitterModule, ApifyModule],
  providers: [
    TwitterBrandOAuthProvider,
    TwitterAppBearerProvider,
    ApifySocialProvider,
    SourceCollectorService,
  ],
})
export class SourceCollectorModule {}
