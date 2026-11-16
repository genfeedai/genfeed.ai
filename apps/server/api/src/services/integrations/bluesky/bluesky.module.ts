import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { BlueskyController } from '@api/services/integrations/bluesky/controllers/bluesky.controller';
import { BlueskyService } from '@api/services/integrations/bluesky/services/bluesky.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(BlueskyService, {
  additionalImports: [
    HttpModule,
    BrandsModule,
    CredentialsCoreModule,
    ActivitiesModule,
  ],
});

@Module({
  controllers: [BlueskyController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class BlueskyModule {}
