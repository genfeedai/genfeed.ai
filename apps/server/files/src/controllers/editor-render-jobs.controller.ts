import { JOB_TYPES } from '@files/queues/queue.constants';
import { VideoQueueService } from '@files/queues/video-queue.service';
import { RemotionRenderCancellationService } from '@files/services/remotion/remotion-render-cancellation.service';
import { RemotionRenderJobService } from '@files/services/remotion/remotion-render-job.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  Controller,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';

@Controller('files/job')
export class EditorRenderJobsController {
  constructor(
    private readonly videoQueueService: VideoQueueService,
    private readonly renderJobService: RemotionRenderJobService,
    private readonly cancellationService: RemotionRenderCancellationService,
    private readonly logger: LoggerService,
  ) {}

  @Post(':jobId/cancel')
  async cancel(@Param('jobId') jobId: string) {
    const job = await this.videoQueueService.getJob(jobId);
    if (!job || job.name !== JOB_TYPES.RENDER_EDITOR_COMPOSITION) {
      throw new NotFoundException('Editor render job not found');
    }

    const state = await job.getState();
    if (state === 'completed' || state === 'failed') {
      throw new ConflictException('Editor render job is already terminal');
    }

    const requestedAt = new Date().toISOString();
    await this.renderJobService.requestCancellation(job, requestedAt);
    await this.cancellationService.request(jobId, requestedAt);

    if (state !== 'active') {
      await job.remove().catch((error: unknown) => {
        // The worker may have acquired the job after getState(). The durable
        // cancellation marker and pub/sub signal still cover that race.
        this.logger.warn('Editor render became active during cancellation', {
          jobId,
          reason: error instanceof Error ? error.name : 'unknown',
        });
      });
    }

    return {
      jobId,
      requestedAt,
      status: 'cancellation-requested',
    };
  }
}
