import { VideoCompletionCoreModule } from '@api/services/video-completion/video-completion-core.module';
import { VideoCompletionSubscriberService } from '@api/services/video-completion/video-completion-subscriber.service';
import { RedisModule } from '@libs/redis/redis.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [VideoCompletionCoreModule],
  imports: [RedisModule, VideoCompletionCoreModule],
  providers: [VideoCompletionSubscriberService],
})
export class VideoCompletionModule {}
