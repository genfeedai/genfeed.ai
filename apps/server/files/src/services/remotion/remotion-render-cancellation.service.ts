import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

const EDITOR_RENDER_CANCEL_CHANNEL = 'editor-render-cancel';

interface EditorRenderCancelEvent {
  jobId: string;
  requestedAt: string;
}

function isCancelEvent(value: unknown): value is EditorRenderCancelEvent {
  return (
    value !== null &&
    typeof value === 'object' &&
    'jobId' in value &&
    typeof value.jobId === 'string' &&
    'requestedAt' in value &&
    typeof value.requestedAt === 'string'
  );
}

@Injectable()
export class RemotionRenderCancellationService implements OnModuleInit {
  private readonly activeRenders = new Map<string, () => void>();

  constructor(
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.redisService.subscribe(
      EDITOR_RENDER_CANCEL_CHANNEL,
      (event: unknown) => {
        if (!isCancelEvent(event)) {
          this.logger.warn('Ignored malformed editor render cancellation');
          return;
        }

        this.cancelLocally(event.jobId);
      },
    );
  }

  register(jobId: string, cancel: () => void): () => void {
    this.activeRenders.set(jobId, cancel);
    return () => {
      if (this.activeRenders.get(jobId) === cancel) {
        this.activeRenders.delete(jobId);
      }
    };
  }

  async request(jobId: string, requestedAt: string): Promise<void> {
    this.cancelLocally(jobId);
    await this.redisService.publish(EDITOR_RENDER_CANCEL_CHANNEL, {
      jobId,
      requestedAt,
    } satisfies EditorRenderCancelEvent);
  }

  private cancelLocally(jobId: string): void {
    const cancel = this.activeRenders.get(jobId);
    if (!cancel) {
      return;
    }

    this.logger.log('Cancelling active editor render', { jobId });
    cancel();
  }
}
