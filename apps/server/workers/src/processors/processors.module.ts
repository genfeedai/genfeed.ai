/**
 * Processors Module (Workers)
 *
 * Registers all BullMQ @Processor classes that were previously running
 * inside the API process. Moving them here ensures the API only serves
 * HTTP traffic while workers handle background job processing.
 *
 * Issue: #84
 */

// --- Dependency modules (services/collections these processors inject from) ---
import { AdBulkUploadJobsModule } from '@api/collections/ad-bulk-upload-jobs/ad-bulk-upload-jobs.module';
import { AdCreativeMappingsModule } from '@api/collections/ad-creative-mappings/ad-creative-mappings.module';
import { AdOptimizationAuditLogsModule } from '@api/collections/ad-optimization-audit-logs/ad-optimization-audit-logs.module';
import { AdOptimizationConfigsModule } from '@api/collections/ad-optimization-configs/ad-optimization-configs.module';
import { AdOptimizationRecommendationsModule } from '@api/collections/ad-optimization-recommendations/ad-optimization-recommendations.module';
import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { AgentCampaignsModule } from '@api/collections/agent-campaigns/agent-campaigns.module';
import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { AgentStrategiesModule } from '@api/collections/agent-strategies/agent-strategies.module';
import { ArticlesModule } from '@api/collections/articles/articles.module';
// --- collections/ processors ---
import { ArticleGenerationProcessor } from '@api/collections/articles/processors/article-generation.processor';
import { ClipProjectsCoreModule } from '@api/collections/clip-projects/clip-projects-core.module';
import { ContentPerformanceModule } from '@api/collections/content-performance/content-performance.module';
import { CreativePatternsModule } from '@api/collections/creative-patterns/creative-patterns.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { OutreachCampaignsModule } from '@api/collections/outreach-campaigns/outreach-campaigns.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { ReplyBotConfigsModule } from '@api/collections/reply-bot-configs/reply-bot-configs.module';
import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { BatchWorkflowProcessor } from '@api/collections/workflows/services/batch-workflow.processor';
import { WorkflowExecutionProcessor as CollectionsWorkflowExecutionProcessor } from '@api/collections/workflows/services/workflow-execution.processor';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { WorkspaceTasksModule } from '@api/collections/workspace-tasks/workspace-tasks.module';
import { ConfigModule } from '@api/config/config.module';
// --- queues/ processors ---
import { AdBulkUploadProcessor } from '@api/queues/ad-bulk-upload/ad-bulk-upload.processor';
import { AdInsightsAggregationProcessor } from '@api/queues/ad-insights-aggregation/ad-insights-aggregation.processor';
import { AdOptimizationProcessor } from '@api/queues/ad-optimization/ad-optimization.processor';
import { AdSyncGoogleProcessor } from '@api/queues/ad-sync-google/ad-sync-google.processor';
import { AdSyncMetaProcessor } from '@api/queues/ad-sync-meta/ad-sync-meta.processor';
import { AdSyncTikTokProcessor } from '@api/queues/ad-sync-tiktok/ad-sync-tiktok.processor';
import { AgentRunProcessor } from '@api/queues/agent-run/agent-run.processor';
import { AnalyticsSocialProcessor } from '@api/queues/analytics-social/analytics-social.processor';
import { AnalyticsSyncProcessor } from '@api/queues/analytics-sync/analytics-sync.processor';
import { AnalyticsTwitterProcessor } from '@api/queues/analytics-twitter/analytics-twitter.processor';
import { AnalyticsYouTubeProcessor } from '@api/queues/analytics-youtube/analytics-youtube.processor';
import { CampaignProcessor } from '@api/queues/campaign/campaign.processor';
import { ClipAnalyzeProcessor } from '@api/queues/clip-analyze/clip-analyze.processor';
import { ClipFactoryProcessor } from '@api/queues/clip-factory/clip-factory.processor';
import { CreditDeductionProcessor } from '@api/queues/credit-deduction/credit-deduction.processor';
import { EmailDigestProcessor } from '@api/queues/email-digest/email-digest.processor';
import { PatternExtractionProcessor } from '@api/queues/pattern-extraction/pattern-extraction.processor';
import { ReplyBotPollingProcessor } from '@api/queues/reply-bot/reply-bot-polling.processor';
import { TelegramDistributeProcessor } from '@api/queues/telegram-distribute/telegram-distribute.processor';
import {
  WorkflowExecutionProcessor as QueuesWorkflowExecutionProcessor,
  WorkflowDelayProcessor,
} from '@api/queues/workflow/workflow-execution.processor';
import { AgentCampaignOrchestratorModule } from '@api/services/agent-campaign/agent-campaign-orchestrator.module';
// --- services/ processors ---
import { CampaignMemoryProcessor } from '@api/services/agent-campaign/campaign-memory.processor';
import { OrchestratorProcessor } from '@api/services/agent-campaign/orchestrator.processor';
import { TriggerEvaluatorProcessor } from '@api/services/agent-campaign/trigger-evaluator.processor';
import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { AgentStreamPublisherModule } from '@api/services/agent-orchestrator/agent-stream-publisher.module';
import { BatchContentModule } from '@api/services/batch-content/batch-content.module';
import { BatchContentProcessor } from '@api/services/batch-content/batch-content.processor';
import { CampaignModule } from '@api/services/campaign/campaign.module';
import { ContentOptimizationModule } from '@api/services/content-optimization/content-optimization.module';
import { ContentOptimizationProcessor } from '@api/services/content-optimization/content-optimization.processor';
import { ContentOrchestrationModule } from '@api/services/content-orchestration/content-orchestration.module';
import { ContentPipelineProcessor } from '@api/services/content-orchestration/content-pipeline.processor';
import { TelegramDistributionModule } from '@api/services/distribution/telegram/telegram-distribution.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { MetaAdsModule } from '@api/services/integrations/meta-ads/meta-ads.module';
import { PinterestModule } from '@api/services/integrations/pinterest/pinterest.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { SkillExecutorModule } from '@api/services/skill-executor/skill-executor.module';
import { TaskOrchestrationModule } from '@api/services/task-orchestration/task-orchestration.module';
import { WorkspaceTaskProcessor } from '@api/services/task-orchestration/workspace-task.processor';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { WebhookClientProcessor } from '@api/services/webhook-client/webhook-client.processor';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  imports: [
    // Infrastructure
    LoggerModule,
    HttpModule,
    WorkersQueuesModule,

    // Config
    forwardRef(() => ConfigModule),

    // Collection modules (provide services injected by processors)
    forwardRef(() => AdBulkUploadJobsModule),
    forwardRef(() => AdCreativeMappingsModule),
    forwardRef(() => AdOptimizationAuditLogsModule),
    forwardRef(() => AdOptimizationConfigsModule),
    forwardRef(() => AdOptimizationRecommendationsModule),
    forwardRef(() => AdPerformanceModule),
    forwardRef(() => AgentCampaignsModule),
    forwardRef(() => AgentRunsModule),
    forwardRef(() => AgentStrategiesModule),
    forwardRef(() => ArticlesModule),
    forwardRef(() => ClipProjectsCoreModule),
    forwardRef(() => ContentPerformanceModule),
    forwardRef(() => CreativePatternsModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => OutreachCampaignsModule),
    forwardRef(() => PostsModule),
    forwardRef(() => ReplyBotConfigsModule),
    forwardRef(() => WorkflowExecutionsModule),
    forwardRef(() => WorkflowsModule),
    forwardRef(() => WorkspaceTasksModule),

    // Service modules (provide services injected by processors)
    forwardRef(() => AgentCampaignOrchestratorModule),
    forwardRef(() => AgentOrchestratorModule),
    AgentStreamPublisherModule,
    forwardRef(() => BatchContentModule),
    forwardRef(() => CampaignModule),
    forwardRef(() => ContentOptimizationModule),
    forwardRef(() => ContentOrchestrationModule),
    forwardRef(() => InstagramModule),
    forwardRef(() => MetaAdsModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => PinterestModule),
    forwardRef(() => ReplyBotModule),
    forwardRef(() => SkillExecutorModule),
    forwardRef(() => TaskOrchestrationModule),
    forwardRef(() => TelegramDistributionModule),
    forwardRef(() => TiktokModule),
    forwardRef(() => TwitterModule),
    forwardRef(() => WebhookClientModule),
    forwardRef(() => WhisperModule),
    forwardRef(() => YoutubeModule),
  ],
  providers: [
    // --- queues/ processors (20) ---
    AdBulkUploadProcessor,
    AdInsightsAggregationProcessor,
    AdOptimizationProcessor,
    AdSyncGoogleProcessor,
    AdSyncMetaProcessor,
    AdSyncTikTokProcessor,
    AgentRunProcessor,
    AnalyticsSocialProcessor,
    AnalyticsSyncProcessor,
    AnalyticsTwitterProcessor,
    AnalyticsYouTubeProcessor,
    CampaignProcessor,
    ClipAnalyzeProcessor,
    ClipFactoryProcessor,
    CreditDeductionProcessor,
    EmailDigestProcessor,
    PatternExtractionProcessor,
    ReplyBotPollingProcessor,
    TelegramDistributeProcessor,
    QueuesWorkflowExecutionProcessor,
    WorkflowDelayProcessor,

    // --- services/ processors (8) ---
    BatchContentProcessor,
    CampaignMemoryProcessor,
    ContentOptimizationProcessor,
    ContentPipelineProcessor,
    OrchestratorProcessor,
    TriggerEvaluatorProcessor,
    WebhookClientProcessor,
    WorkspaceTaskProcessor,

    // --- collections/ processors (3) ---
    ArticleGenerationProcessor,
    BatchWorkflowProcessor,
    CollectionsWorkflowExecutionProcessor,
  ],
})
export class ProcessorsModule {}
