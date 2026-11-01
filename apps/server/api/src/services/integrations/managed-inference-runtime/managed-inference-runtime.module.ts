import { CustomerInstancesModule } from '@api/collections/customer-instances/customer-instances.module';
import { ManagedInferenceRuntimeService } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(ManagedInferenceRuntimeService, {
  additionalImports: [CustomerInstancesModule, HttpModule, PollUntilModule],
});

@Module({
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class ManagedInferenceRuntimeModule {}
