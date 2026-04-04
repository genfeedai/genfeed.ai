import { NewsService } from '@api/services/integrations/news/news.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';

export const NewsModule = createServiceModule(NewsService, {
  additionalImports: [HttpModule],
});
