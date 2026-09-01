import {
  type VideoCompletionEvent,
  VideoCompletionService,
} from '@api/services/video-completion/video-completion.service';
import { Status } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

function isVideoCompletionEvent(data: unknown): data is VideoCompletionEvent {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const candidate = data as Record<string, unknown>;
  return (
    typeof candidate.ingredientId === 'string' &&
    candidate.ingredientId.length > 0 &&
    typeof candidate.organizationId === 'string' &&
    candidate.organizationId.length > 0 &&
    (candidate.status === Status.COMPLETED ||
      candidate.status === Status.FAILED) &&
    typeof candidate.timestamp === 'string' &&
    candidate.timestamp.length > 0
  );
}

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
        if (!isVideoCompletionEvent(data)) {
          this.logger.warn('Ignored invalid video completion event');
          return;
        }

        const event = data;
        this.logger.log(
          `Received video completion event for ${event.ingredientId}`,
        );
        await this.videoCompletionService.handleVideoCompletion(event);
      },
    );
    this.logger.log('Subscribed to video-processing-complete channel');
  }
}
