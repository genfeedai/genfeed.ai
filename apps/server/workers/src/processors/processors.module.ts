/**
 * Processors Module (Workers)
 *
 * Registers all BullMQ @Processor classes that were previously running
 * inside the API process. Moving them here ensures the API only serves
 * HTTP traffic while workers handle background job processing.
 *
 * Issue: #84
 */

import { AgentCampaignsModule } from '@api/collections/agent-campaigns/agent-campaigns.module';
import { AgentStrategiesModule } from '@api/collections/agent-strategies/agent-strategies.module';
import { ArticlesModule } from '@api/collections/articles/articles.module';
import { ClipProjectsCoreModule } from '@api/collections/clip-projects/clip-projects-core.module';
import { ContentPerformanceModule } from '@api/collections/content-performance/content-performance.module';
import { ContextsModule } from '@api/collections/contexts/contexts.module';
import { CreativePatternsModule } from '@api/collections/creative-patterns/creative-patterns.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { InsightsModule } from '@api/collections/insights/insights.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { OutreachCampaignsModule } from '@api/collections/outreach-campaigns/outreach-campaigns.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { ReplyBotConfigsModule } from '@api/collections/reply-bot-configs/reply-bot-configs.module';
import { SocialInboxModule } from '@api/collections/social-inbox/social-inbox.module';
import { VoicesModule } from '@api/collections/voices/voices.module';
import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { HeygenPollModule } from '@api/queues/heygen-poll/heygen-poll.module';
import { AgentCampaignOrchestratorModule } from '@api/services/agent-campaign/agent-campaign-orchestrator.module';
import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { AgentStreamPublisherModule } from '@api/services/agent-orchestrator/agent-stream-publisher.module';
import { AiInfluencerModule } from '@api/services/ai-influencer/ai-influencer.module';
import { BatchContentModule } from '@api/services/batch-content/batch-content.module';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { CampaignModule } from '@api/services/campaign/campaign.module';
import { ContentOptimizationModule } from '@api/services/content-optimization/content-optimization.module';
import { ContentOrchestrationModule } from '@api/services/content-orchestration/content-orchestration.module';
import { TelegramDistributionModule } from '@api/services/distribution/telegram/telegram-distribution.module';
import { LifecycleEmailsModule } from '@api/services/lifecycle-emails/lifecycle-emails.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { PublicClipToolStoreModule } from '@api/services/public-clip-tool/public-clip-tool-store.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { SignupPrefillModule } from '@api/services/signup-prefill/signup-prefill.module';
import { SkillExecutorModule } from '@api/services/skill-executor/skill-executor.module';
import { TaskOrchestrationModule } from '@api/services/task-orchestration/task-orchestration.module';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { CronPostsModule } from '@workers/crons/posts/cron.posts.module';
// --- collections/ processors ---
import { WorkflowExecutionProcessor as CollectionsWorkflowExecutionProcessor } from '@workers/processors/api/collections/workflows/services/workflow-execution.processor';
// --- queues/ processors ---
import { CreditDeductionProcessor } from '@workers/processors/api/queues/credit-deduction/credit-deduction.processor';
import { HeygenPollProcessor } from '@workers/processors/api/queues/heygen-poll/heygen-poll.processor';
import { NotificationDeliveryProcessor } from '@workers/processors/api/queues/notification-delivery/notification-delivery.processor';
import { NotificationDeliveryRecoveryModule } from '@workers/processors/api/queues/notification-delivery/notification-delivery-recovery.module';
// --- services/ processors ---
import { WebhookClientProcessor } from '@workers/processors/api/services/webhook-client/webhook-client.processor';
import { WorkersQueuesModule } from '@workers/queues/queues.module';
import { AdsServicesModule } from '@workers/services/ads-services.module';
import { SocialIntegrationsModule } from '@workers/services/social-integrations.module';

@Module({
  imports: [
    // Infrastructure
    LoggerModule,
    HttpModule,
    WorkersQueuesModule,
    NotificationDeliveryRecoveryModule,
    forwardRef(() => CronPostsModule),
    // Config
    forwardRef(() => ConfigModule),
    // Collection modules (provide services injected by processors)
    AdsServicesModule,
    SocialIntegrationsModule,
    forwardRef(() => AgentCampaignsModule),
    forwardRef(() => AgentStrategiesModule),
    forwardRef(() => ArticlesModule),
    forwardRef(() => ClipProjectsCoreModule),
    forwardRef(() => ContentPerformanceModule),
    forwardRef(() => ContextsModule),
    forwardRef(() => CreativePatternsModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => InsightsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => OutreachCampaignsModule),
    forwardRef(() => PostsModule),
    PublicClipToolStoreModule,
    forwardRef(() => ReplyBotConfigsModule),
    forwardRef(() => SocialInboxModule),
    forwardRef(() => VoicesModule),
    forwardRef(() => WorkflowExecutionsModule),
    forwardRef(() => WorkflowsModule),
    forwardRef(() => AgentCampaignOrchestratorModule),
    forwardRef(() => AgentOrchestratorModule),
    AgentStreamPublisherModule,
    forwardRef(() => AiInfluencerModule),
    forwardRef(() => BatchContentModule),
    forwardRef(() => BatchGenerationModule),
    forwardRef(() => CampaignModule),
    forwardRef(() => ContentOptimizationModule),
    forwardRef(() => ContentOrchestrationModule),
    forwardRef(() => LifecycleEmailsModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => ReplyBotModule),
    forwardRef(() => SignupPrefillModule),
    forwardRef(() => SkillExecutorModule),
    forwardRef(() => TaskOrchestrationModule),
    forwardRef(() => HeygenPollModule),
    forwardRef(() => TelegramDistributionModule),
    forwardRef(() => WebhookClientModule),
    forwardRef(() => WhisperModule),
  ],
  providers: [
    // --- queues/ processors ---
    CreditDeductionProcessor,
    HeygenPollProcessor,
    NotificationDeliveryProcessor,

    // --- services/ processors ---
    WebhookClientProcessor,

    // --- collections/ processors ---
    CollectionsWorkflowExecutionProcessor,
  ],
})
export class ProcessorsModule {}
