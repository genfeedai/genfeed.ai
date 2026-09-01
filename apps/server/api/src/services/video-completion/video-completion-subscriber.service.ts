import {
  type VideoCompletionEvent,
  VideoCompletionService,
} from '@api/services/video-completion/video-completion.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

@Injectable()
export class VideoCompletionSubscriberService implements OnModuleInit {
  constructor(
    private readonly redisService: RedisService,
    private readonly videoCompletionService: VideoCompletionService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.redisService.subscribe(
      'video-processing-complete',
      async (data: unknown) => {
        const event = data as VideoCompletionEvent;
        this.logger.log(
          `Received video completion event for ${event.ingredientId}`,
        );
        await this.videoCompletionService.handleVideoCompletion(event);
      },
    );
    this.logger.log('Subscribed to video-processing-complete channel');
  }
}
