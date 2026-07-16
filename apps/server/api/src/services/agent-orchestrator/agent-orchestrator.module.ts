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
import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { AiActionsModule } from '@api/endpoints/ai-actions/ai-actions.module';
import { AnalyticsModule } from '@api/endpoints/analytics/analytics.module';
import { MarketplaceIntegrationModule } from '@api/marketplace-integration/marketplace-integration.module';
import { AgentMessageBusModule } from '@api/services/agent-campaign/agent-message-bus.module';
import { AgentContextAssemblyModule } from '@api/services/agent-context-assembly/agent-context-assembly.module';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentOrchestratorController } from '@api/services/agent-orchestrator/agent-orchestrator.controller';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import { AgentStreamPublisherModule } from '@api/services/agent-orchestrator/agent-stream-publisher.module';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import { AgentToolsController } from '@api/services/agent-orchestrator/agent-tools.controller';
import { AgentDashboardToolHandler } from '@api/services/agent-orchestrator/tools/agent-dashboard-tool-handler.service';
import { AgentMemoryGoalsToolHandler } from '@api/services/agent-orchestrator/tools/agent-memory-goals-tool-handler.service';
import { AgentRouteRewriteService } from '@api/services/agent-orchestrator/tools/agent-route-rewrite.service';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentSpawnModule } from '@api/services/agent-spawn/agent-spawn.module';
import { AgentThreadingModule } from '@api/services/agent-threading/agent-threading.module';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { ContentQualityModule } from '@api/services/content-quality/content-quality.module';
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
    forwardRef(() => WorkflowExecutionsModule),
    forwardRef(() => WorkflowsModule),
    forwardRef(() => AgentSpawnModule),
    SeoModule,
    forwardRef(() => SkillRuntimeModule),
  ],
  providers: [
    AgentCompletionCardBuilderService,
    AgentDashboardToolHandler,
    AgentMemoryGoalsToolHandler,
    AgentOrchestratorService,
    AgentRouteRewriteService,
    AgentStreamEffectsService,
    AgentThreadEventRecorderService,
    AgentToolExecutorService,
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
