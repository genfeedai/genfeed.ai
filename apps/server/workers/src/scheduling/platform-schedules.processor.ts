import { ReferralsService } from '@api/collections/referrals/services/referrals.service';
import { VideoCompletionService } from '@api/services/video-completion/video-completion.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import { CronBatchGenerationReconcileService } from '@workers/crons/batch-generation/cron.batch-generation-reconcile.service';
import { CronByokBillingService } from '@workers/crons/byok-billing/cron.byok-billing.service';
import { CronCredentialsService } from '@workers/crons/credentials/cron.credentials.service';
import { CronEngagementTriggersService } from '@workers/crons/engagement/cron.engagement-triggers.service';
import { CronFalModelWatcherService } from '@workers/crons/fal-model-watcher/cron.fal-model-watcher.service';
import { CronIngredientsService } from '@workers/crons/ingredients/cron.ingredients.service';
import { CronLlmIdleService } from '@workers/crons/llm-idle/cron.llm-idle.service';
import { CronModelDeprecationService } from '@workers/crons/model-deprecation/cron.model-deprecation.service';
import { CronModelWatcherService } from '@workers/crons/model-watcher/cron.model-watcher.service';
import { CronPatternExtractionService } from '@workers/crons/pattern-extraction/cron.pattern-extraction.service';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import { CronReviewGateTimeoutService } from '@workers/crons/review-gate/cron.review-gate-timeout.service';
import { CronRssAutopostService } from '@workers/crons/rss/cron.rss-autopost.service';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';
import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';
import { CronTranscriptPurgeService } from '@workers/crons/transcript-purge/cron.transcript-purge.service';
import { CronTrendsService } from '@workers/crons/trends/cron.trends.service';
import { CronWorkflowArtifactsService } from '@workers/crons/workflow-artifacts/cron.workflow-artifacts.service';
import { CronYoutubeMessagesService } from '@workers/crons/youtube/cron.youtube-messages.service';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import { QueueMetricsService } from '@workers/monitoring/queue-metrics.service';
import { NotificationDeliveryRecoveryService } from '@workers/processors/api/queues/notification-delivery/notification-delivery-recovery.service';
import {
  isPlatformScheduledTaskName,
  PLATFORM_SCHEDULE_QUEUE,
  PLATFORM_SCHEDULED_TASKS,
  type PlatformScheduledTaskName,
} from '@workers/scheduling/platform-schedules.constants';
import { WorkflowContinuationReconcileService } from '@workers/scheduling/workflow-continuation-reconcile.service';
import type { Job } from 'bullmq';

type PlatformTaskHandler = () => Promise<unknown>;

@Injectable()
@Processor(PLATFORM_SCHEDULE_QUEUE)
export class PlatformSchedulesProcessor extends WorkerHost {
  private readonly context = PlatformSchedulesProcessor.name;
  private readonly handlers: Record<
    PlatformScheduledTaskName,
    PlatformTaskHandler
  >;

