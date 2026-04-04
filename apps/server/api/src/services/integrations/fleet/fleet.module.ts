import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';

export const FleetModule = createServiceModule(FleetService, {
  additionalImports: [HttpModule],
});
