import { AdInsightsController } from '@api/endpoints/ad-insights/ad-insights.controller';
import { AdAggregationModule } from '@api/services/ad-aggregation/ad-aggregation.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AdInsightsController],
  imports: [AdAggregationModule, LoggerModule],
})
export class AdInsightsModule {}
