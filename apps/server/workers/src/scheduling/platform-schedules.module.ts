import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { ReferralsModule } from '@api/collections/referrals/referrals.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { WebhooksCoreModule } from '@api/endpoints/webhooks/webhooks-core.module';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { VideoCompletionCoreModule } from '@api/services/video-completion/video-completion-core.module';
import { ConfigModule as LibsConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@workers/config/config.module';
import { CronBatchGenerationModule } from '@workers/crons/batch-generation/cron.batch-generation.module';
import { CronByokBillingModule } from '@workers/crons/byok-billing/cron.byok-billing.module';
import { CronCredentialsModule } from '@workers/crons/credentials/cron.credentials.module';
import { CronEngagementModule } from '@workers/crons/engagement/cron.engagement.module';
import { CronFalModelWatcherModule } from '@workers/crons/fal-model-watcher/cron.fal-model-watcher.module';
import { CronIngredientsModule } from '@workers/crons/ingredients/cron.ingredients.module';
import { CronLlmIdleModule } from '@workers/crons/llm-idle/cron.llm-idle.module';
import { CronModelDeprecationModule } from '@workers/crons/model-deprecation/cron.model-deprecation.module';
import { CronModelWatcherModule } from '@workers/crons/model-watcher/cron.model-watcher.module';
import { CronPatternExtractionModule } from '@workers/crons/pattern-extraction/cron.pattern-extraction.module';
import { CronPostsModule } from '@workers/crons/posts/cron.posts.module';
import { CronReviewGateModule } from '@workers/crons/review-gate/cron.review-gate.module';
import { CronRssModule } from '@workers/crons/rss/cron.rss.module';
import { CronStreaksModule } from '@workers/crons/streaks/cron.streaks.module';
import { CronTiktokModule } from '@workers/crons/tiktok/cron.tiktok.module';
import { CronTranscriptPurgeModule } from '@workers/crons/transcript-purge/cron.transcript-purge.module';
import { CronTrendsModule } from '@workers/crons/trends/cron.trends.module';
import { CronWorkflowArtifactsModule } from '@workers/crons/workflow-artifacts/cron.workflow-artifacts.module';
import { CronYoutubeModule } from '@workers/crons/youtube/cron.youtube.module';
import { QueueMetricsModule } from '@workers/monitoring/queue-metrics.module';
import { NotificationDeliveryRecoveryModule } from '@workers/processors/api/queues/notification-delivery/notification-delivery-recovery.module';
import { PlatformScheduleRegistryService } from '@workers/scheduling/platform-schedule-registry.service';
import { PLATFORM_SCHEDULE_QUEUE } from '@workers/scheduling/platform-schedules.constants';
import { PlatformSchedulesProcessor } from '@workers/scheduling/platform-schedules.processor';
import { WorkflowContinuationReconcileService } from '@workers/scheduling/workflow-continuation-reconcile.service';

@Module({
  imports: [
    ConfigModule,
    LibsConfigModule,
    LoggerModule,
    WorkflowsModule,
    IngredientsModule,
    ReferralsModule,
    VideoCompletionCoreModule,
    WebhooksCoreModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 20,
        removeOnFail: 50,
      },
      name: PLATFORM_SCHEDULE_QUEUE,
    }),
    CronBatchGenerationModule,
    CronByokBillingModule,
    CronCredentialsModule,
    CronEngagementModule,
    CronFalModelWatcherModule,
    CronIngredientsModule,
    CronLlmIdleModule,
    CronModelDeprecationModule,
    CronModelWatcherModule,
    CronPatternExtractionModule,
    CronPostsModule,
    CronReviewGateModule,
    CronRssModule,
    CronStreaksModule,
    CronTiktokModule,
    CronTranscriptPurgeModule,
    CronTrendsModule,
    CronWorkflowArtifactsModule,
    CronYoutubeModule,
    NotificationDeliveryRecoveryModule,
    QueueMetricsModule,
  ],
  providers: [
    ReplicateService,
    PlatformScheduleRegistryService,
    PlatformSchedulesProcessor,
    WorkflowContinuationReconcileService,
  ],
})
export class PlatformSchedulesModule {}
