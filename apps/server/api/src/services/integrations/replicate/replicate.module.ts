import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { createServiceModule } from '@api/shared/service-module.factory';

export const ReplicateModule = createServiceModule(ReplicateService, {
  additionalImports: [OpenRouterModule],
});
