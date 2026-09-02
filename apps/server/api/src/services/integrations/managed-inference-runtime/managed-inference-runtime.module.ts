import { CustomerInstancesModule } from '@api/collections/customer-instances/customer-instances.module';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ManagedInferenceRuntimeService } from '@server/services/integrations/managed-inference-runtime/managed-inference-runtime.service';

const BaseModule = createServiceModule(ManagedInferenceRuntimeService, {
  additionalImports: [CustomerInstancesModule, HttpModule],
});

@Module({
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class ManagedInferenceRuntimeModule {}
