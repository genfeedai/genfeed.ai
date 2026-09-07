import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { AdWatchedAdvertisersCoreModule } from '@api/collections/ad-watched-advertisers/ad-watched-advertisers-core.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContentPerformanceModule } from '@api/collections/content-performance/content-performance.module';
import { ContentPlanItemsModule } from '@api/collections/content-plan-items/content-plan-items.module';
import { ContentPlansModule } from '@api/collections/content-plans/content-plans.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { SocialSourcesModule } from '@api/collections/social-sources/social-sources.module';
import { SourcePostsModule } from '@api/collections/source-posts/source-posts.module';
import { ContentEngineController } from '@api/services/content-engine/content-engine.controller';
import { ContentExecutionService } from '@api/services/content-engine/content-execution.service';
import { ContentPlanSeedsService } from '@api/services/content-engine/content-plan-seeds.service';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import { PlanPerformanceContextService } from '@api/services/content-engine/plan-performance-context.service';
import { ContentOrchestrationModule } from '@api/services/content-orchestration/content-orchestration.module';
import { LlmDispatcherModule } from '@api/services/integrations/llm/llm-dispatcher.module';
import { PatternMatcherModule } from '@api/services/pattern-matcher/pattern-matcher.module';
import { SkillWorkflowModule } from '@api/services/skill-executor/skill-executor.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ContentEngineController],
  exports: [ContentPlannerService, ContentExecutionService],
  imports: [
    AdPerformanceModule,
    AdWatchedAdvertisersCoreModule,
    ContentPerformanceModule,
    ContentPlansModule,
    ContentPlanItemsModule,
    PatternMatcherModule,
    PostsModule,
    SocialSourcesModule,
    SourcePostsModule,
    BrandsModule,
    LlmDispatcherModule,
    LoggerModule,
    SkillWorkflowModule,
    ContentOrchestrationModule,
  ],
  providers: [
    ContentPlannerService,
    ContentExecutionService,
    ContentPlanSeedsService,
    PlanPerformanceContextService,
  ],
})
export class ContentEngineModule {}
