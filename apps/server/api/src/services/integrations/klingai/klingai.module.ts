import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { KlingAIService } from '@server/services/integrations/klingai/services/klingai.service';

export const KlingAIModule = createServiceModule(KlingAIService, {
  additionalImports: [HttpModule],
});
