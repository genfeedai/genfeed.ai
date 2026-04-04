import { GiphyService } from '@api/services/integrations/giphy/giphy.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';

export const GiphyModule = createServiceModule(GiphyService, {
  additionalImports: [HttpModule],
});
