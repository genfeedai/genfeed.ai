import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AdPerformanceService],
  imports: [],
  providers: [AdPerformanceService],
})
export class AdPerformanceModule {}
