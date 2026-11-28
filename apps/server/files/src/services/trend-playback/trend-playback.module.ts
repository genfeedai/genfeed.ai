import { TrendPlaybackService } from '@files/services/trend-playback/trend-playback.service';
import { UploadModule } from '@files/services/upload/upload.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [TrendPlaybackService],
  imports: [UploadModule],
  providers: [TrendPlaybackService],
})
export class TrendPlaybackModule {}
