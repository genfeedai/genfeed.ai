import { FFmpegModule } from '@files/services/ffmpeg/ffmpeg.module';
import { UploadModule } from '@files/services/upload/upload.module';
import { WatermarkExportService } from '@files/services/watermark-export/watermark-export.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [FFmpegModule, UploadModule],
  providers: [WatermarkExportService],
  exports: [WatermarkExportService],
})
export class WatermarkExportModule {}