  constructor(
    private readonly configService: ConfigService,
    private readonly batchGeneration: CronBatchGenerationReconcileService,
    private readonly byokBilling: CronByokBillingService,
    private readonly credentials: CronCredentialsService,
    private readonly engagementTriggers: CronEngagementTriggersService,
    private readonly falModelWatcher: CronFalModelWatcherService,
    private readonly ingredients: CronIngredientsService,
    private readonly llmIdle: CronLlmIdleService,
    private readonly modelDeprecation: CronModelDeprecationService,
    private readonly modelWatcher: CronModelWatcherService,
    private readonly notificationRecovery: NotificationDeliveryRecoveryService,
    private readonly patternExtraction: CronPatternExtractionService,
    private readonly posts: CronPostsService,
    private readonly queueMetrics: QueueMetricsService,
    private readonly referrals: ReferralsService,
    private readonly reviewGate: CronReviewGateTimeoutService,
    private readonly rss: CronRssAutopostService,
    private readonly streaks: CronStreaksService,
    private readonly tiktok: CronTiktokStatusService,
    private readonly transcriptPurge: CronTranscriptPurgeService,
    private readonly trends: CronTrendsService,
    private readonly videoCompletion: VideoCompletionService,
    private readonly workflowArtifacts: CronWorkflowArtifactsService,
    private readonly workflowContinuation: WorkflowContinuationReconcileService,
    private readonly youtubeMessages: CronYoutubeMessagesService,
    private readonly youtubeStatus: CronYoutubeStatusService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.handlers = {
      [PLATFORM_SCHEDULED_TASKS.BATCH_CREDIT_SETTLEMENT_RECONCILE]: () =>
        this.batchGeneration.reconcileSettlementShortfalls(),
      [PLATFORM_SCHEDULED_TASKS.BATCH_GENERATION_RECONCILE]: () =>
        this.batchGeneration.resumeStrandedBatches(),
      [PLATFORM_SCHEDULED_TASKS.BYOK_MONTHLY_BILLING]: () =>
        this.byokBilling.processMonthlyByokBilling(),
      [PLATFORM_SCHEDULED_TASKS.CREDENTIAL_TOKEN_REFRESH]: () =>
        this.credentials.refreshExpiringTokens(),
      [PLATFORM_SCHEDULED_TASKS.EDITOR_RENDER_RECONCILE]: () =>
        this.videoCompletion.reconcileEditorRenders(),
      [PLATFORM_SCHEDULED_TASKS.ENGAGEMENT_TRIGGERS]: () =>
        this.engagementTriggers.processArmedRules(),
      [PLATFORM_SCHEDULED_TASKS.FAL_MODEL_DISCOVERY]: () =>
        this.falModelWatcher.discoverNewModels(),
      [PLATFORM_SCHEDULED_TASKS.GLOBAL_TRENDS_REFRESH]: () =>
        this.trends.refreshGlobalTrends(),
      [PLATFORM_SCHEDULED_TASKS.INGREDIENT_METADATA_REFRESH]: () =>
        this.ingredients.refreshMissingMetadataDimensions(),
      [PLATFORM_SCHEDULED_TASKS.INGREDIENT_PROCESSING_RECONCILE]: () =>
        this.ingredients.checkStuckProcessingIngredients(),
      [PLATFORM_SCHEDULED_TASKS.LLM_IDLE_SHUTDOWN]: () =>
        this.llmIdle.shutdownIfIdle(),
      [PLATFORM_SCHEDULED_TASKS.MODEL_DEPRECATION]: () =>
        this.modelDeprecation.deprecateSupersededModels(),
      [PLATFORM_SCHEDULED_TASKS.NOTIFICATION_DELIVERY_RECOVERY]: () =>
        this.notificationRecovery.recover(),
      [PLATFORM_SCHEDULED_TASKS.PATTERN_EXTRACTION]: () =>
        this.patternExtraction.computeDailyPatterns(),
      [PLATFORM_SCHEDULED_TASKS.POSTS_PUBLISH]: () =>
        this.posts.publishScheduledPosts(),
      [PLATFORM_SCHEDULED_TASKS.QUEUE_METRICS_PUBLISH]: () =>
        this.queueMetrics.publishQueueMetrics(),
      [PLATFORM_SCHEDULED_TASKS.RAW_CUT_CLIP_RECONCILE]: () =>
        this.videoCompletion.reconcileRawCutClips(),
      [PLATFORM_SCHEDULED_TASKS.REFERRAL_REWARD_SETTLEMENT]: () =>
        this.referrals.settleDueRewards(),
      [PLATFORM_SCHEDULED_TASKS.REPLICATE_MODEL_DISCOVERY]: () =>
        this.modelWatcher.discoverNewModels(),
      [PLATFORM_SCHEDULED_TASKS.REVIEW_GATE_TIMEOUT]: () =>
        this.reviewGate.resolveTimedOutReviewGates(),
      [PLATFORM_SCHEDULED_TASKS.RSS_AUTOPOST]: () =>
        this.rss.pollEnabledSources(),
      [PLATFORM_SCHEDULED_TASKS.STREAK_MAINTENANCE]: () =>
        this.streaks.processStreaks(),
      [PLATFORM_SCHEDULED_TASKS.TIKTOK_STATUS]: () =>
        this.tiktok.checkPendingTiktokPosts(),
      [PLATFORM_SCHEDULED_TASKS.TRANSCRIPT_PURGE]: () =>
        this.transcriptPurge.purgeExpiredTranscripts(),
      [PLATFORM_SCHEDULED_TASKS.WORKFLOW_ARTIFACT_CLEANUP]: () =>
        this.workflowArtifacts.queueExpiredArtifactCleanup(),
      [PLATFORM_SCHEDULED_TASKS.WORKFLOW_CONTINUATION_RECONCILE]: () =>
        this.workflowContinuation.reconcile(),
      [PLATFORM_SCHEDULED_TASKS.YOUTUBE_MESSAGES]: () =>
        this.youtubeMessages.syncYoutubeMessages(),
      [PLATFORM_SCHEDULED_TASKS.YOUTUBE_STATUS]: () =>
        this.youtubeStatus.checkScheduledYoutubeVideos(),
    };
  }

  async process(job: Job): Promise<void> {
    if (!this.configService.isDevSchedulersEnabled) {
      this.logger.debug(
        `Skipping platform schedule ${job.name}: schedulers disabled for local development`,
        this.context,
      );
      return;
    }

    if (!isPlatformScheduledTaskName(job.name)) {
      throw new Error(`Unknown platform scheduled task: ${job.name}`);
    }

    await this.handlers[job.name]();
  }
}
