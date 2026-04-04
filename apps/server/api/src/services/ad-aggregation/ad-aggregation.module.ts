import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { AdAggregationService } from '@api/services/ad-aggregation/ad-aggregation.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [AdAggregationService],
  imports: [AdPerformanceModule, LoggerModule],
  providers: [AdAggregationService],
})
export class AdAggregationModule {}
