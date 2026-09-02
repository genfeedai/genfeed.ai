import { KlingAIService } from '@api/services/integrations/klingai/services/klingai.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';

export const KlingAIModule = createServiceModule(KlingAIService, {
  additionalImports: [HttpModule],
});
