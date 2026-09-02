import { VideosService } from '@api/collections/videos/services/videos.service';
import { Module } from '@nestjs/common';

/** Video persistence only. Generation/HTTP stays on VideosModule. */
@Module({
  exports: [VideosService],
  providers: [VideosService],
})
export class VideosCoreModule {}
