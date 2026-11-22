import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { GoogleBusinessController } from '@api/services/integrations/google-business/controllers/google-business.controller';
import { GoogleBusinessService } from '@api/services/integrations/google-business/services/google-business.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(GoogleBusinessService, {
  additionalImports: [
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    BrandsCoreModule,
    CredentialsCoreModule,
    ActivitiesModule,
  ],
});

@Module({
  controllers: [GoogleBusinessController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class GoogleBusinessModule {}
