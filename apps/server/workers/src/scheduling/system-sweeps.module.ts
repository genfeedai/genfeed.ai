import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@workers/config/config.module';
import { CronAgentTurnModule } from '@workers/crons/agent-turn/cron.agent-turn.module';
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

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 20,
        removeOnFail: 50,
      },
      name: SYSTEM_SWEEPS_QUEUE,
    }),
    CronAgentTurnModule,
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
  providers: [SystemSweepSchedulerService, SystemSweepsProcessor],
})
export class SystemSweepsModule {}
