import { AdOptimizationConfigsService } from '@api/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [AdOptimizationConfigsService],
  imports: [],
  providers: [AdOptimizationConfigsService],
})
export class AdOptimizationConfigsModule {}
