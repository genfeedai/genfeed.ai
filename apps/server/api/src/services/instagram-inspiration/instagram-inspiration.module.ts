import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { InstagramInspirationService } from '@api/services/instagram-inspiration/instagram-inspiration.service';
import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { createServiceModule } from '@api/shared/service-module.factory';

export const InstagramInspirationModule = createServiceModule(
  InstagramInspirationService,
  {
    additionalImports: [ApifyModule, CacheModule, WorkflowsModule],
  },
);
