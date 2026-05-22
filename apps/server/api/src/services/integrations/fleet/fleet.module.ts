import { CustomerInstancesModule } from '@api/collections/customer-instances/customer-instances.module';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef } from '@nestjs/common';

export const FleetModule = createServiceModule(FleetService, {
  additionalImports: [forwardRef(() => CustomerInstancesModule), HttpModule],
});
