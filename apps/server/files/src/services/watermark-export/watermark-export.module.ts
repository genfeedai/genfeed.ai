import { FFmpegModule } from '@files/services/ffmpeg/ffmpeg.module';
import { S3Service } from '@files/services/s3/s3.service';
import { UploadModule } from '@files/services/upload/upload.module';
import { WatermarkExportService } from '@files/services/watermark-export/watermark-export.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [FFmpegModule, UploadModule],
  providers: [WatermarkExportService, S3Service],
  exports: [WatermarkExportService],
})
export class WatermarkExportModule {}
