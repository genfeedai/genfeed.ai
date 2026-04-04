import { YtDlpService } from '@files/services/ytdlp/ytdlp.service';
import { Module } from '@nestjs/common';

// Module to only use ytdlp service

@Module({
  exports: [YtDlpService],
  imports: [],
  providers: [YtDlpService],
})
export class YtDlpModule {}
