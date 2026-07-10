import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import { CronReviewGateTimeoutService } from '@workers/crons/review-gate/cron.review-gate-timeout.service';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';
import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import {
  SYSTEM_SWEEP_JOBS,
  SYSTEM_SWEEPS_QUEUE,
} from '@workers/scheduling/system-sweeps.constants';
import type { Job } from 'bullmq';

/**
 * Consumes system sweep jobs fired by BullMQ Job Schedulers and dispatches
 * to the owning sweep service. Replaces the static @Cron triggers for
 * tenant-product automation (issue #1092).
 */
@Injectable()
@Processor(SYSTEM_SWEEPS_QUEUE)
export class SystemSweepsProcessor extends WorkerHost {
  private readonly context = 'SystemSweepsProcessor';

  constructor(
    private readonly configService: ConfigService,
    private readonly cronPostsService: CronPostsService,
    private readonly cronReviewGateTimeoutService: CronReviewGateTimeoutService,
    private readonly cronStreaksService: CronStreaksService,
    private readonly cronTiktokStatusService: CronTiktokStatusService,
    private readonly cronYoutubeStatusService: CronYoutubeStatusService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (!this.configService.isDevSchedulersEnabled) {
      this.logger.debug(
        `Skipping system sweep ${job.name}: schedulers disabled for local development`,
        this.context,
      );
      return;
    }

    switch (job.name) {
      case SYSTEM_SWEEP_JOBS.POSTS_PUBLISH:
        await this.cronPostsService.publishScheduledPosts();
        return;

      case SYSTEM_SWEEP_JOBS.TIKTOK_STATUS:
        await this.cronTiktokStatusService.checkPendingTiktokPosts();
        return;

      case SYSTEM_SWEEP_JOBS.YOUTUBE_STATUS:
        await this.cronYoutubeStatusService.checkScheduledYoutubeVideos();
        return;

      case SYSTEM_SWEEP_JOBS.STREAK_MAINTENANCE:
        await this.cronStreaksService.processStreaks();
        return;

      case SYSTEM_SWEEP_JOBS.REVIEW_GATE_TIMEOUT:
        await this.cronReviewGateTimeoutService.resolveTimedOutReviewGates();
        return;

      default:
        this.logger.warn(
          `Unknown system sweep job ${job.name} - no dispatcher registered`,
          this.context,
        );
    }
  }
}
