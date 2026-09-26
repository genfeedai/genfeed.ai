import { FFmpegModule } from '@files/services/ffmpeg/ffmpeg.module';
import { MediaPerceptionArtefactsService } from '@files/services/perception/media-perception-artefacts.service';
import { TesseractOcrService } from '@files/services/perception/tesseract-ocr.service';
import { S3Service } from '@files/services/s3/s3.service';
import { UploadModule } from '@files/services/upload/upload.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [MediaPerceptionArtefactsService],
  imports: [FFmpegModule, LoggerModule, UploadModule],
  providers: [MediaPerceptionArtefactsService, S3Service, TesseractOcrService],
})
export class PerceptionModule {}
