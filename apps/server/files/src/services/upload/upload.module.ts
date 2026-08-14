import { ConfigModule } from '@files/config/config.module';
import { ConfigService } from '@files/config/config.service';
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
    {
      inject: [ConfigService],
      provide: 'STORAGE_PROVIDER',
      // Cloud keeps the S3 driver and ignores `baseDir`; self-hosted gets the
      // local driver rooted at the same directory `main.ts` serves `/local` from.
      useFactory: (configService: ConfigService) =>
        createStorageProvider({
          baseDir: configService.get('GENFEED_STORAGE_PATH') || undefined,
          cdnUrl: configService.get('GENFEEDAI_CDN_URL') || undefined,
        }),
    },
  ],
})
export class UploadModule {}
