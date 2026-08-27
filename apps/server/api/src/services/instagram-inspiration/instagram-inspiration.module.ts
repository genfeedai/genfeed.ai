import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { CacheModule } from '@server/services/cache/cache.module';
import { InstagramInspirationService } from '@server/services/instagram-inspiration/instagram-inspiration.service';
import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { createServiceModule } from '@api/shared/service-module.factory';

export const InstagramInspirationModule = createServiceModule(
  InstagramInspirationService,
  {
    additionalImports: [ApifyModule, CacheModule, WorkflowsCoreModule],
  },
);
