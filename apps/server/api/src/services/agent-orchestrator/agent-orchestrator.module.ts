import { AgentCampaignsModule } from '@api/collections/agent-campaigns/agent-campaigns.module';
import { AgentGoalsModule } from '@api/collections/agent-goals/agent-goals.module';
import { AgentMemoriesModule } from '@api/collections/agent-memories/agent-memories.module';
import { AgentMessagesModule } from '@api/collections/agent-messages/agent-messages.module';
import { AgentPublishAuditsModule } from '@api/collections/agent-publish-audits/agent-publish-audits.module';
import { AgentStrategiesModule } from '@api/collections/agent-strategies/agent-strategies.module';
import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { AgentTransfersService } from '@api/collections/agent-transfers/services/agent-transfers.service';
import { ArticlesModule } from '@api/collections/articles/articles.module';
import { BotsModule } from '@api/collections/bots/bots.module';
import { BotsService } from '@api/collections/bots/services/bots.service';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { BrandInterviewModule } from '@api/collections/brands/brand-interview/brand-interview.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { DashboardLayoutsModule } from '@api/collections/dashboard-layouts/dashboard-layouts.module';
import { ImagesCoreModule } from '@api/collections/images/images-core.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { McpApprovalsModule } from '@api/collections/mcp-approvals/mcp-approvals.module';
import { NewslettersModule } from '@api/collections/newsletters/newsletters.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsCoreModule } from '@api/collections/organizations/organizations-core.module';
import { OutreachCampaignsModule } from '@api/collections/outreach-campaigns/outreach-campaigns.module';
import { PersonasCoreModule } from '@api/collections/personas/personas-core.module';
import { PostGroupsModule } from '@api/collections/post-groups/post-groups.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { SocialInboxModule } from '@api/collections/social-inbox/social-inbox.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { UsersModule } from '@api/collections/users/users.module';
import { VideosCoreModule } from '@api/collections/videos/videos-core.module';
import { VoicesModule } from '@api/collections/voices/voices.module';
import { VotesModule } from '@api/collections/votes/votes.module';
import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { AdsResearchModule } from '@api/endpoints/ads-research/ads-research.module';
import { AiActionsModule } from '@api/endpoints/ai-actions/ai-actions.module';
import { AnalyticsModule } from '@api/endpoints/analytics/analytics.module';
import { AgentArtifactReferenceService, SERVER_TOKENS } from '@api/index';
import { MarketplaceIntegrationModule } from '@api/marketplace-integration/marketplace-integration.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { AgentMessageBusModule } from '@api/services/agent-campaign/agent-message-bus.module';
import { AgentContextAssemblyModule } from '@api/services/agent-context-assembly/agent-context-assembly.module';
import { AgentGenerationGatewayModule } from '@api/services/agent-generation-gateway/agent-generation-gateway.module';
import { AgentChatModelRegistryModule } from '@api/services/agent-orchestrator/agent-chat-model-registry.module';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentOrchestratorController } from '@api/services/agent-orchestrator/agent-orchestrator.controller';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AgentOrchestratorBatchService } from '@api/services/agent-orchestrator/agent-orchestrator-batch.service';
import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { AgentOrchestratorPlanModeService } from '@api/services/agent-orchestrator/agent-orchestrator-plan-mode.service';
import { AgentOrchestratorRecurringTaskService } from '@api/services/agent-orchestrator/agent-orchestrator-recurring-task.service';
import { AgentOrchestratorStreamLoopService } from '@api/services/agent-orchestrator/agent-orchestrator-stream-loop.service';
import { AgentOrchestratorSyncLoopService } from '@api/services/agent-orchestrator/agent-orchestrator-sync-loop.service';
import { AgentOrchestratorUiActionService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.service';
import { AgentOrchestratorUiActionBrandIdentityService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-brand-identity.service';
import { AgentOrchestratorUiActionConfirmedToolService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-confirmed-tool.service';
import { AgentOrchestratorUiActionFinalizerService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-finalizer.service';
import { AgentOrchestratorUiActionPlanService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-plan.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import { AgentStreamPublisherModule } from '@api/services/agent-orchestrator/agent-stream-publisher.module';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import { AgentToolsController } from '@api/services/agent-orchestrator/agent-tools.controller';
import { AgentTurnAcceptanceService } from '@api/services/agent-orchestrator/agent-turn-acceptance.service';
import { AgentTurnRoundRunnerService } from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
import { AgentTurnWorkflowExecutionService } from '@api/services/agent-orchestrator/agent-turn-workflow-execution.service';
import { AgentAdsResearchToolHandler } from '@api/services/agent-orchestrator/tools/agent-ads-research-tool-handler.service';
import { AgentAnalyticsToolHandler } from '@api/services/agent-orchestrator/tools/agent-analytics-tool-handler.service';
import { AgentBrandContentToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-content-tool-handler.service';
import { AgentBrandInterviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-interview-tool-handler.service';
import { AgentCampaignToolHandler } from '@api/services/agent-orchestrator/tools/agent-campaign-tool-handler.service';
import { AgentConnectionToolHandler } from '@api/services/agent-orchestrator/tools/agent-connection-tool-handler.service';
import { AgentDashboardToolHandler } from '@api/services/agent-orchestrator/tools/agent-dashboard-tool-handler.service';
import { AgentInstagramInspirationToolHandler } from '@api/services/agent-orchestrator/tools/agent-instagram-inspiration-tool-handler.service';
import { AgentLivestreamToolHandler } from '@api/services/agent-orchestrator/tools/agent-livestream-tool-handler.service';
import { AgentMediaAssetGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-asset-generation.service';
import { AgentMediaBatchGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-batch-generation.service';
import { AgentMediaGenerationToolHandler } from '@api/services/agent-orchestrator/tools/agent-media-generation-tool-handler.service';
import { AgentMediaTextGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-text-generation.service';
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
import { AgentToolConfirmationService } from '@api/services/agent-orchestrator/tools/agent-tool-confirmation.service';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentTransferToolHandler } from '@api/services/agent-orchestrator/tools/agent-transfer-tool-handler.service';
import { AgentTrendsToolHandler } from '@api/services/agent-orchestrator/tools/agent-trends-tool-handler.service';
import { AgentWorkflowToolCreateService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-create.service';
import { AgentWorkflowToolExecuteService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-execute.service';
import { AgentWorkflowToolHandler } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-handler.service';
import { AgentWorkflowToolInstallService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-install.service';
import { AgentWorkspaceToolHandler } from '@api/services/agent-orchestrator/tools/agent-workspace-tool-handler.service';
import { AgentXActionsToolHandler } from '@api/services/agent-orchestrator/tools/agent-x-actions-tool-handler.service';
import { AgentSpawnModule } from '@api/services/agent-spawn/agent-spawn.module';
import { AgentThreadingCoreModule } from '@api/services/agent-threading/agent-threading-core.module';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { CacheService } from '@api/services/cache/cache.service';
import { ContentQualityModule } from '@api/services/content-quality/content-quality.module';
import { InstagramInspirationModule } from '@api/services/instagram-inspiration/instagram-inspiration.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { SeoModule } from '@api/services/seo/seo.module';
import { SkillRuntimeModule } from '@api/services/skill-runtime/skill-runtime.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AgentOrchestratorController, AgentToolsController],
  exports: [AgentOrchestratorService, AgentTurnAcceptanceService],
  imports: [
    AgentCampaignsModule,
    AgentGoalsModule,
    AgentStrategiesModule,
    AgentContextAssemblyModule,
    AgentThreadsModule,
    AgentMemoriesModule,
    AgentPublishAuditsModule,
    AgentMessageBusModule,
    AgentMessagesModule,
    AgentThreadingCoreModule,
    AiActionsModule,
    AdsResearchModule,
    AgentStreamPublisherModule,
    AgentGenerationGatewayModule,
    AnalyticsModule,
    ArticlesModule,
    BatchGenerationModule,
    BrandInterviewModule,
    BrandsCoreModule,
    BotsModule,
    OutreachCampaignsModule,
    ConfigModule,
    ContentIntelligenceModule,
    ContentQualityModule,
    CredentialsCoreModule,
    CreditsModule,
    DashboardLayoutsModule,
    ImagesCoreModule,
    IngredientsModule,
    InstagramInspirationModule,
    LoggerModule,
    LlmDispatcherModule,
    MarketplaceIntegrationModule,
    McpApprovalsModule,
    NewslettersModule,
    OrganizationSettingsModule,
    OrganizationsCoreModule,
    PersonasCoreModule,
    PostGroupsModule,
    PostsModule,
    QueuesModule,
    SettingsModule,
    SocialInboxModule,
    TrendsModule,
    UsersModule,
    VideosCoreModule,
    VoicesModule,
    VotesModule,
    WorkflowExecutionsModule,
    WorkflowsModule,
    AgentSpawnModule,
    AgentChatModelRegistryModule,
    SeoModule,
    SkillRuntimeModule,
  ],
  providers: [
    AgentCompletionCardBuilderService,
    AgentAdsResearchToolHandler,
    AgentAnalyticsToolHandler,
    AgentMediaAssetGenerationService,
    AgentMediaBatchGenerationService,
    AgentMediaGenerationToolHandler,
    AgentMediaTextGenerationService,
    AgentOnboardingToolHandler,
    AgentTransferToolHandler,
    AgentWorkflowToolCreateService,
    AgentWorkflowToolExecuteService,
    AgentWorkflowToolHandler,
    AgentWorkflowToolInstallService,
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
    AgentXActionsToolHandler,
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
    AgentOrchestratorSyncLoopService,
    AgentOrchestratorUiActionBrandIdentityService,
    AgentOrchestratorUiActionConfirmedToolService,
    AgentOrchestratorUiActionFinalizerService,
    AgentOrchestratorUiActionPlanService,
    AgentOrchestratorUiActionService,
    AgentRouteRewriteService,
    AgentStreamEffectsService,
    AgentThreadEventRecorderService,
    AgentTurnAcceptanceService,
    AgentToolExecutorService,
    {
      inject: [LoggerService, CacheService],
      provide: AgentToolConfirmationService,
      useFactory: (loggerService: LoggerService, cacheService: CacheService) =>
        new AgentToolConfirmationService(loggerService, cacheService),
    },
    AgentTurnRoundRunnerService,
    AgentTurnWorkflowExecutionService,
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
    // AgentTransfersService lives in the @api tier and its own module already
    // imports AgentOrchestratorModule for AgentTurnAcceptanceService, so
    // importing AgentTransfersModule here would form a cycle. It is a
    // stateless service, so it is duplicate-provided in this branch of the
    // module graph instead — the same pattern already used for
    // AgentTurnAcceptanceService across agent-orchestrator.module.ts and
    // workers-domain.module.ts.
    AgentArtifactReferenceService,
    AgentTransfersService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
    {
      provide: 'AGENT_TRANSFERS_SERVICE',
      useExisting: AgentTransfersService,
    },
  ],
})
export class AgentOrchestratorModule {}
