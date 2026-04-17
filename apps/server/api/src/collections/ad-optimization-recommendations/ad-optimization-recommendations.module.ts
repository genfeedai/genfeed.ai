import { AdOptimizationRecommendationsService } from '@api/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AdOptimizationRecommendationsService],
  imports: [],
  providers: [AdOptimizationRecommendationsService],
})
export class AdOptimizationRecommendationsModule {}
