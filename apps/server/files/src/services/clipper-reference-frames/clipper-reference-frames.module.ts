import { ConfigModule } from '@files/config/config.module';
import { ClipperReferenceFrameExtractionService } from '@files/services/clipper-reference-frames/clipper-reference-frame-extraction.service';
import { FFmpegModule } from '@files/services/ffmpeg/ffmpeg.module';
import { S3Service } from '@files/services/s3/s3.service';
import { UploadModule } from '@files/services/upload/upload.module';
import { YtDlpModule } from '@files/services/ytdlp/ytdlp.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [ClipperReferenceFrameExtractionService],
  imports: [
    ConfigModule,
    FFmpegModule,
    LoggerModule,
    UploadModule,
    YtDlpModule,
  ],
  providers: [ClipperReferenceFrameExtractionService, S3Service],
})
export class ClipperReferenceFramesModule {}
