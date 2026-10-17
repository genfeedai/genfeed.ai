import { PLATFORM_SCHEDULE_QUEUE } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import { CronBrandedDispatchRecoveryService } from '@workers/crons/branded-dispatch-recovery/cron.branded-dispatch-recovery.service';
import { CronCredentialsService } from '@workers/crons/credentials/cron.credentials.service';
import { CronCreditsService } from '@workers/crons/credits/cron.credits.service';
import { CronEngagementTriggersService } from '@workers/crons/engagement/cron.engagement-triggers.service';
import { CronExternalVoiceCatalogService } from '@workers/crons/external-voice-catalog/cron.external-voice-catalog.service';
import { CronFalModelWatcherService } from '@workers/crons/fal-model-watcher/cron.fal-model-watcher.service';
import { CronIngredientsService } from '@workers/crons/ingredients/cron.ingredients.service';
import { CronLifecycleEmailsService } from '@workers/crons/lifecycle-emails/cron.lifecycle-emails.service';
import { CronLlmIdleService } from '@workers/crons/llm-idle/cron.llm-idle.service';
import { CronMediaPerceptionService } from '@workers/crons/media-perception/cron.media-perception.service';
import { CronModelDeprecationService } from '@workers/crons/model-deprecation/cron.model-deprecation.service';
import { CronModelWatcherService } from '@workers/crons/model-watcher/cron.model-watcher.service';
import { CronOAuthClientCleanupService } from '@workers/crons/oauth-client-cleanup/cron.oauth-client-cleanup.service';
import { CronPatternExtractionService } from '@workers/crons/pattern-extraction/cron.pattern-extraction.service';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import { CronReviewGateTimeoutService } from '@workers/crons/review-gate/cron.review-gate-timeout.service';
import { CronRssAutopostService } from '@workers/crons/rss/cron.rss-autopost.service';
import { CronSocialSourceResyncService } from '@workers/crons/social-sources/cron.social-source-resync.service';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';
import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';
import { CronTranscriptPurgeService } from '@workers/crons/transcript-purge/cron.transcript-purge.service';
import { CronTrendsService } from '@workers/crons/trends/cron.trends.service';
import { CronTurboRunReconcileService } from '@workers/crons/turbo-run/cron.turbo-run-reconcile.service';
import { CronWorkflowArtifactsService } from '@workers/crons/workflow-artifacts/cron.workflow-artifacts.service';
import { CronXReplyWatchService } from '@workers/crons/x-replies/cron.x-reply-watch.service';
import { CronYoutubeMessagesService } from '@workers/crons/youtube/cron.youtube-messages.service';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import { QueueMetricsService } from '@workers/monitoring/queue-metrics.service';
import { PlatformMediaSchedulesService } from '@workers/scheduling/platform-media-schedules.service';
import { PlatformRecoverySchedulesService } from '@workers/scheduling/platform-recovery-schedules.service';
import {
  isPlatformScheduledTaskName,
  PLATFORM_SCHEDULED_TASKS,
  type PlatformScheduledTaskName,
} from '@workers/scheduling/platform-schedules.constants';
import { PlatformWorkflowSchedulesService } from '@workers/scheduling/platform-workflow-schedules.service';
import { ThreadCommentDeliveryService } from '@workers/services/thread-comment-delivery.service';
import type { Job } from 'bullmq';

