import { AdInsightsController } from '@api/endpoints/ad-insights/ad-insights.controller';
import { AdAggregationModule } from '@api/services/ad-aggregation/ad-aggregation.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [AdInsightsController],
  imports: [forwardRef(() => AdAggregationModule), LoggerModule],
})
export class AdInsightsModule {}
