import { AdInsightsService } from '@api/collections/ad-insights/services/ad-insights.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AdInsightsService],
  imports: [],
  providers: [AdInsightsService],
})
export class AdInsightsModule {}
