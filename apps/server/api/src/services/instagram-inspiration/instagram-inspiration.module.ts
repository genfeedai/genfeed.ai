import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { InstagramInspirationService } from '@api/services/instagram-inspiration/instagram-inspiration.service';
import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { createServiceModule } from '@api/shared/service-module.factory';
import { forwardRef } from '@nestjs/common';

export const InstagramInspirationModule = createServiceModule(
  InstagramInspirationService,
  {
    additionalImports: [
      forwardRef(() => ApifyModule),
      CacheModule,
      forwardRef(() => WorkflowsModule),
    ],
  },
);
