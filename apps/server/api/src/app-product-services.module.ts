/** Product orchestration: generation, agent, ads, queues, and sync. */

import { AdminModule } from '@api/endpoints/admin/admin.module';
import { AdsResearchModule } from '@api/endpoints/ads-research/ads-research.module';
import { AiActionsModule } from '@api/endpoints/ai-actions/ai-actions.module';
import { AnalyticsModule } from '@api/endpoints/analytics/analytics.module';
import { CoreModule } from '@api/endpoints/core/core.module';
import { CostReportingModule } from '@api/endpoints/cost-reporting/cost-reporting.module';
import { MemoryModule } from '@api/helpers/memory/memory.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { SelfHostedSeedModule } from '@api/seeds/self-hosted-seed.module';
import { AdsGatewayModule } from '@api/services/ads-gateway/ads-gateway.module';
import { AgentCampaignOrchestratorModule } from '@api/services/agent-campaign/agent-campaign-orchestrator.module';
import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { AiInfluencerModule } from '@api/services/ai-influencer/ai-influencer.module';
import { BatchContentModule } from '@api/services/batch-content/batch-content.module';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { ContentEngineModule } from '@api/services/content-engine/content-engine.module';
import { ContentGatewayModule } from '@api/services/content-gateway/content-gateway.module';
import { ContentOptimizationModule } from '@api/services/content-optimization/content-optimization.module';
import { ContentOrchestrationModule } from '@api/services/content-orchestration/content-orchestration.module';
import { HiggsFieldModule } from '@api/services/integrations/higgsfield/higgsfield.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { SeoModule } from '@api/services/seo/seo.module';
import { SkillWorkflowModule } from '@api/services/skill-executor/skill-executor.module';
import { DesktopSyncModule } from '@api/services/sync/desktop-sync.module';
import { SyncModule } from '@api/services/sync/sync.module';
import { TwitterPipelineModule } from '@api/services/twitter-pipeline/twitter-pipeline.module';
import { SkillsProModule } from '@api/skills-pro/skills-pro.module';
import { CiTriageWebhookModule } from '@api/webhooks/ci-triage/ci-triage-webhook.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    BatchContentModule,
    BatchGenerationModule,
    ContentEngineModule,
    ContentGatewayModule,
    CostReportingModule,
    SkillWorkflowModule,
    ContentOrchestrationModule,
    ContentOptimizationModule,
    SeoModule,
    HiggsFieldModule,
    AiInfluencerModule,
    AgentCampaignOrchestratorModule,
    AgentOrchestratorModule,
    AiActionsModule,
    CoreModule,
    OpenRouterModule,
    TwitterPipelineModule,
    SkillsProModule,
    AdminModule,
    AdsResearchModule,
    AnalyticsModule,
    MemoryModule,
    AdsGatewayModule,
    QueuesModule,
    CiTriageWebhookModule,
    SyncModule,
    DesktopSyncModule,
    SelfHostedSeedModule,
  ],
})
export class AppProductServicesModule {}
