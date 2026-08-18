import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import { Module } from '@nestjs/common';

/** Performance persistence only. Sync/HTTP stays on ContentPerformanceModule. */
@Module({
  exports: [ContentPerformanceService],
  providers: [ContentPerformanceService],
})
export class ContentPerformanceCoreModule {}
