import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { YoutubeController } from '@api/services/integrations/youtube/controllers/youtube.controller';
import { YoutubeAnalyticsService } from '@api/services/integrations/youtube/services/modules/youtube-analytics.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeCommentsService } from '@api/services/integrations/youtube/services/modules/youtube-comments.service';
import { YoutubeMetadataService } from '@api/services/integrations/youtube/services/modules/youtube-metadata.service';
import { YoutubeUploadService } from '@api/services/integrations/youtube/services/modules/youtube-upload.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { TagResolutionModule } from '@api/shared/services/tag-resolution/tag-resolution.module';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(YoutubeService, {
  additionalImports: [
    forwardRef(() => FileQueueModule),
    TagResolutionModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsModule),
  ],
  additionalProviders: [
    YoutubeAuthService,
    YoutubeMetadataService,
    YoutubeUploadService,
    YoutubeAnalyticsService,
    YoutubeCommentsService,
  ],
});

@Module({
  controllers: [YoutubeController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class YoutubeModule {}
