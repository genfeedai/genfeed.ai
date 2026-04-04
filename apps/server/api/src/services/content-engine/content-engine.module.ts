import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContentDraftsModule } from '@api/collections/content-drafts/content-drafts.module';
import { ContentPlanItemsModule } from '@api/collections/content-plan-items/content-plan-items.module';
import { ContentPlansModule } from '@api/collections/content-plans/content-plans.module';
import { ContentEngineController } from '@api/services/content-engine/content-engine.controller';
import { ContentExecutionService } from '@api/services/content-engine/content-execution.service';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import { ContentReviewService } from '@api/services/content-engine/content-review.service';
import { ContentOrchestrationModule } from '@api/services/content-orchestration/content-orchestration.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { SkillExecutorModule } from '@api/services/skill-executor/skill-executor.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ContentEngineController],
  exports: [
    ContentPlannerService,
    ContentExecutionService,
    ContentReviewService,
  ],
  imports: [
    ContentPlansModule,
    ContentPlanItemsModule,
    ContentDraftsModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => LlmDispatcherModule),
    forwardRef(() => SkillExecutorModule),
    forwardRef(() => ContentOrchestrationModule),
  ],
  providers: [
    ContentPlannerService,
    ContentExecutionService,
    ContentReviewService,
  ],
})
export class ContentEngineModule {}
