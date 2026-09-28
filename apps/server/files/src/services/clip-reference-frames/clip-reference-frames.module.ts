import { ConfigModule } from '@files/config/config.module';
import { ClipReferenceFrameExtractionService } from '@files/services/clip-reference-frames/clip-reference-frame-extraction.service';
import { FFmpegModule } from '@files/services/ffmpeg/ffmpeg.module';
import { S3Service } from '@files/services/s3/s3.service';
import { UploadModule } from '@files/services/upload/upload.module';
import { YtDlpModule } from '@files/services/ytdlp/ytdlp.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [ClipReferenceFrameExtractionService],
  imports: [
    ConfigModule,
    FFmpegModule,
    LoggerModule,
    UploadModule,
    YtDlpModule,
  ],
  providers: [ClipReferenceFrameExtractionService, S3Service],
})
export class ClipReferenceFramesModule {}
