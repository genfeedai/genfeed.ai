import { createServiceModule } from '@api/shared/service-module.factory';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

export const ReplicateModule = createServiceModule(ReplicateService);
