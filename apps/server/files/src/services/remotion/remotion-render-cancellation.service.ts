import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

const EDITOR_RENDER_CANCEL_CHANNEL = 'editor-render-cancel';
const EDITOR_RENDER_PENDING_CANCEL_TTL_MS = 60_000;

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
  private readonly pendingCancellations = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

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

        this.cancelLocally(event.jobId, event.requestedAt);
      },
    );
  }

  register(jobId: string, cancel: () => void): () => void {
    const pendingCancellation = this.pendingCancellations.get(jobId);
    if (pendingCancellation) {
      clearTimeout(pendingCancellation);
      this.pendingCancellations.delete(jobId);
      this.logger.log('Applying pending editor render cancellation', {
        jobId,
      });
      cancel();
      return () => undefined;
    }

    this.activeRenders.set(jobId, cancel);
    return () => {
      if (this.activeRenders.get(jobId) === cancel) {
        this.activeRenders.delete(jobId);
      }
    };
  }

  async request(jobId: string, requestedAt: string): Promise<void> {
    this.cancelLocally(jobId, requestedAt);
    await this.redisService.publish(EDITOR_RENDER_CANCEL_CHANNEL, {
      jobId,
      requestedAt,
    } satisfies EditorRenderCancelEvent);
  }

  private cancelLocally(jobId: string, requestedAt: string): void {
    const cancel = this.activeRenders.get(jobId);
    if (!cancel) {
      const existingTimeout = this.pendingCancellations.get(jobId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
      const timeout = setTimeout(() => {
        this.pendingCancellations.delete(jobId);
      }, EDITOR_RENDER_PENDING_CANCEL_TTL_MS);
      this.pendingCancellations.set(jobId, timeout);
      this.logger.log('Queued editor render cancellation before registration', {
        jobId,
        requestedAt,
      });
      return;
    }

    this.logger.log('Cancelling active editor render', { jobId });
    cancel();
  }
}
