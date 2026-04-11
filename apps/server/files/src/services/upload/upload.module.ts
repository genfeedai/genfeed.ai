import { ConfigModule } from '@files/config/config.module';
import { FFmpegModule } from '@files/services/ffmpeg/ffmpeg.module';
import { UploadService } from '@files/services/upload/upload.service';
import { createStorageProvider } from '@genfeedai/storage';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [UploadService, 'STORAGE_PROVIDER'],
  imports: [ConfigModule, LoggerModule, FFmpegModule, HttpModule],
  providers: [
    UploadService,
    { provide: 'STORAGE_PROVIDER', useFactory: createStorageProvider },
  ],
})
export class UploadModule {}
