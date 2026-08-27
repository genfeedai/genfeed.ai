import { Module } from '@nestjs/common';
import { CustomerInstanceResolverService } from '@server/collections/customer-instances/customer-instance-resolver.service';
import { SERVER_TOKENS } from '@server/server.dependencies';
import { WorkersDomainModule } from '@server/workers-domain.module';
import { FileServicesModule } from '@workers/services/file-services.module';

@Module({
  imports: [WorkersDomainModule, FileServicesModule],
  providers: [
    {
      provide: SERVER_TOKENS.customerInstances,
      useExisting: CustomerInstanceResolverService,
    },
  ],
})
export class GenerationServicesModule {}
