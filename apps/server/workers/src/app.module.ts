import { SharedModule } from '@api/shared/shared.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { RedisModule } from '@libs/redis/redis.module';
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryModule } from '@sentry/nestjs/setup';
import { ConfigModule } from '@workers/config/config.module';
import { ConfigService } from '@workers/config/config.service';
import { CronByokBillingModule } from '@workers/crons/byok-billing/cron.byok-billing.module';
import { CronCredentialsModule } from '@workers/crons/credentials/cron.credentials.module';
import { CronFalModelWatcherModule } from '@workers/crons/fal-model-watcher/cron.fal-model-watcher.module';
import { CronIngredientsModule } from '@workers/crons/ingredients/cron.ingredients.module';
import { CronLlmIdleModule } from '@workers/crons/llm-idle/cron.llm-idle.module';
import { CronModelDeprecationModule } from '@workers/crons/model-deprecation/cron.model-deprecation.module';
import { CronModelWatcherModule } from '@workers/crons/model-watcher/cron.model-watcher.module';
import { CronPatternExtractionModule } from '@workers/crons/pattern-extraction/cron.pattern-extraction.module';
import { CronPostsModule } from '@workers/crons/posts/cron.posts.module';
import { CronStreaksModule } from '@workers/crons/streaks/cron.streaks.module';
import { CronTiktokModule } from '@workers/crons/tiktok/cron.tiktok.module';
import { CronTrendsModule } from '@workers/crons/trends/cron.trends.module';
import { CronWorkflowsModule } from '@workers/crons/workflows/cron.workflows.module';
import { CronYoutubeModule } from '@workers/crons/youtube/cron.youtube.module';
import { QueueMetricsModule } from '@workers/monitoring/queue-metrics.module';
import { ProcessorsModule } from '@workers/processors/processors.module';
import { CronSchedulerControlService } from '@workers/scheduling/cron-scheduler-control.service';
import { SystemSweepsModule } from '@workers/scheduling/system-sweeps.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    SentryModule.forRoot(),
    ScheduleModule.forRoot(),
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
    SharedModule,
    EventEmitterModule.forRoot({
      delimiter: '.',
      ignoreErrors: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
      wildcard: true,
    }),
    PrismaModule,
    ProcessorsModule,
    SystemSweepsModule,
    QueueMetricsModule,
    CronPatternExtractionModule,
    CronLlmIdleModule,
    CronByokBillingModule,
    CronCredentialsModule,
    CronFalModelWatcherModule,
    CronIngredientsModule,
    CronModelDeprecationModule,
    CronModelWatcherModule,
    CronPostsModule,
    CronStreaksModule,
    CronTiktokModule,
    CronTrendsModule,
    CronWorkflowsModule,
    CronYoutubeModule,
  ],
  providers: [CronSchedulerControlService],
})
export class AppModule {}
