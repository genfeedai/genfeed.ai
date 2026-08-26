import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { SocialWarmupEnrollmentsModule } from '@api/collections/social-warmup-enrollments/social-warmup-enrollments.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { YoutubeController } from '@api/services/integrations/youtube/controllers/youtube.controller';
import { YoutubeUploadService } from '@api/services/integrations/youtube/services/modules/youtube-upload.service';
import { YoutubeAuthorizedSignalsService } from '@api/services/integrations/youtube/services/youtube-authorized-signals.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { TagResolutionModule } from '@api/shared/services/tag-resolution/tag-resolution.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { SERVER_TOKENS } from '@server/server.dependencies';
import { YoutubeAnalyticsService } from '@server/services/integrations/youtube/services/modules/youtube-analytics.service';
import { YoutubeAuthService } from '@server/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeCommentsService } from '@server/services/integrations/youtube/services/modules/youtube-comments.service';
import { YoutubeMetadataService } from '@server/services/integrations/youtube/services/modules/youtube-metadata.service';
import { YoutubeService } from '@server/services/integrations/youtube/services/youtube.service';

const YOUTUBE_UPLOADS_PROVIDER = {
  provide: SERVER_TOKENS.youtubeUploads,
  useExisting: YoutubeUploadService,
};

const BaseModule = createServiceModule(YoutubeService, {
  additionalImports: [
    FileQueueModule,
    TagResolutionModule,
    BrandsCoreModule,
    CredentialsCoreModule,
    HttpModule,
  ],
  additionalProviders: [
    YoutubeAuthService,
    YoutubeMetadataService,
    YoutubeUploadService,
    YOUTUBE_UPLOADS_PROVIDER,
    YoutubeAnalyticsService,
    YoutubeCommentsService,
  ],
});

@Module({
  controllers: [YoutubeController],
  exports: [...(BaseModule.exports ?? []), YoutubeAuthorizedSignalsService],
  imports: [...(BaseModule.imports ?? []), SocialWarmupEnrollmentsModule],
  providers: [...(BaseModule.providers ?? []), YoutubeAuthorizedSignalsService],
})
export class YoutubeModule {}
