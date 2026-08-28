import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import { CronAgentTurnReconcileService } from '@workers/crons/agent-turn/cron.agent-turn-reconcile.service';
import { CronBatchGenerationReconcileService } from '@workers/crons/batch-generation/cron.batch-generation-reconcile.service';
import { CronEngagementTriggersService } from '@workers/crons/engagement/cron.engagement-triggers.service';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import { CronReviewGateTimeoutService } from '@workers/crons/review-gate/cron.review-gate-timeout.service';
import { CronRssAutopostService } from '@workers/crons/rss/cron.rss-autopost.service';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';
import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';
import { CronTranscriptPurgeService } from '@workers/crons/transcript-purge/cron.transcript-purge.service';
import { CronWorkflowArtifactsService } from '@workers/crons/workflow-artifacts/cron.workflow-artifacts.service';
import { CronYoutubeMessagesService } from '@workers/crons/youtube/cron.youtube-messages.service';
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
    private readonly cronAgentTurnReconcileService: CronAgentTurnReconcileService,
    private readonly cronBatchGenerationReconcileService: CronBatchGenerationReconcileService,
    private readonly cronEngagementTriggersService: CronEngagementTriggersService,
    private readonly cronPostsService: CronPostsService,
    private readonly cronRssAutopostService: CronRssAutopostService,
    private readonly cronReviewGateTimeoutService: CronReviewGateTimeoutService,
    private readonly cronStreaksService: CronStreaksService,
    private readonly cronTiktokStatusService: CronTiktokStatusService,
    private readonly cronTranscriptPurgeService: CronTranscriptPurgeService,
    private readonly cronWorkflowArtifactsService: CronWorkflowArtifactsService,
    private readonly cronYoutubeMessagesService: CronYoutubeMessagesService,
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
      case SYSTEM_SWEEP_JOBS.AGENT_TURN_RECONCILE:
        await this.cronAgentTurnReconcileService.reconcileStrandedTurns();
        return;

      case SYSTEM_SWEEP_JOBS.POSTS_PUBLISH:
        await this.cronPostsService.publishScheduledPosts();
        return;

      case SYSTEM_SWEEP_JOBS.RSS_AUTOPOST:
        await this.cronRssAutopostService.pollEnabledSources();
        return;

      case SYSTEM_SWEEP_JOBS.ENGAGEMENT_TRIGGERS:
        await this.cronEngagementTriggersService.processArmedRules();
        return;

      case SYSTEM_SWEEP_JOBS.TIKTOK_STATUS:
        await this.cronTiktokStatusService.checkPendingTiktokPosts();
        return;

      case SYSTEM_SWEEP_JOBS.YOUTUBE_STATUS:
        await this.cronYoutubeStatusService.checkScheduledYoutubeVideos();
        return;

      case SYSTEM_SWEEP_JOBS.YOUTUBE_MESSAGES:
        await this.cronYoutubeMessagesService.syncYoutubeMessages();
        return;

      case SYSTEM_SWEEP_JOBS.STREAK_MAINTENANCE:
        await this.cronStreaksService.processStreaks();
        return;

      case SYSTEM_SWEEP_JOBS.REVIEW_GATE_TIMEOUT:
        await this.cronReviewGateTimeoutService.resolveTimedOutReviewGates();
        return;

      case SYSTEM_SWEEP_JOBS.BATCH_GENERATION_RECONCILE:
        await this.cronBatchGenerationReconcileService.resumeStrandedBatches();
        return;

      case SYSTEM_SWEEP_JOBS.BATCH_CREDIT_SETTLEMENT_RECONCILE:
        await this.cronBatchGenerationReconcileService.reconcileSettlementShortfalls();
        return;

      case SYSTEM_SWEEP_JOBS.TRANSCRIPT_PURGE:
        await this.cronTranscriptPurgeService.purgeExpiredTranscripts();
        return;

      case SYSTEM_SWEEP_JOBS.WORKFLOW_ARTIFACT_CLEANUP:
        await this.cronWorkflowArtifactsService.queueExpiredArtifactCleanup();
        return;

      default:
        this.logger.warn(
          `Unknown system sweep job ${job.name} - no dispatcher registered`,
          this.context,
        );
    }
  }
}
