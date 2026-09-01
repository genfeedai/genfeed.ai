import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { PrismaService } from '@libs/prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AnalyticsProviderCollectionService } from '@server/analytics/services/analytics-provider-collection.service';
import { AnalyticsSocialCollectionService } from '@server/analytics/services/analytics-social-collection.service';
import { AnalyticsTwitterCollectionService } from '@server/analytics/services/analytics-twitter-collection.service';
import { AnalyticsYouTubeCollectionService } from '@server/analytics/services/analytics-youtube-collection.service';
import { PostAnalyticsCollectionStateService } from '@server/analytics/services/post-analytics-collection-state.service';
import { ActivitiesService } from '@server/collections/activities/services/activities.service';
import { AdBulkUploadJobsService } from '@server/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { AdCreativeMappingsService } from '@server/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import { AdOptimizationAuditLogsService } from '@server/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import { AdOptimizationConfigsService } from '@server/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import { AdOptimizationRecommendationsService } from '@server/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service';
import { AdPerformanceService } from '@server/collections/ad-performance/services/ad-performance.service';
import { AgentCampaignExecutionService } from '@server/collections/agent-campaigns/services/agent-campaign-execution.service';
import { AgentCampaignsService } from '@server/collections/agent-campaigns/services/agent-campaigns.service';
import { AgentPublishAuditsService } from '@server/collections/agent-publish-audits/services/agent-publish-audits.service';
import { AgentStrategiesService } from '@server/collections/agent-strategies/services/agent-strategies.service';
import { AgentStrategyAutopilotService } from '@server/collections/agent-strategies/services/agent-strategy-autopilot.service';
import { AgentStrategyOpportunitiesService } from '@server/collections/agent-strategies/services/agent-strategy-opportunities.service';
import { AgentStrategyReportsService } from '@server/collections/agent-strategies/services/agent-strategy-reports.service';
import { AgentStrategyWorkflowRunService } from '@server/collections/agent-strategies/services/agent-strategy-workflow-run.service';
import { ArticleAnalyticsService } from '@server/collections/articles/services/article-analytics.service';
import { ArticlesService } from '@server/collections/articles/services/articles.service';
import { ArticlesContentService } from '@server/collections/articles/services/articles-content.service';
import { BillingAccountsService } from '@server/collections/billing-accounts/services/billing-accounts.service';
import { ClipProjectsService } from '@server/collections/clip-projects/clip-projects.service';
import { ClipGenerationService } from '@server/collections/clip-projects/services/clip-generation.service';
import { ClipGenerationRequestService } from '@server/collections/clip-projects/services/clip-generation-request.service';
import { ClipIdentityResolutionService } from '@server/collections/clip-projects/services/clip-identity-resolution.service';
import { ClipLibraryLinkService } from '@server/collections/clip-projects/services/clip-library-link.service';
import { HighlightRewriteService } from '@server/collections/clip-projects/services/highlight-rewrite.service';
import { HookClipApprovalService } from '@server/collections/clip-projects/services/hook-clip-approval.service';
import { RawCutClipService } from '@server/collections/clip-projects/services/raw-cut-clip.service';
import { RawCutClipCompletionService } from '@server/collections/clip-projects/services/raw-cut-clip-completion.service';
import { AnalyticsSyncService } from '@server/collections/content-performance/services/analytics-sync.service';
import { AttributionService } from '@server/collections/content-performance/services/attribution.service';
import { EmailDigestService } from '@server/collections/content-performance/services/email-digest.service';
import { OptimizationCycleService } from '@server/collections/content-performance/services/optimization-cycle.service';
import { PerformanceSummaryService } from '@server/collections/content-performance/services/performance-summary.service';
import { VariationGroupScoringService } from '@server/collections/content-performance/services/variation-group-scoring.service';
import { WinnerPromotionWorkflowService } from '@server/collections/content-performance/services/winner-promotion-workflow.service';
import { ContextsService } from '@server/collections/contexts/services/contexts.service';
import { KnowledgeSourceService } from '@server/collections/contexts/services/knowledge-source.service';
import { KnowledgeSourceIngestService } from '@server/collections/contexts/services/knowledge-source-ingest.service';
import { CreativePatternsService } from '@server/collections/creative-patterns/creative-patterns.service';
import { CredentialPublishingReadinessService } from '@server/collections/credentials/services/credential-publishing-readiness.service';
import { CredentialsService } from '@server/collections/credentials/services/credentials.service';
import { CreditBalanceService } from '@server/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@server/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@server/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { VideoGenerationLineageService } from '@server/collections/credits/services/video-generation-lineage.service';
import { CustomerInstanceResolverService } from '@server/collections/customer-instances/customer-instance-resolver.service';
import { IngredientGenerationCancellationService } from '@server/collections/ingredients/services/ingredient-generation-cancellation.service';
import { IngredientsService } from '@server/collections/ingredients/services/ingredients.service';
import { InsightsService } from '@server/collections/insights/services/insights.service';
import { MetadataService } from '@server/collections/metadata/services/metadata.service';
import { ModelRegistrationService } from '@server/collections/models/services/model-registration.service';
import { ModelsService } from '@server/collections/models/services/models.service';
import { AssetGateService } from '@server/collections/organization-settings/services/asset-gate.service';
import { OrganizationSettingsService } from '@server/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@server/collections/organizations/services/organizations.service';
import { OutreachCampaignsService } from '@server/collections/outreach-campaigns/services/outreach-campaigns.service';
import { PostGroupsService } from '@server/collections/post-groups/services/post-groups.service';
import { PostAnalyticsService } from '@server/collections/posts/services/post-analytics.service';
import { PostRepurposeService } from '@server/collections/posts/services/post-repurpose.service';
import { PostsService } from '@server/collections/posts/services/posts.service';
import { ReviewablePostsService } from '@server/collections/posts/services/reviewable-posts.service';
import { ReplyBotConfigsService } from '@server/collections/reply-bot-configs/services/reply-bot-configs.service';
import { RssSourcesService } from '@server/collections/rss-sources/services/rss-sources.service';
import { SocialInboxService } from '@server/collections/social-inbox/services/social-inbox.service';
import { SocialReplyCampaignDispatchService } from '@server/collections/social-inbox/services/social-reply-campaign-dispatch.service';
import { StreaksService } from '@server/collections/streaks/services/streaks.service';
import { TasksService } from '@server/collections/tasks/services/tasks.service';
import { TrendPreferencesService } from '@server/collections/trends/services/trend-preferences.service';
import { TrendReferenceCorpusService } from '@server/collections/trends/services/trend-reference-corpus.service';
import { TrendsService } from '@server/collections/trends/services/trends.service';
import { AvatarVideoGenerationService } from '@server/collections/videos/services/avatar-video-generation.service';
import { ExternalVoiceCatalogService } from '@server/collections/voices/services/external-voice-catalog.service';
import { VoiceGenerationService } from '@server/collections/voices/services/voice-generation.service';
import { VoicesService } from '@server/collections/voices/services/voices.service';
import { WorkflowExecutionsService } from '@server/collections/workflow-executions/services/workflow-executions.service';
import { AdAutomationWorkflowService } from '@server/collections/workflows/services/ad-automation-workflow.service';
import { AdBulkUploadWorkflowService } from '@server/collections/workflows/services/ad-bulk-upload-workflow.service';
import { AnalyticsSyncWorkflowService } from '@server/collections/workflows/services/analytics-sync-workflow.service';
import { SystemWorkflowCatalogService } from '@server/collections/workflows/services/system-workflow-catalog.service';
import { WorkflowEngineAdapterService } from '@server/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionAuthorizationService } from '@server/collections/workflows/services/workflow-execution-authorization.service';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@server/collections/workflows/services/workflow-executor.service';
import { WorkflowFormatConverterService } from '@server/collections/workflows/services/workflow-format-converter.service';
import { WorkflowGenerationService } from '@server/collections/workflows/services/workflow-generation.service';
import { WorkflowRunControlService } from '@server/collections/workflows/services/workflow-run-control.service';
import { WorkflowSchedulerService } from '@server/collections/workflows/services/workflow-scheduler.service';
import { WorkflowTemplateSeederService } from '@server/collections/workflows/services/workflow-template-seeder.service';
import { WorkflowWebhookService } from '@server/collections/workflows/services/workflow-webhook.service';
import { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';
import {
  SYSTEM_WORKFLOW_CATALOG,
  SYSTEM_WORKFLOW_RUNNER,
  WORKFLOW_ENGINE_ADAPTER,
  WORKFLOW_EXECUTOR,
} from '@server/collections/workflows/workflows.tokens';
import { ManagedInferenceClientService } from '@server/endpoints/v1/managed-inference/managed-inference-client.service';
import { WebhooksService } from '@server/endpoints/webhooks/webhooks.service';
import { TransactionUtil } from '@server/helpers/utils/transaction/transaction.util';
import { QueueService } from '@server/queues/core/queue.service';
import { HeygenPollQueueService } from '@server/queues/heygen-poll/heygen-poll-queue.service';
import { SERVER_TOKENS } from '@server/server.dependencies';
import { CampaignWinnerExtractionService } from '@server/services/agent-campaign/campaign-winner-extraction.service';
import { ContentEngineService } from '@server/services/agent-campaign/content-engine.service';
import { ContentRotationService } from '@server/services/agent-campaign/content-rotation.service';
import { TriggerEvaluatorService } from '@server/services/agent-campaign/trigger-evaluator.service';
import { AgentOrchestratorService } from '@server/services/agent-orchestrator/agent-orchestrator.service';
import { AgentStreamPublisherService } from '@server/services/agent-orchestrator/agent-stream-publisher.service';
import { AgentTurnAcceptanceService } from '@server/services/agent-orchestrator/agent-turn-acceptance.service';
import { ApiKeyHelperService } from '@server/services/api-key/api-key-helper.service';
import { HeygenAvatarProvider } from '@server/services/avatar-video/providers/heygen-avatar.provider';
import { BatchGenerationService } from '@server/services/batch-generation/batch-generation.service';
import { BatchGenerationCreditsService } from '@server/services/batch-generation/batch-generation-credits.service';
import { BatchGenerationReconcileService } from '@server/services/batch-generation/batch-generation-reconcile.service';
import { BatchGenerationStreamService } from '@server/services/batch-generation/batch-generation-stream.service';
import { BrandMemorySyncService } from '@server/services/brand-memory/brand-memory-sync.service';
import { ByokService } from '@server/services/byok/byok.service';
import { ByokProviderFactoryService } from '@server/services/byok/byok-provider-factory.service';
import { ByokBillingService } from '@server/services/byok-billing/byok-billing.service';
import { CacheModule } from '@server/services/cache/cache.module';
import { CampaignDiscoveryService } from '@server/services/campaign/campaign-discovery.service';
import { CampaignExecutorService } from '@server/services/campaign/campaign-executor.service';
import { DmCampaignExecutorService } from '@server/services/campaign/dm-campaign-executor.service';
import { ContentOrchestrationService } from '@server/services/content-orchestration/content-orchestration.service';
import { StepExecutorService } from '@server/services/content-orchestration/step-executor.service';
import { TelegramDistributionService } from '@server/services/distribution/telegram/telegram-distribution.service';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { ElevenLabsService } from '@server/services/integrations/elevenlabs/services/elevenlabs.service';
import { FacebookService } from '@server/services/integrations/facebook/services/facebook.service';
import { FalService } from '@server/services/integrations/fal/services/fal.service';
import { FleetService } from '@server/services/integrations/fleet/fleet.service';
import { GoogleAdsService } from '@server/services/integrations/google-ads/services/google-ads.service';
import { HiggsFieldService } from '@server/services/integrations/higgsfield/higgsfield.service';
import { InstagramService } from '@server/services/integrations/instagram/services/instagram.service';
import { KlingAIService } from '@server/services/integrations/klingai/services/klingai.service';
import { LeonardoAIService } from '@server/services/integrations/leonardoai/services/leonardoai.service';
import { LinkedInService } from '@server/services/integrations/linkedin/services/linkedin.service';
import { MastodonService } from '@server/services/integrations/mastodon/services/mastodon.service';
import { MetaAdsService } from '@server/services/integrations/meta-ads/services/meta-ads.service';
import { PinterestService } from '@server/services/integrations/pinterest/services/pinterest.service';
import { BeehiivPublisherService } from '@server/services/integrations/publishers/beehiiv-publisher.service';
import { FacebookPublisherService } from '@server/services/integrations/publishers/facebook-publisher.service';
import { FanvuePublisherService } from '@server/services/integrations/publishers/fanvue-publisher.service';
import { GhostPublisherService } from '@server/services/integrations/publishers/ghost-publisher.service';
import { InstagramPublisherService } from '@server/services/integrations/publishers/instagram-publisher.service';
import { LinkedInPublisherService } from '@server/services/integrations/publishers/linkedin-publisher.service';
import { MastodonPublisherService } from '@server/services/integrations/publishers/mastodon-publisher.service';
import { PinterestPublisherService } from '@server/services/integrations/publishers/pinterest-publisher.service';
import { PublisherFactoryService } from '@server/services/integrations/publishers/publisher-factory.service';
import { RedditPublisherService } from '@server/services/integrations/publishers/reddit-publisher.service';
import { ShopifyPublisherService } from '@server/services/integrations/publishers/shopify-publisher.service';
import { SnapchatPublisherService } from '@server/services/integrations/publishers/snapchat-publisher.service';
import { ThreadsPublisherService } from '@server/services/integrations/publishers/threads-publisher.service';
import { TikTokPublisherService } from '@server/services/integrations/publishers/tiktok-publisher.service';
import { TwitterPublisherService } from '@server/services/integrations/publishers/twitter-publisher.service';
import { WhatsappPublisherService } from '@server/services/integrations/publishers/whatsapp-publisher.service';
import { WordpressPublisherService } from '@server/services/integrations/publishers/wordpress-publisher.service';
import { YouTubePublisherService } from '@server/services/integrations/publishers/youtube-publisher.service';
import { RedditService } from '@server/services/integrations/reddit/services/reddit.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import { ThreadsService } from '@server/services/integrations/threads/services/threads.service';
import { TiktokService } from '@server/services/integrations/tiktok/services/tiktok.service';
import { TikTokAdsService } from '@server/services/integrations/tiktok-ads/services/tiktok-ads.service';
import { TwitterService } from '@server/services/integrations/twitter/services/twitter.service';
import { TwitterResponseMapper } from '@server/services/integrations/twitter/services/twitter-response.mapper';
import { YoutubeAnalyticsService } from '@server/services/integrations/youtube/services/modules/youtube-analytics.service';
import { YoutubeAuthService } from '@server/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeCommentsService } from '@server/services/integrations/youtube/services/modules/youtube-comments.service';
import { YoutubeMetadataService } from '@server/services/integrations/youtube/services/modules/youtube-metadata.service';
import { YoutubeService } from '@server/services/integrations/youtube/services/youtube.service';
import { LifecycleEmailDeliveryService } from '@server/services/lifecycle-emails/lifecycle-email-delivery.service';
import { NotificationsService } from '@server/services/notifications/notifications.service';
import { NotificationPreferenceService } from '@server/services/notifications/workflow-notifications/notification-preference.service';
import { WorkflowNotificationDeliveryService } from '@server/services/notifications/workflow-notifications/workflow-notification-delivery.service';
import { WorkflowNotificationOutboxService } from '@server/services/notifications/workflow-notifications/workflow-notification-outbox.service';
import { WorkflowNotificationQueueService } from '@server/services/notifications/workflow-notifications/workflow-notification-queue.service';
import { PublicClipToolStoreService } from '@server/services/public-clip-tool/public-clip-tool-store.service';
import { QuotaService } from '@server/services/quota/quota.service';
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
import { SignupPrefillService } from '@server/services/signup-prefill/signup-prefill.service';
import { ContentGeoOptimizerHandler } from '@server/services/skill-executor/handlers/content-geo-optimizer.handler';
import { ContentWritingHandler } from '@server/services/skill-executor/handlers/content-writing.handler';
import { ImageGenerationHandler } from '@server/services/skill-executor/handlers/image-generation.handler';
import { TrendDiscoveryHandler } from '@server/services/skill-executor/handlers/trend-discovery.handler';
import { TrendRemixHandler } from '@server/services/skill-executor/handlers/trend-remix.handler';
import { SkillWorkflowService } from '@server/services/skill-executor/skill-executor.service';
import { TaskDecompositionService } from '@server/services/task-orchestration/task-decomposition.service';
import { TaskOrchestratorService } from '@server/services/task-orchestration/task-orchestrator.service';
import { WorkspaceTaskQualityService } from '@server/services/task-orchestration/workspace-task-quality.service';
import { TaskQueueClientService } from '@server/services/task-queue-client/task-queue-client.service';
import { GenerationEventWebhookService } from '@server/services/webhook-client/generation-event-webhook.service';
import { PublishEventWebhookService } from '@server/services/webhook-client/publish-event-webhook.service';
import { WebhookClientService } from '@server/services/webhook-client/webhook-client.service';
import { WebhookDispatchService } from '@server/services/webhook-client/webhook-dispatch.service';
import { WorkflowEventWebhookService } from '@server/services/webhook-client/workflow-event-webhook.service';
import { WhisperService } from '@server/services/whisper/whisper.service';
import { PollUntilService } from '@server/shared/services/poll-until/poll-until.service';
import { SharedService } from '@server/shared/services/shared/shared.service';

const WORKER_DOMAIN_SERVICES = [
  ActivitiesService,
  CredentialsService,
  AdBulkUploadJobsService,
  AdBulkUploadWorkflowService,
  AdCreativeMappingsService,
  AdOptimizationAuditLogsService,
  AdOptimizationConfigsService,
  AdOptimizationRecommendationsService,
  AdPerformanceService,
  AdAutomationWorkflowService,
  AgentCampaignExecutionService,
  AgentCampaignsService,
  AgentOrchestratorService,
  AgentPublishAuditsService,
  AgentStrategiesService,
  AgentStrategyAutopilotService,
  AgentStrategyOpportunitiesService,
  AgentStrategyReportsService,
  AgentStrategyWorkflowRunService,
  AgentStreamPublisherService,
  AgentTurnAcceptanceService,
  AnalyticsProviderCollectionService,
  AnalyticsSocialCollectionService,
  AnalyticsSyncService,
  AnalyticsSyncWorkflowService,
  AnalyticsTwitterCollectionService,
  AnalyticsYouTubeCollectionService,
  ApiKeyHelperService,
  ArticleAnalyticsService,
  ArticlesContentService,
  ArticlesService,
  AssetGateService,
  AttributionService,
  AuthorReplyLoopService,
  AvatarVideoGenerationService,
  BatchGenerationCreditsService,
  BatchGenerationReconcileService,
  BatchGenerationService,
  BillingAccountsService,
  BatchGenerationStreamService,
  BeehiivPublisherService,
  BotActionExecutorService,
  BrandMemorySyncService,
  ByokBillingService,
  ByokProviderFactoryService,
  ByokService,
  CampaignDiscoveryService,
  CampaignExecutorService,
  CampaignWinnerExtractionService,
  ClipGenerationRequestService,
  ClipGenerationService,
  ClipIdentityResolutionService,
  ClipLibraryLinkService,
  ClipProjectsService,
  ContentEngineService,
  ContentGeoOptimizerHandler,
  ContentOrchestrationService,
  ContentWritingHandler,
  StepExecutorService,
  ContentRotationService,
  ContextsService,
  CreativePatternsService,
  CredentialPublishingReadinessService,
  CreditBalanceService,
  CreditReservationService,
  CreditTransactionsService,
  CreditsUtilsService,
  TransactionUtil,
  CustomerInstanceResolverService,
  DmCampaignExecutorService,
  ElevenLabsService,
  EmailDigestService,
  ExternalVoiceCatalogService,
  FacebookPublisherService,
  FacebookService,
  FalService,
  FanvuePublisherService,
  FilesClientService,
  FleetService,
  GenerationEventWebhookService,
  GhostPublisherService,
  GoogleAdsService,
  HeygenAvatarProvider,
  HeygenPollQueueService,
  HiggsFieldService,
  HighlightRewriteService,
  HookClipApprovalService,
  IngredientGenerationCancellationService,
  IngredientsService,
  ImageGenerationHandler,
  InsightsService,
  InstagramPublisherService,
  InstagramService,
  KlingAIService,
  KnowledgeSourceIngestService,
  KnowledgeSourceService,
  LeonardoAIService,
  LifecycleEmailDeliveryService,
  LinkedInPublisherService,
  LinkedInService,
  ManagedInferenceClientService,
  MastodonPublisherService,
  MastodonService,
  MetaAdsService,
  MetadataService,
  ModelRegistrationService,
  ModelsService,
  NotificationPreferenceService,
  NotificationsService,
  OptimizationCycleService,
  OrganizationSettingsService,
  OrganizationsService,
  OutreachCampaignsService,
  PerformanceSummaryService,
  PinterestPublisherService,
  PinterestService,
  PollUntilService,
  PostAnalyticsCollectionStateService,
  PostAnalyticsService,
  PostRepurposeService,
  PostGroupsService,
  PostsService,
  PublicClipToolStoreService,
  RssSourcesService,
  PublishEventWebhookService,
  PublisherFactoryService,
  QueueService,
  QuotaService,
  RateLimitService,
  RawCutClipCompletionService,
  RawCutClipService,
  RedditPublisherService,
  RedditService,
  ReplicateService,
  ReplyBotConfigsService,
  ReplyBotOrchestratorService,
  ReplyCandidatePrefilterService,
  ReplyGenerationService,
  ReplyInboundProcessorService,
  ReplyPostWatchService,
  ReviewablePostsService,
  SharedService,
  ShopifyPublisherService,
  SignupPrefillService,
  SkillWorkflowService,
  SnapchatPublisherService,
  SocialInboxService,
  SocialMonitorService,
  SocialReplyCampaignDispatchService,
  StreaksService,
  SystemWorkflowCatalogService,
  SystemWorkflowRunnerService,
  TaskDecompositionService,
  TaskOrchestratorService,
  TaskQueueClientService,
  TasksService,
  TelegramDistributionService,
  ThreadsPublisherService,
  ThreadsService,
  TikTokAdsService,
  TikTokPublisherService,
  TiktokService,
  TrendPreferencesService,
  TrendDiscoveryHandler,
  TrendRemixHandler,
  TrendReferenceCorpusService,
  TrendsService,
  TriggerEvaluatorService,
  TwitterPublisherService,
  TwitterResponseMapper,
  TwitterService,
  VariationGroupScoringService,
  VideoGenerationLineageService,
  VoiceGenerationService,
  VoicesService,
  WebhookClientService,
  WebhookDispatchService,
  WebhooksService,
  WhatsappPublisherService,
  WhisperService,
  WinnerPromotionWorkflowService,
  WordpressPublisherService,
  WorkflowEngineAdapterService,
  WorkflowEventWebhookService,
  WorkflowExecutionAuthorizationService,
  WorkflowExecutionQueueService,
  WorkflowExecutionsService,
  WorkflowExecutorService,
  WorkflowFormatConverterService,
  WorkflowGenerationService,
  WorkflowNotificationDeliveryService,
  WorkflowNotificationOutboxService,
  WorkflowNotificationQueueService,
  WorkflowRunControlService,
  WorkflowSchedulerService,
  WorkflowTemplateSeederService,
  WorkflowWebhookService,
  WorkspaceTaskQualityService,
  XActivitySubscriptionService,
  XActivityWebhookService,
  YouTubePublisherService,
  YoutubeAnalyticsService,
  YoutubeAuthService,
  YoutubeCommentsService,
  YoutubeMetadataService,
  YoutubeService,
] as const;

@Module({
  exports: [
    ...WORKER_DOMAIN_SERVICES,
    CacheModule,
    SYSTEM_WORKFLOW_CATALOG,
    SYSTEM_WORKFLOW_RUNNER,
    WORKFLOW_ENGINE_ADAPTER,
    WORKFLOW_EXECUTOR,
  ],
  imports: [CacheModule, ConfigModule, HttpModule, LoggerModule, PrismaModule],
  providers: [
    ...WORKER_DOMAIN_SERVICES,
    {
      provide: SYSTEM_WORKFLOW_CATALOG,
      useExisting: SystemWorkflowCatalogService,
    },
    {
      provide: SYSTEM_WORKFLOW_RUNNER,
      useExisting: SystemWorkflowRunnerService,
    },
    {
      provide: WORKFLOW_ENGINE_ADAPTER,
      useExisting: WorkflowEngineAdapterService,
    },
    {
      provide: WORKFLOW_EXECUTOR,
      useExisting: WorkflowExecutorService,
    },
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
    { provide: SERVER_TOKENS.byok, useExisting: ByokService },
    { provide: SERVER_TOKENS.credentials, useExisting: CredentialsService },
    {
      provide: SERVER_TOKENS.publisherFactory,
      useExisting: PublisherFactoryService,
    },
  ],
})
export class WorkersDomainModule {}
