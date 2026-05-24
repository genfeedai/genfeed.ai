import { ContentRunsController } from '@api/collections/content-runs/controllers/content-runs.controller';
import { ContentRunRecommendationsService } from '@api/collections/content-runs/services/content-run-recommendations.service';
import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ContentRunsController],
  exports: [ContentRunsService, ContentRunRecommendationsService],
  imports: [],
  providers: [ContentRunsService, ContentRunRecommendationsService],
})
export class ContentRunsModule {}
