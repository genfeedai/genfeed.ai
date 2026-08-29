import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { WebhooksModule } from '@api/endpoints/webhooks/webhooks.module';
import { ConfigModule as LibsConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import { ConfigModule } from '@workers/config/config.module';
import { CronBatchGenerationModule } from '@workers/crons/batch-generation/cron.batch-generation.module';
import { CronEngagementModule } from '@workers/crons/engagement/cron.engagement.module';
import { CronPostsModule } from '@workers/crons/posts/cron.posts.module';
import { CronReviewGateModule } from '@workers/crons/review-gate/cron.review-gate.module';
import { CronRssModule } from '@workers/crons/rss/cron.rss.module';
import { CronStreaksModule } from '@workers/crons/streaks/cron.streaks.module';
import { CronTiktokModule } from '@workers/crons/tiktok/cron.tiktok.module';
import { CronTranscriptPurgeModule } from '@workers/crons/transcript-purge/cron.transcript-purge.module';
import { CronWorkflowArtifactsModule } from '@workers/crons/workflow-artifacts/cron.workflow-artifacts.module';
import { CronYoutubeModule } from '@workers/crons/youtube/cron.youtube.module';
import { SystemSweepSchedulerService } from '@workers/scheduling/system-sweep-scheduler.service';
import { SYSTEM_SWEEPS_QUEUE } from '@workers/scheduling/system-sweeps.constants';
import { SystemSweepsProcessor } from '@workers/scheduling/system-sweeps.processor';
import { WorkflowContinuationReconcileService } from '@workers/scheduling/workflow-continuation-reconcile.service';

@Module({
  imports: [
    ConfigModule,
    LibsConfigModule,
    LoggerModule,
    WorkflowsModule,
    IngredientsModule,
    WebhooksModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 20,
        removeOnFail: 50,
      },
      name: SYSTEM_SWEEPS_QUEUE,
    }),
    CronBatchGenerationModule,
    CronEngagementModule,
    CronPostsModule,
    CronRssModule,
    CronReviewGateModule,
    CronStreaksModule,
    CronTiktokModule,
    CronTranscriptPurgeModule,
    CronWorkflowArtifactsModule,
    CronYoutubeModule,
  ],
  providers: [
    ReplicateService,
    SystemSweepSchedulerService,
    SystemSweepsProcessor,
    WorkflowContinuationReconcileService,
  ],
})
export class SystemSweepsModule {}
