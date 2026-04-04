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
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { MonitoredAccountsModule } from '@api/collections/monitored-accounts/monitored-accounts.module';
import { ProcessedTweetsModule } from '@api/collections/processed-tweets/processed-tweets.module';
import { ReplyBotConfigsModule } from '@api/collections/reply-bot-configs/reply-bot-configs.module';
import {
  ReplyBotConfig,
  ReplyBotConfigSchema,
} from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { ConfigModule } from '@api/config/config.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { RateLimitService } from '@api/services/reply-bot/rate-limit.service';
import { ReplyBotOrchestratorService } from '@api/services/reply-bot/reply-bot-orchestrator.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import { SocialMonitorService } from '@api/services/reply-bot/social-monitor.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  exports: [
    // Export orchestrator for use by queues and controllers
    ReplyBotOrchestratorService,

    BotActionExecutorService,
    RateLimitService,
    ReplyGenerationService,
    // Export individual services for testing and direct access
    SocialMonitorService,
  ],
  imports: [
    // Configuration
    ConfigModule,
    LoggerModule,

    // Database models needed by rate limit service
    MongooseModule.forFeature(
      [{ name: ReplyBotConfig.name, schema: ReplyBotConfigSchema }],
      DB_CONNECTIONS.CLOUD,
    ),

    BotActivitiesModule,
    CreditsModule,
    ModelsModule,
    MonitoredAccountsModule,
    ProcessedTweetsModule,
    // Collection modules
    ReplyBotConfigsModule,

    PromptBuilderModule,
    ReplicateModule,
    // AI generation dependencies
    TemplatesModule,

    // Apify for multi-platform social media scraping (reading)
    ApifyModule,

    // Instagram for comment replies and DMs
    InstagramModule,
  ],
  providers: [
    BotActionExecutorService,
    RateLimitService,
    ReplyGenerationService,
    // Core services
    SocialMonitorService,

    // Orchestrator
    ReplyBotOrchestratorService,
  ],
})
export class ReplyBotModule {}
