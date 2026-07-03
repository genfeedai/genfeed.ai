import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { SharedModule } from '@api/shared/shared.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { RedisModule } from '@libs/redis/redis.module';
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryModule } from '@sentry/nestjs/setup';
import { ConfigModule } from '@workers/config/config.module';
import { ConfigService } from '@workers/config/config.service';
import { CronAdOptimizationModule } from '@workers/crons/ad-optimization/cron.ad-optimization.module';
import { CronAdSyncModule } from '@workers/crons/ad-sync/cron.ad-sync.module';
import { CronProactiveAgentModule } from '@workers/crons/agent/cron.proactive-agent.module';
import { CronAgentCampaignOrchestratorModule } from '@workers/crons/agent-campaign/cron.agent-campaign-orchestrator.module';
import { CronAiInfluencerModule } from '@workers/crons/ai-influencer/cron.ai-influencer.module';
import { CronByokBillingModule } from '@workers/crons/byok-billing/cron.byok-billing.module';
import { CronContentEngineModule } from '@workers/crons/content-engine/cron.content-engine.module';
import { CronContentPipelineModule } from '@workers/crons/content-pipeline/cron.content-pipeline.module';
import { CronCredentialsModule } from '@workers/crons/credentials/cron.credentials.module';
import { CronDynamicJobsModule } from '@workers/crons/dynamic-jobs/cron.dynamic-jobs.module';
import { CronIngredientsModule } from '@workers/crons/ingredients/cron.ingredients.module';
import { CronLlmIdleModule } from '@workers/crons/llm-idle/cron.llm-idle.module';
import { CronModelDeprecationModule } from '@workers/crons/model-deprecation/cron.model-deprecation.module';
import { CronModelWatcherModule } from '@workers/crons/model-watcher/cron.model-watcher.module';
import { CronPatternExtractionModule } from '@workers/crons/pattern-extraction/cron.pattern-extraction.module';
import { CronPostsModule } from '@workers/crons/posts/cron.posts.module';
import { CronReplyBotModule } from '@workers/crons/reply-bot/cron.reply-bot.module';
import { SocialPollingModule } from '@workers/crons/social-polling/social-polling.module';
import { CronStreaksModule } from '@workers/crons/streaks/cron.streaks.module';
import { CronTiktokModule } from '@workers/crons/tiktok/cron.tiktok.module';
import { CronTrendsModule } from '@workers/crons/trends/cron.trends.module';
import { CronWorkflowsModule } from '@workers/crons/workflows/cron.workflows.module';
import { CronYoutubeModule } from '@workers/crons/youtube/cron.youtube.module';
import { ProcessorsModule } from '@workers/processors/processors.module';
import { CronSchedulerControlService } from '@workers/scheduling/cron-scheduler-control.service';
import { SystemSweepsModule } from '@workers/scheduling/system-sweeps.module';

@Module({
  imports: [
    // Core Infrastructure
    ConfigModule,
    LoggerModule,
    SentryModule.forRoot(),
    ScheduleModule.forRoot(),
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),

    // Shared Services (global in API, must be explicitly imported here)
    SharedModule,
    EventEmitterModule.forRoot({
      // Delimiter for nested events (e.g., 'video.created')
      delimiter: '.',
      // Ignore errors thrown by listeners
      ignoreErrors: false,
      // Maximum number of listeners per event
      maxListeners: 20,
      // Enable verbose error logging
      verboseMemoryLeak: true,
      // Use wildcards for event matching
      wildcard: true,
    }),

    // Database (Prisma — replaces the legacy document-store connections)
    PrismaModule,

    // BullMQ Processor Modules (moved from API — issue #84)
    ProcessorsModule,

    // System sweep schedulers (tenant-product automation, issue #1092)
    SystemSweepsModule,

    // Cron Modules (moved from API)
    CronPatternExtractionModule,
    CronAdOptimizationModule,
    CronLlmIdleModule,
    CronAdSyncModule,
    CronAgentCampaignOrchestratorModule,
    CronAiInfluencerModule,
    CronContentEngineModule,
    CronContentPipelineModule,
    CronProactiveAgentModule,
    CronByokBillingModule,
    CronCredentialsModule,
    CronDynamicJobsModule,
    CronIngredientsModule,
    CronModelDeprecationModule,
    CronModelWatcherModule,
    CronPostsModule,
    CronReplyBotModule,
    CronStreaksModule,
    CronTiktokModule,
    CronTrendsModule,
    SocialPollingModule,
    CronWorkflowsModule,
    CronYoutubeModule,
  ],
  providers: [CronSchedulerControlService],
})
export class AppModule {}
