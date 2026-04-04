import { ConfigModule } from '@files/config/config.module';
import { FFmpegModule } from '@files/services/ffmpeg/ffmpeg.module';
import { S3Service } from '@files/services/s3/s3.service';
import { UploadService } from '@files/services/upload/upload.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [UploadService],
  imports: [ConfigModule, LoggerModule, FFmpegModule, HttpModule],
  providers: [UploadService, S3Service],
})
export class UploadModule {}
