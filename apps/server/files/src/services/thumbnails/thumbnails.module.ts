import { FFmpegModule } from '@files/services/ffmpeg/ffmpeg.module';
import { S3Service } from '@files/services/s3/s3.service';
import { VideoThumbnailService } from '@files/services/thumbnails/video-thumbnail.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [VideoThumbnailService],
  imports: [FFmpegModule],
  providers: [VideoThumbnailService, S3Service],
})
export class ThumbnailsModule {}
