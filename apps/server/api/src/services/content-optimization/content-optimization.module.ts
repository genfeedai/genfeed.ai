import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { ContentPerformanceModule } from '@api/collections/content-performance/content-performance.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { AbTestSuggestionHarnessService } from '@api/services/content-optimization/ab-test-suggestion-harness.service';
import { ContentOptimizationController } from '@api/services/content-optimization/content-optimization.controller';
import { ContentOptimizationService } from '@api/services/content-optimization/content-optimization.service';
import { OpenAiLlmModule } from '@api/services/integrations/openai-llm/openai-llm.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ContentOptimizationController],
  exports: [AbTestSuggestionHarnessService, ContentOptimizationService],
  imports: [
    ConfigModule,
    LoggerModule,
    BrandMemoryModule,
    ContentPerformanceModule,
    PostsCoreModule,
    OpenAiLlmModule,
    TrendsModule,
    WorkflowsCoreModule,
  ],
  providers: [AbTestSuggestionHarnessService, ContentOptimizationService],
})
export class ContentOptimizationModule {}
