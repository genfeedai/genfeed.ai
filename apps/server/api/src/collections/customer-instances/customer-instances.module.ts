import { CustomerInstancesService } from '@api/collections/customer-instances/services/customer-instances.service';
import { SERVER_TOKENS } from '@api/index';
import { Module } from '@nestjs/common';

const SERVER_CUSTOMER_INSTANCE_RESOLVER_PROVIDER = {
  provide: SERVER_TOKENS.customerInstances,
  useExisting: CustomerInstancesService,
};

@Module({
  exports: [
    CustomerInstancesService,
    SERVER_CUSTOMER_INSTANCE_RESOLVER_PROVIDER,
  ],
  imports: [],
  providers: [
    CustomerInstancesService,
    SERVER_CUSTOMER_INSTANCE_RESOLVER_PROVIDER,
  ],
})
export class CustomerInstancesModule {}
