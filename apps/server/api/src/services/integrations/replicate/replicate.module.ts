import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { createServiceModule } from '@api/shared/service-module.factory';

export const ReplicateModule = createServiceModule(ReplicateService);
