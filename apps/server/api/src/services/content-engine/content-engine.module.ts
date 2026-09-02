import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContentPlanItemsModule } from '@api/collections/content-plan-items/content-plan-items.module';
import { ContentPlansModule } from '@api/collections/content-plans/content-plans.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { ContentEngineController } from '@api/services/content-engine/content-engine.controller';
import { ContentExecutionService } from '@api/services/content-engine/content-execution.service';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import { ContentOrchestrationModule } from '@api/services/content-orchestration/content-orchestration.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { SkillWorkflowModule } from '@api/services/skill-executor/skill-executor.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ContentEngineController],
  exports: [ContentPlannerService, ContentExecutionService],
  imports: [
    ContentPlansModule,
    ContentPlanItemsModule,
    PostsModule,
    BrandsModule,
    LlmDispatcherModule,
    SkillWorkflowModule,
    ContentOrchestrationModule,
  ],
  providers: [ContentPlannerService, ContentExecutionService],
})
export class ContentEngineModule {}