type PlatformTaskHandler = (job: Job) => Promise<unknown>;

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
    private readonly turboRun: CronTurboRunReconcileService,
    private readonly credentials: CronCredentialsService,
    private readonly engagementTriggers: CronEngagementTriggersService,
    private readonly falModelWatcher: CronFalModelWatcherService,
    private readonly ingredients: CronIngredientsService,
    private readonly llmIdle: CronLlmIdleService,
    private readonly mediaPerception: CronMediaPerceptionService,
    private readonly modelDeprecation: CronModelDeprecationService,
    private readonly modelWatcher: CronModelWatcherService,
    private readonly recovery: PlatformRecoverySchedulesService,
    private readonly patternExtraction: CronPatternExtractionService,
    private readonly posts: CronPostsService,
    private readonly queueMetrics: QueueMetricsService,
    private readonly credits: CronCreditsService,
    private readonly reviewGate: CronReviewGateTimeoutService,
    private readonly rss: CronRssAutopostService,
    private readonly socialSourceResync: CronSocialSourceResyncService,
    private readonly streaks: CronStreaksService,
    private readonly tiktok: CronTiktokStatusService,
    private readonly transcriptPurge: CronTranscriptPurgeService,
    private readonly trends: CronTrendsService,
    private readonly mediaSchedules: PlatformMediaSchedulesService,
    private readonly workflowArtifacts: CronWorkflowArtifactsService,
    private readonly youtubeMessages: CronYoutubeMessagesService,
    private readonly youtubeStatus: CronYoutubeStatusService,
    private readonly logger: LoggerService,
    private readonly lifecycleEmails: CronLifecycleEmailsService,
    private readonly threadComments: ThreadCommentDeliveryService,
    private readonly oauthClientCleanup: CronOAuthClientCleanupService,
    private readonly brandedDispatchRecovery: CronBrandedDispatchRecoveryService,
    private readonly workflowSchedules: PlatformWorkflowSchedulesService,
    private readonly xReplyWatch: CronXReplyWatchService,
    private readonly externalVoiceCatalog: CronExternalVoiceCatalogService,
  ) {
    super();
    this.handlers = {
      [PLATFORM_SCHEDULED_TASKS.BRAND_RELOCATION_RECOVERY]: () =>
        this.recovery.recoverBrandRelocations(),
      [PLATFORM_SCHEDULED_TASKS.CRUN_TASK_RECONCILE]: () =>
        this.mediaSchedules.reconcileCrunTasks(),
      [PLATFORM_SCHEDULED_TASKS.CRUN_CONTRACT_SYNC]: () =>
        this.mediaSchedules.synchronizeCrunContracts(),
      [PLATFORM_SCHEDULED_TASKS.PROACTIVE_AGENT_STRATEGIES]: (job) =>
        this.workflowSchedules.sweep(
          'proactive-agent-strategies',
          job.timestamp,
        ),
      [PLATFORM_SCHEDULED_TASKS.CONTENT_LEARNING_RECONCILE]: (job) =>
        this.workflowSchedules.sweep(
          'content-learning.reconcile',
          job.timestamp,
        ),
      [PLATFORM_SCHEDULED_TASKS.CONTENT_LEARNING_RETENTION]: (job) =>
        this.workflowSchedules.sweep(
          'content-learning.retention',
          job.timestamp,
        ),
      [PLATFORM_SCHEDULED_TASKS.ANALYTICS_SYNC]: (job) =>
        this.workflowSchedules.sweep('analytics-sync', job.timestamp),
      [PLATFORM_SCHEDULED_TASKS.CONTENT_LOOP_AUTOPILOT]: (job) =>
        this.workflowSchedules.sweep('content-loop-autopilot', job.timestamp),
      [PLATFORM_SCHEDULED_TASKS.LIFECYCLE_EMAILS]: () =>
        this.lifecycleEmails.processLifecycleEmails(),
      [PLATFORM_SCHEDULED_TASKS.TURBO_RUN_CREDIT_SETTLEMENT_RECONCILE]: () =>
        this.turboRun.reconcileSettlementShortfalls(),
      [PLATFORM_SCHEDULED_TASKS.TURBO_RUN_RECONCILE]: () =>
        this.turboRun.resumeStrandedTurboRuns(),
      [PLATFORM_SCHEDULED_TASKS.TURBO_PROJECT_RECONCILE]: () =>
        this.turboRun.reconcileTurboProjects(),
      [PLATFORM_SCHEDULED_TASKS.CREDENTIAL_TOKEN_REFRESH]: () =>
        this.credentials.refreshExpiringTokens(),
      [PLATFORM_SCHEDULED_TASKS.EDITOR_RENDER_RECONCILE]: () =>
        this.mediaSchedules.reconcileEditorRenders(),
      [PLATFORM_SCHEDULED_TASKS.ENGAGEMENT_TRIGGERS]: () =>
        this.engagementTriggers.processArmedRules(),
      [PLATFORM_SCHEDULED_TASKS.FAL_MODEL_DISCOVERY]: () =>
        this.falModelWatcher.refreshRegistryModels(),
      [PLATFORM_SCHEDULED_TASKS.FREE_TRIAL_EXPIRY]: () =>
        this.credits.expireFreeTrials(),
      [PLATFORM_SCHEDULED_TASKS.GLOBAL_TRENDS_REFRESH]: () =>
        this.trends.refreshGlobalTrends(),
      [PLATFORM_SCHEDULED_TASKS.INGREDIENT_METADATA_REFRESH]: () =>
        this.ingredients.refreshMissingMetadataDimensions(),
      [PLATFORM_SCHEDULED_TASKS.INGREDIENT_PROCESSING_RECONCILE]: () =>
        this.ingredients.checkStuckProcessingIngredients(),
      [PLATFORM_SCHEDULED_TASKS.LLM_IDLE_SHUTDOWN]: () =>
        this.llmIdle.shutdownIfIdle(),
      [PLATFORM_SCHEDULED_TASKS.MEDIA_PERCEPTION_SWEEP]: () =>
        this.mediaPerception.queueDuePerceptions(),
      [PLATFORM_SCHEDULED_TASKS.MODEL_DEPRECATION]: () =>
        this.modelDeprecation.deprecateSupersededModels(),
      [PLATFORM_SCHEDULED_TASKS.NOTIFICATION_DELIVERY_RECOVERY]: () =>
        this.recovery.recoverNotifications(),
      [PLATFORM_SCHEDULED_TASKS.BRANDED_DISPATCH_RECOVERY]: () =>
        this.brandedDispatchRecovery.recoverExpiredDispatches(),
      [PLATFORM_SCHEDULED_TASKS.OAUTH_CLIENT_CLEANUP]: () =>
        this.oauthClientCleanup.deleteAbandonedClients(),
      [PLATFORM_SCHEDULED_TASKS.PATTERN_EXTRACTION]: () =>
        this.patternExtraction.computeDailyPatterns(),
      [PLATFORM_SCHEDULED_TASKS.PENDING_WORKFLOW_EXECUTION_RECONCILE]: () =>
        this.workflowSchedules.reconcilePendingExecutions(),
      [PLATFORM_SCHEDULED_TASKS.POSTS_PUBLISH]: () =>
        this.posts.publishScheduledPosts(),
      [PLATFORM_SCHEDULED_TASKS.POSTS_THREAD_COMMENTS]: () =>
        this.threadComments.publishDueThreadComments(),
      [PLATFORM_SCHEDULED_TASKS.QUEUE_METRICS_PUBLISH]: () =>
        this.queueMetrics.publishQueueMetrics(),
      [PLATFORM_SCHEDULED_TASKS.RAW_CUT_CLIP_RECONCILE]: () =>
        this.mediaSchedules.reconcileRawCutClips(),
      [PLATFORM_SCHEDULED_TASKS.REFERRAL_REWARD_SETTLEMENT]: () =>
        this.credits.settleReferralRewards(),
      [PLATFORM_SCHEDULED_TASKS.REPLICATE_MODEL_DISCOVERY]: () =>
        this.modelWatcher.discoverNewModels(),
      [PLATFORM_SCHEDULED_TASKS.REVIEW_GATE_TIMEOUT]: () =>
        this.reviewGate.resolveTimedOutReviewGates(),
      [PLATFORM_SCHEDULED_TASKS.RSS_AUTOPOST]: () =>
        this.rss.pollEnabledSources(),
      [PLATFORM_SCHEDULED_TASKS.SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC]: () =>
        this.socialSourceResync.resyncDueSources(),
      [PLATFORM_SCHEDULED_TASKS.STREAK_MAINTENANCE]: () =>
        this.streaks.processStreaks(),
      [PLATFORM_SCHEDULED_TASKS.TIKTOK_STATUS]: () =>
        this.tiktok.checkPendingTiktokPosts(),
      [PLATFORM_SCHEDULED_TASKS.TRANSCRIPT_PURGE]: () =>
        this.transcriptPurge.purgeExpiredTranscripts(),
      [PLATFORM_SCHEDULED_TASKS.WORKFLOW_ARTIFACT_CLEANUP]: () =>
        this.workflowArtifacts.queueExpiredArtifactCleanup(),
      [PLATFORM_SCHEDULED_TASKS.WORKFLOW_CONTINUATION_RECONCILE]: () =>
        this.workflowSchedules.reconcileContinuations(),
      [PLATFORM_SCHEDULED_TASKS.WORKSPACE_TASK_ROLLUP_RECOVERY]: () =>
        this.workflowSchedules.recoverWorkspaceTaskRollups(),
      [PLATFORM_SCHEDULED_TASKS.X_REPLY_WATCH]: () =>
        this.xReplyWatch.watchRecentPostReplies(),
      [PLATFORM_SCHEDULED_TASKS.EXTERNAL_VOICE_CATALOG_SYNC]: () =>
        this.externalVoiceCatalog.syncFromProviders(),
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

    await this.handlers[job.name](job);
  }
}
