import { AgentCampaignsModule } from '@api/collections/agent-campaigns/agent-campaigns.module';
import { AgentGoalsModule } from '@api/collections/agent-goals/agent-goals.module';
import { AgentMemoriesModule } from '@api/collections/agent-memories/agent-memories.module';
import { AgentMessagesModule } from '@api/collections/agent-messages/agent-messages.module';
import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { AgentStrategiesModule } from '@api/collections/agent-strategies/agent-strategies.module';
import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { BotsModule } from '@api/collections/bots/bots.module';
import { BotsService } from '@api/collections/bots/services/bots.service';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { BrandInterviewModule } from '@api/collections/brands/brand-interview/brand-interview.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { DashboardLayoutsModule } from '@api/collections/dashboard-layouts/dashboard-layouts.module';
import { ImagesModule } from '@api/collections/images/images.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { OutreachCampaignsModule } from '@api/collections/outreach-campaigns/outreach-campaigns.module';
import { PostGroupsModule } from '@api/collections/post-groups/post-groups.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { SocialInboxModule } from '@api/collections/social-inbox/social-inbox.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { UsersModule } from '@api/collections/users/users.module';
import { VoicesModule } from '@api/collections/voices/voices.module';
import { VotesModule } from '@api/collections/votes/votes.module';
import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { AdsResearchModule } from '@api/endpoints/ads-research/ads-research.module';
import { AiActionsModule } from '@api/endpoints/ai-actions/ai-actions.module';
import { AnalyticsModule } from '@api/endpoints/analytics/analytics.module';
import { MarketplaceIntegrationModule } from '@api/marketplace-integration/marketplace-integration.module';
import { AgentMessageBusModule } from '@api/services/agent-campaign/agent-message-bus.module';
import { AgentContextAssemblyModule } from '@api/services/agent-context-assembly/agent-context-assembly.module';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentOrchestratorController } from '@api/services/agent-orchestrator/agent-orchestrator.controller';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AgentOrchestratorBatchService } from '@api/services/agent-orchestrator/agent-orchestrator-batch.service';
import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { AgentOrchestratorPlanModeService } from '@api/services/agent-orchestrator/agent-orchestrator-plan-mode.service';
import { AgentOrchestratorRecurringTaskService } from '@api/services/agent-orchestrator/agent-orchestrator-recurring-task.service';
import { AgentOrchestratorStreamLoopService } from '@api/services/agent-orchestrator/agent-orchestrator-stream-loop.service';
import { AgentOrchestratorUiActionService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import { AgentStreamPublisherModule } from '@api/services/agent-orchestrator/agent-stream-publisher.module';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import { AgentToolsController } from '@api/services/agent-orchestrator/agent-tools.controller';
import { AgentTurnRoundRunnerService } from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
import { AgentAdsResearchToolHandler } from '@api/services/agent-orchestrator/tools/agent-ads-research-tool-handler.service';
import { AgentAnalyticsToolHandler } from '@api/services/agent-orchestrator/tools/agent-analytics-tool-handler.service';
import { AgentBrandContentToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-content-tool-handler.service';
import { AgentBrandInterviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-interview-tool-handler.service';
import { AgentCampaignToolHandler } from '@api/services/agent-orchestrator/tools/agent-campaign-tool-handler.service';
import { AgentConnectionToolHandler } from '@api/services/agent-orchestrator/tools/agent-connection-tool-handler.service';
import { AgentDashboardToolHandler } from '@api/services/agent-orchestrator/tools/agent-dashboard-tool-handler.service';
import { AgentInstagramInspirationToolHandler } from '@api/services/agent-orchestrator/tools/agent-instagram-inspiration-tool-handler.service';
import { AgentLivestreamToolHandler } from '@api/services/agent-orchestrator/tools/agent-livestream-tool-handler.service';
import { AgentMediaGenerationToolHandler } from '@api/services/agent-orchestrator/tools/agent-media-generation-tool-handler.service';
import { AgentMemoryGoalsToolHandler } from '@api/services/agent-orchestrator/tools/agent-memory-goals-tool-handler.service';
import { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import { AgentPrepareToolHandler } from '@api/services/agent-orchestrator/tools/agent-prepare-tool-handler.service';
import { AgentProactiveToolHandler } from '@api/services/agent-orchestrator/tools/agent-proactive-tool-handler.service';
import { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import { AgentQualityToolHandler } from '@api/services/agent-orchestrator/tools/agent-quality-tool-handler.service';
import { AgentReviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-review-tool-handler.service';
import { AgentRouteRewriteService } from '@api/services/agent-orchestrator/tools/agent-route-rewrite.service';
import { AgentSpawnToolHandler } from '@api/services/agent-orchestrator/tools/agent-spawn-tool-handler.service';
import { AgentToolCatalogHandler } from '@api/services/agent-orchestrator/tools/agent-tool-catalog-handler.service';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentToolInternalApiService } from '@api/services/agent-orchestrator/tools/agent-tool-internal-api.service';
import { AgentTrendsToolHandler } from '@api/services/agent-orchestrator/tools/agent-trends-tool-handler.service';
import { AgentWorkflowToolHandler } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-handler.service';
import { AgentWorkspaceToolHandler } from '@api/services/agent-orchestrator/tools/agent-workspace-tool-handler.service';
import { AgentSpawnModule } from '@api/services/agent-spawn/agent-spawn.module';
import { AgentThreadingModule } from '@api/services/agent-threading/agent-threading.module';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { ContentQualityModule } from '@api/services/content-quality/content-quality.module';
import { InstagramInspirationModule } from '@api/services/instagram-inspiration/instagram-inspiration.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { SeoModule } from '@api/services/seo/seo.module';
import { SkillRuntimeModule } from '@api/services/skill-runtime/skill-runtime.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [AgentOrchestratorController, AgentToolsController],
  exports: [AgentOrchestratorService],
  imports: [
    forwardRef(() => AgentCampaignsModule),
    forwardRef(() => AgentGoalsModule),
    forwardRef(() => AgentStrategiesModule),
    forwardRef(() => AgentContextAssemblyModule),
    forwardRef(() => AgentThreadsModule),
    forwardRef(() => AgentMemoriesModule),
    forwardRef(() => AgentMessageBusModule),
    forwardRef(() => AgentMessagesModule),
    forwardRef(() => AgentThreadingModule),
    forwardRef(() => AgentRunsModule),
    forwardRef(() => AiActionsModule),
    AdsResearchModule,
    forwardRef(() => AgentStreamPublisherModule),
    forwardRef(() => AnalyticsModule),
    forwardRef(() => BatchGenerationModule),
    forwardRef(() => BrandInterviewModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => BotsModule),
    forwardRef(() => OutreachCampaignsModule),
    forwardRef(() => ConfigModule),
    forwardRef(() => ContentIntelligenceModule),
    forwardRef(() => ContentQualityModule),
    forwardRef(() => CredentialsCoreModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => DashboardLayoutsModule),
    forwardRef(() => HttpModule),
    forwardRef(() => ImagesModule),
    forwardRef(() => IngredientsModule),
    InstagramInspirationModule,
    forwardRef(() => LoggerModule),
    forwardRef(() => LlmDispatcherModule),
    forwardRef(() => MarketplaceIntegrationModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => PostGroupsModule),
    forwardRef(() => PostsModule),
    forwardRef(() => SettingsModule),
    forwardRef(() => SocialInboxModule),
    forwardRef(() => TrendsModule),
    forwardRef(() => UsersModule),
    forwardRef(() => VoicesModule),
    forwardRef(() => VotesModule),
    forwardRef(() => WorkflowExecutionsModule),
    forwardRef(() => WorkflowsModule),
    forwardRef(() => AgentSpawnModule),
    SeoModule,
    forwardRef(() => SkillRuntimeModule),
  ],
  providers: [
    AgentCompletionCardBuilderService,
    AgentAdsResearchToolHandler,
    AgentAnalyticsToolHandler,
    AgentMediaGenerationToolHandler,
    AgentOnboardingToolHandler,
    AgentToolInternalApiService,
    AgentWorkflowToolHandler,
    AgentBrandContentToolHandler,
    AgentBrandInterviewToolHandler,
    AgentPrepareToolHandler,
    AgentSpawnToolHandler,
    AgentToolCatalogHandler,
    AgentCampaignToolHandler,
    AgentLivestreamToolHandler,
    AgentConnectionToolHandler,
    AgentDashboardToolHandler,
    AgentInstagramInspirationToolHandler,
    AgentMemoryGoalsToolHandler,
    AgentProactiveToolHandler,
    AgentPublishToolHandler,
    AgentQualityToolHandler,
    AgentReviewToolHandler,
    AgentTrendsToolHandler,
    AgentWorkspaceToolHandler,
    AgentOrchestratorBatchService,
    AgentOrchestratorContextService,
    AgentOrchestratorPlanModeService,
    AgentOrchestratorRecurringTaskService,
    AgentOrchestratorService,
    AgentOrchestratorStreamLoopService,
    AgentOrchestratorUiActionService,
    AgentRouteRewriteService,
    AgentStreamEffectsService,
    AgentThreadEventRecorderService,
    AgentToolExecutorService,
    AgentTurnRoundRunnerService,
    {
      provide: 'AGENT_BRANDS_SERVICE',
      useExisting: BrandsService,
    },
    {
      provide: 'AGENT_BOTS_SERVICE',
      useExisting: BotsService,
    },
    {
      provide: 'AGENT_BOTS_LIVESTREAM_SERVICE',
      useExisting: BotsLivestreamService,
    },
  ],
})
export class AgentOrchestratorModule {}
