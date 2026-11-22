import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { NewsService } from '@api/services/integrations/news/news.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';

export const NewsModule = createServiceModule(NewsService, {
  additionalImports: [
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
  ],
});
