import { BrandVideoContextService } from '@api/services/content-quality/brand-video-context.service';
import { VideoFrameSamplerService } from '@api/services/content-quality/video-frame-sampler.service';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { MediaUrlsModule } from '@api/services/media-urls/media-urls.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * What both video scores share: frames sampled across the video and the
 * approved brand rules the judge is told to check them against.
 */
@Module({
  exports: [BrandVideoContextService, VideoFrameSamplerService],
  imports: [FilesClientModule, LoggerModule, MediaUrlsModule],
  providers: [BrandVideoContextService, VideoFrameSamplerService],
})
export class VideoScoringModule {}
