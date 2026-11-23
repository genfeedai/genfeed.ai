import { VideoCompletionService } from '@api/services/video-completion/video-completion.service';
import { isVideoCompletionEvent } from '@api/services/video-completion/video-completion-event.util';
import { VIDEO_COMPLETION_QUEUE } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConflictException } from '@nestjs/common';
import type { Job } from 'bullmq';

/**
 * Settles the ingredient of a files-service video job from the event the files
 * service queued when the job finished (#10881). The event waits in Redis until
 * this consumer takes it, so a deploy that rolls the API or a worker task no
 * longer loses it, and a failed attempt runs again.
 */
@Processor(VIDEO_COMPLETION_QUEUE, { concurrency: 5 })
export class VideoCompletionProcessor extends WorkerHost {
  constructor(
    private readonly videoCompletion: VideoCompletionService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    if (!isVideoCompletionEvent(job.data)) {
      // Retrying cannot repair a payload that is not an event.
      this.logger.warn(`Ignored invalid video completion event ${job.id}`);
      return;
    }

    try {
      await this.videoCompletion.handleVideoCompletion(job.data);
    } catch (error: unknown) {
      // Another writer already owns the render: a retry would lose again.
      if (error instanceof ConflictException) {
        this.logger.warn(
          `Video completion ${job.id} lost to another writer: ${error.message}`,
        );
        return;
      }
      throw error;
    }
  }
}
