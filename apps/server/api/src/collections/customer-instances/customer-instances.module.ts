import { CustomerInstancesService } from '@api/collections/customer-instances/services/customer-instances.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [CustomerInstancesService],
  imports: [],
  providers: [CustomerInstancesService],
})
export class CustomerInstancesModule {}
