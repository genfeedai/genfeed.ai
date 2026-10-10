import { CreditsModule } from '@api/collections/credits/credits.module';
import { RouterModule } from '@api/services/router/router.module';
import { Module } from '@nestjs/common';
import { LowCreditThresholdService } from './low-credit-threshold.service';

@Module({
  exports: [LowCreditThresholdService],
  imports: [CreditsModule, RouterModule],
  providers: [LowCreditThresholdService],
})
export class LowCreditThresholdModule {}
