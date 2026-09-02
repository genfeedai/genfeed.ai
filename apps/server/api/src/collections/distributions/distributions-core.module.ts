import { DistributionsService } from '@api/collections/distributions/services/distributions.service';
import { Module } from '@nestjs/common';

/** Distribution persistence only. Channel senders stay on their own modules. */
@Module({
  exports: [DistributionsService],
  providers: [DistributionsService],
})
export class DistributionsCoreModule {}
