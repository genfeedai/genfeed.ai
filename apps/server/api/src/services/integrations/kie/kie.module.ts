import { KieService } from '@api/services/integrations/kie/kie.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
export const KieModule = createServiceModule(KieService, {
  additionalImports: [PollUntilModule],
});
