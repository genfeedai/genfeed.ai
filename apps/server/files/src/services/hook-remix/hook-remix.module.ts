import { FFmpegModule } from '@files/services/ffmpeg/ffmpeg.module';
import { HookRemixService } from '@files/services/hook-remix/hook-remix.service';
import { UploadModule } from '@files/services/upload/upload.module';
import { YtDlpModule } from '@files/services/ytdlp/ytdlp.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [HookRemixService],
  imports: [FFmpegModule, UploadModule, YtDlpModule],
  providers: [HookRemixService],
})
export class HookRemixModule {}
