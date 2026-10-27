import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { ManagedInferenceModule } from '@api/endpoints/v1/managed-inference/managed-inference.module';
import { AgentChatModelRegistryModule } from '@api/services/agent-orchestrator/agent-chat-model-registry.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { LeonardoAIModule } from '@api/services/integrations/leonardoai/leonardoai.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { ContentGeoOptimizerHandler } from '@api/services/skill-executor/handlers/content-geo-optimizer.handler';
import { ContentWritingHandler } from '@api/services/skill-executor/handlers/content-writing.handler';
import { ImageGenerationHandler } from '@api/services/skill-executor/handlers/image-generation.handler';
import { TrendDiscoveryHandler } from '@api/services/skill-executor/handlers/trend-discovery.handler';
import { TrendRemixHandler } from '@api/services/skill-executor/handlers/trend-remix.handler';
import { SkillWorkflowService } from '@api/services/skill-executor/skill-executor.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [SkillWorkflowService],
  imports: [
    AgentChatModelRegistryModule,
    ByokModule,
    ContentIntelligenceModule,
    ManagedInferenceModule,
    SkillsModule,
    FalModule,
    LeonardoAIModule,
    LlmDispatcherModule,
    ReplicateModule,
    TrendsModule,
    WorkflowsCoreModule,
  ],
  providers: [
    ContentGeoOptimizerHandler,
    ContentWritingHandler,
    ImageGenerationHandler,
    TrendDiscoveryHandler,
    TrendRemixHandler,
    SkillWorkflowService,
  ],
})
export class SkillWorkflowModule {}
