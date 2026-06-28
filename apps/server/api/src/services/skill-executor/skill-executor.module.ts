import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { ContentRunsModule } from '@api/collections/content-runs/content-runs.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { ManagedInferenceModule } from '@api/endpoints/v1/managed-inference/managed-inference.module';
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
import { SkillExecutorService } from '@api/services/skill-executor/skill-executor.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [SkillExecutorService],
  imports: [
    forwardRef(() => ByokModule),
    forwardRef(() => ContentIntelligenceModule),
    forwardRef(() => ContentRunsModule),
    forwardRef(() => ManagedInferenceModule),
    forwardRef(() => SkillsModule),
    forwardRef(() => FalModule),
    forwardRef(() => LeonardoAIModule),
    forwardRef(() => LlmDispatcherModule),
    forwardRef(() => ReplicateModule),
    forwardRef(() => TrendsModule),
  ],
  providers: [
    ContentGeoOptimizerHandler,
    ContentWritingHandler,
    ImageGenerationHandler,
    TrendDiscoveryHandler,
    TrendRemixHandler,
    SkillExecutorService,
  ],
})
export class SkillExecutorModule {}
