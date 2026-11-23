import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { FacebookController } from '@api/services/integrations/facebook/controllers/facebook.controller';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { FacebookPageConnectionService } from '@api/services/integrations/facebook/services/facebook-page-connection.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(FacebookService, {
  additionalProviders: [FacebookPageConnectionService],
  additionalImports: [
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    BrandsCoreModule,
    CredentialsCoreModule,
  ],
});

@Module({
  controllers: [FacebookController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class FacebookModule {}
