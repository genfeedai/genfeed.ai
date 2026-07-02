import { ContentRunsController } from '@api/collections/content-runs/controllers/content-runs.controller';
import { ContentRunRecommendationsService } from '@api/collections/content-runs/services/content-run-recommendations.service';
import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import { ContentOptimizationModule } from '@api/services/content-optimization/content-optimization.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ContentRunsController],
  exports: [ContentRunsService, ContentRunRecommendationsService],
  imports: [forwardRef(() => ContentOptimizationModule)],
  providers: [ContentRunsService, ContentRunRecommendationsService],
})
export class ContentRunsModule {}
