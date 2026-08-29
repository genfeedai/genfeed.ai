/**
 * Reply Bot Module
 *
 * Coordinates the multi-platform reply bot system including:
 * - Social content monitoring (mentions, comments, timelines)
 * - AI-powered reply generation
 * - Reply and DM execution
 * - Rate limiting
 * - Orchestration of the full workflow
 *
 * Supported platforms: Twitter/X, Instagram, TikTok, YouTube, Reddit
 *
 */

import { BotActivitiesModule } from '@api/collections/bot-activities/bot-activities.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { MonitoredAccountsModule } from '@api/collections/monitored-accounts/monitored-accounts.module';
import { ProcessedTweetsModule } from '@api/collections/processed-tweets/processed-tweets.module';
import { ReplyBotConfigsCoreModule } from '@api/collections/reply-bot-configs/reply-bot-configs-core.module';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { AuthorReplyLoopService } from '@server/services/reply-bot/author-reply-loop.service';
import { BotActionExecutorService } from '@server/services/reply-bot/bot-action-executor.service';
import { RateLimitService } from '@server/services/reply-bot/rate-limit.service';
import { ReplyBotOrchestratorService } from '@server/services/reply-bot/reply-bot-orchestrator.service';
import { ReplyCandidatePrefilterService } from '@server/services/reply-bot/reply-candidate-prefilter.service';
import { ReplyGenerationService } from '@server/services/reply-bot/reply-generation.service';
import { ReplyInboundProcessorService } from '@server/services/reply-bot/reply-inbound-processor.service';
import { ReplyPostWatchService } from '@server/services/reply-bot/reply-post-watch.service';
import { SocialMonitorService } from '@server/services/reply-bot/social-monitor.service';
import { XActivitySubscriptionService } from '@server/services/reply-bot/x-activity-subscription.service';
import { XActivityWebhookService } from '@server/services/reply-bot/x-activity-webhook.service';

@Module({
  exports: [
    // Export orchestrator for use by queues and controllers
    ReplyBotOrchestratorService,
    AuthorReplyLoopService,
    ReplyInboundProcessorService,
    ReplyPostWatchService,
    XActivityWebhookService,
    XActivitySubscriptionService,

    BotActionExecutorService,
    RateLimitService,
    ReplyCandidatePrefilterService,
    ReplyGenerationService,
    // Export individual services for testing and direct access
    SocialMonitorService,
  ],
  imports: [
    // Configuration
    ConfigModule,
    LoggerModule,

    BotActivitiesModule,
    CreditsModule,
    CredentialsCoreModule,
    ModelsModule,
    MonitoredAccountsModule,
    ProcessedTweetsModule,
    // Collection modules
    ReplyBotConfigsCoreModule,

    PromptBuilderModule,
    ReplicateModule,
    // AI generation dependencies
    TemplatesModule,

    // Apify for multi-platform social media scraping (reading)
    ApifyModule,

    // Official X API for Following / timelines when bearer is configured
    TwitterModule,

    // Instagram for comment replies and DMs
    InstagramModule,
    WorkflowsCoreModule,
  ],
  providers: [
    AuthorReplyLoopService,
    BotActionExecutorService,
    RateLimitService,
    ReplyCandidatePrefilterService,
    ReplyGenerationService,
    ReplyInboundProcessorService,
    ReplyPostWatchService,
    XActivityWebhookService,
    XActivitySubscriptionService,
    // Core services
    SocialMonitorService,

    // Orchestrator
    ReplyBotOrchestratorService,
  ],
})
export class ReplyBotModule {}
