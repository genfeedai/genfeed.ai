import { AnalyticsProviderCollectionService } from '@api/analytics/services/analytics-provider-collection.service';
import { AnalyticsSocialCollectionService } from '@api/analytics/services/analytics-social-collection.service';
import { AnalyticsTwitterCollectionService } from '@api/analytics/services/analytics-twitter-collection.service';
import { AnalyticsYouTubeCollectionService } from '@api/analytics/services/analytics-youtube-collection.service';
import { PostAnalyticsCollectionStateService } from '@api/analytics/services/post-analytics-collection-state.service';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AdBulkUploadJobsService } from '@api/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { AdCreativeMappingsService } from '@api/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import { AdOptimizationAuditLogsService } from '@api/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import { AdOptimizationConfigsService } from '@api/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import { AdOptimizationRecommendationsService } from '@api/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service';
import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { AgentCampaignExecutionService } from '@api/collections/agent-campaigns/services/agent-campaign-execution.service';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { AgentPublishAuditsService } from '@api/collections/agent-publish-audits/services/agent-publish-audits.service';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentStrategyAutopilotService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.service';
import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import { AgentStrategyReportsService } from '@api/collections/agent-strategies/services/agent-strategy-reports.service';
import { AgentStrategyWorkflowRunService } from '@api/collections/agent-strategies/services/agent-strategy-workflow-run.service';
import { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { ArticlesContentService } from '@api/collections/articles/services/articles-content.service';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipGenerationService } from '@api/collections/clip-projects/services/clip-generation.service';
import { ClipGenerationRequestService } from '@api/collections/clip-projects/services/clip-generation-request.service';
import { ClipIdentityResolutionService } from '@api/collections/clip-projects/services/clip-identity-resolution.service';
import { ClipLibraryLinkService } from '@api/collections/clip-projects/services/clip-library-link.service';
import { HighlightRewriteService } from '@api/collections/clip-projects/services/highlight-rewrite.service';
import { HookClipApprovalService } from '@api/collections/clip-projects/services/hook-clip-approval.service';
import { RawCutClipService } from '@api/collections/clip-projects/services/raw-cut-clip.service';
import { RawCutClipCompletionService } from '@api/collections/clip-projects/services/raw-cut-clip-completion.service';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { AttributionService } from '@api/collections/content-performance/services/attribution.service';
import { EmailDigestService } from '@api/collections/content-performance/services/email-digest.service';
import { OptimizationCycleService } from '@api/collections/content-performance/services/optimization-cycle.service';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { VariationGroupScoringService } from '@api/collections/content-performance/services/variation-group-scoring.service';
import { WinnerPromotionWorkflowService } from '@api/collections/content-performance/services/winner-promotion-workflow.service';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { KnowledgeSourceService } from '@api/collections/contexts/services/knowledge-source.service';
import { KnowledgeSourceIngestService } from '@api/collections/contexts/services/knowledge-source-ingest.service';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { VideoGenerationLineageService } from '@api/collections/credits/services/video-generation-lineage.service';
import { CustomerInstanceResolverService } from '@api/collections/customer-instances/customer-instance-resolver.service';
import { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { InsightsService } from '@api/collections/insights/services/insights.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { AssetGateService } from '@api/collections/organization-settings/services/asset-gate.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostRepurposeService } from '@api/collections/posts/services/post-repurpose.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ReviewablePostsService } from '@api/collections/posts/services/reviewable-posts.service';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { RssSourcesService } from '@api/collections/rss-sources/services/rss-sources.service';
import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import { SocialReplyCampaignDispatchService } from '@api/collections/social-inbox/services/social-reply-campaign-dispatch.service';
import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { TrendPreferencesService } from '@api/collections/trends/services/trend-preferences.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { VoiceGenerationService } from '@api/collections/voices/services/voice-generation.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { AdAutomationWorkflowService } from '@api/collections/workflows/services/ad-automation-workflow.service';
import { AdBulkUploadWorkflowService } from '@api/collections/workflows/services/ad-bulk-upload-workflow.service';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { SystemWorkflowCatalogService } from '@api/collections/workflows/services/system-workflow-catalog.service';
import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutionAuthorizationService } from '@api/collections/workflows/services/workflow-execution-authorization.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowFormatConverterService } from '@api/collections/workflows/services/workflow-format-converter.service';
import { WorkflowGenerationService } from '@api/collections/workflows/services/workflow-generation.service';
import { WorkflowRunControlService } from '@api/collections/workflows/services/workflow-run-control.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowTemplateSeederService } from '@api/collections/workflows/services/workflow-template-seeder.service';
import { WorkflowWebhookService } from '@api/collections/workflows/services/workflow-webhook.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  SYSTEM_WORKFLOW_CATALOG,
  SYSTEM_WORKFLOW_RUNNER,
  WORKFLOW_ENGINE_ADAPTER,
  WORKFLOW_EXECUTOR,
} from '@api/collections/workflows/workflows.tokens';
import { AccountAnalyticsSnapshotService } from '@api/endpoints/analytics/account-analytics-snapshot.service';
import { ManagedInferenceClientService } from '@api/endpoints/v1/managed-inference/managed-inference-client.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { QueueService } from '@api/queues/core/queue.service';
import { HeygenPollQueueService } from '@api/queues/heygen-poll/heygen-poll-queue.service';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { CampaignWinnerExtractionService } from '@api/services/agent-campaign/campaign-winner-extraction.service';
import { ContentEngineService } from '@api/services/agent-campaign/content-engine.service';
import { ContentRotationService } from '@api/services/agent-campaign/content-rotation.service';
import { TriggerEvaluatorService } from '@api/services/agent-campaign/trigger-evaluator.service';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { AgentTurnAcceptanceService } from '@api/services/agent-orchestrator/agent-turn-acceptance.service';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { HeygenAvatarProvider } from '@api/services/avatar-video/providers/heygen-avatar.provider';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { BatchGenerationCreditsService } from '@api/services/batch-generation/batch-generation-credits.service';
import { BatchGenerationReconcileService } from '@api/services/batch-generation/batch-generation-reconcile.service';
import { BatchGenerationStreamService } from '@api/services/batch-generation/batch-generation-stream.service';
import { BrandMemorySyncService } from '@api/services/brand-memory/brand-memory-sync.service';
import { ByokService } from '@api/services/byok/byok.service';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { ByokBillingService } from '@api/services/byok-billing/byok-billing.service';
import { CacheModule } from '@api/services/cache/cache.module';
import { CampaignDiscoveryService } from '@api/services/campaign/campaign-discovery.service';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import { DmCampaignExecutorService } from '@api/services/campaign/dm-campaign-executor.service';
import { ContentOrchestrationService } from '@api/services/content-orchestration/content-orchestration.service';
import { StepExecutorService } from '@api/services/content-orchestration/step-executor.service';
import { TelegramDistributionService } from '@api/services/distribution/telegram/telegram-distribution.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { FalService } from '@api/services/integrations/fal/services/fal.service';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { KlingAIService } from '@api/services/integrations/klingai/services/klingai.service';
import { LeonardoAIService } from '@api/services/integrations/leonardoai/services/leonardoai.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { ManagedInferenceRuntimeService } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.service';
import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { BeehiivPublisherService } from '@api/services/integrations/publishers/beehiiv-publisher.service';
import { FacebookPublisherService } from '@api/services/integrations/publishers/facebook-publisher.service';
import { FanvuePublisherService } from '@api/services/integrations/publishers/fanvue-publisher.service';
import { GhostPublisherService } from '@api/services/integrations/publishers/ghost-publisher.service';
import { InstagramPublisherService } from '@api/services/integrations/publishers/instagram-publisher.service';
import { LinkedInPublisherService } from '@api/services/integrations/publishers/linkedin-publisher.service';
import { MastodonPublisherService } from '@api/services/integrations/publishers/mastodon-publisher.service';
import { PinterestPublisherService } from '@api/services/integrations/publishers/pinterest-publisher.service';
import { PublisherFactoryService } from '@api/services/integrations/publishers/publisher-factory.service';
import { RedditPublisherService } from '@api/services/integrations/publishers/reddit-publisher.service';
import { ShopifyPublisherService } from '@api/services/integrations/publishers/shopify-publisher.service';
import { SnapchatPublisherService } from '@api/services/integrations/publishers/snapchat-publisher.service';
import { ThreadsPublisherService } from '@api/services/integrations/publishers/threads-publisher.service';
import { TikTokPublisherService } from '@api/services/integrations/publishers/tiktok-publisher.service';
import { TwitterPublisherService } from '@api/services/integrations/publishers/twitter-publisher.service';
import { WhatsappPublisherService } from '@api/services/integrations/publishers/whatsapp-publisher.service';
import { WordpressPublisherService } from '@api/services/integrations/publishers/wordpress-publisher.service';
import { YouTubePublisherService } from '@api/services/integrations/publishers/youtube-publisher.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TikTokAdsService } from '@api/services/integrations/tiktok-ads/services/tiktok-ads.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { TwitterResponseMapper } from '@api/services/integrations/twitter/services/twitter-response.mapper';
import { YoutubeAnalyticsService } from '@api/services/integrations/youtube/services/modules/youtube-analytics.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeCommentsService } from '@api/services/integrations/youtube/services/modules/youtube-comments.service';
import { YoutubeMetadataService } from '@api/services/integrations/youtube/services/modules/youtube-metadata.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { LifecycleEmailDeliveryService } from '@api/services/lifecycle-emails/lifecycle-email-delivery.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { NotificationPreferenceService } from '@api/services/notifications/workflow-notifications/notification-preference.service';
import { WorkflowNotificationDeliveryService } from '@api/services/notifications/workflow-notifications/workflow-notification-delivery.service';
import { WorkflowNotificationOutboxService } from '@api/services/notifications/workflow-notifications/workflow-notification-outbox.service';
import { WorkflowNotificationQueueService } from '@api/services/notifications/workflow-notifications/workflow-notification-queue.service';
import { PublicClipToolStoreService } from '@api/services/public-clip-tool/public-clip-tool-store.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { AuthorReplyLoopService } from '@api/services/reply-bot/author-reply-loop.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { RateLimitService } from '@api/services/reply-bot/rate-limit.service';
import { ReplyBotOrchestratorService } from '@api/services/reply-bot/reply-bot-orchestrator.service';
import { ReplyCandidatePrefilterService } from '@api/services/reply-bot/reply-candidate-prefilter.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import { ReplyInboundProcessorService } from '@api/services/reply-bot/reply-inbound-processor.service';
import { ReplyPostWatchService } from '@api/services/reply-bot/reply-post-watch.service';
import { SocialMonitorService } from '@api/services/reply-bot/social-monitor.service';
import { XActivitySubscriptionService } from '@api/services/reply-bot/x-activity-subscription.service';
import { XActivityWebhookService } from '@api/services/reply-bot/x-activity-webhook.service';
import { SignupPrefillService } from '@api/services/signup-prefill/signup-prefill.service';
import { ContentGeoOptimizerHandler } from '@api/services/skill-executor/handlers/content-geo-optimizer.handler';
import { ContentWritingHandler } from '@api/services/skill-executor/handlers/content-writing.handler';
import { ImageGenerationHandler } from '@api/services/skill-executor/handlers/image-generation.handler';
import { TrendDiscoveryHandler } from '@api/services/skill-executor/handlers/trend-discovery.handler';
import { TrendRemixHandler } from '@api/services/skill-executor/handlers/trend-remix.handler';
import { SkillWorkflowService } from '@api/services/skill-executor/skill-executor.service';
import { TaskDecompositionService } from '@api/services/task-orchestration/task-decomposition.service';
import { TaskOrchestratorService } from '@api/services/task-orchestration/task-orchestrator.service';
import { WorkspaceTaskQualityService } from '@api/services/task-orchestration/workspace-task-quality.service';
import { TaskQueueClientService } from '@api/services/task-queue-client/task-queue-client.service';
import { GenerationEventWebhookService } from '@api/services/webhook-client/generation-event-webhook.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/publish-event-webhook.service';
import { WebhookClientService } from '@api/services/webhook-client/webhook-client.service';
import { WebhookDispatchService } from '@api/services/webhook-client/webhook-dispatch.service';
import { WorkflowEventWebhookService } from '@api/services/webhook-client/workflow-event-webhook.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { PrismaService } from '@libs/prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

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
  AccountAnalyticsSnapshotService,
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
  ManagedInferenceRuntimeService,
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
