import { ClipReferenceFrameExtractionService } from '@files/services/clip-reference-frames/clip-reference-frame-extraction.service';
import { FFmpegModule } from '@files/services/ffmpeg/ffmpeg.module';
import { UploadModule } from '@files/services/upload/upload.module';
import { YtDlpModule } from '@files/services/ytdlp/ytdlp.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [ClipReferenceFrameExtractionService],
  imports: [FFmpegModule, LoggerModule, UploadModule, YtDlpModule],
  providers: [ClipReferenceFrameExtractionService],
})
export class ClipReferenceFramesModule {}
