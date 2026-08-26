import { CustomerInstancesModule } from '@api/collections/customer-instances/customer-instances.module';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { FleetService } from '@server/services/integrations/fleet/fleet.service';

const BaseModule = createServiceModule(FleetService, {
  additionalImports: [CustomerInstancesModule, HttpModule],
});

@Module({
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class FleetModule {}
