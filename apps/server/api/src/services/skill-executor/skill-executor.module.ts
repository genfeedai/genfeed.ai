import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { ContentRunsModule } from '@api/collections/content-runs/content-runs.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { LeonardoAIModule } from '@api/services/integrations/leonardoai/leonardoai.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { ContentWritingHandler } from '@api/services/skill-executor/handlers/content-writing.handler';
import { ImageGenerationHandler } from '@api/services/skill-executor/handlers/image-generation.handler';
import { TrendDiscoveryHandler } from '@api/services/skill-executor/handlers/trend-discovery.handler';
import { SkillExecutorService } from '@api/services/skill-executor/skill-executor.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [SkillExecutorService],
  imports: [
    ByokModule,
    ContentIntelligenceModule,
    ContentRunsModule,
    SkillsModule,
    FalModule,
    LeonardoAIModule,
    LlmDispatcherModule,
    ReplicateModule,
    TrendsModule,
  ],
  providers: [
    ContentWritingHandler,
    ImageGenerationHandler,
    TrendDiscoveryHandler,
    SkillExecutorService,
  ],
})
export class SkillExecutorModule {}
