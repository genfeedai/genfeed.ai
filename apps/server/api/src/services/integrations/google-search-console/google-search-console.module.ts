import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { GoogleSearchConsoleController } from '@api/services/integrations/google-search-console/controllers/google-search-console.controller';
import { GoogleSearchConsoleService } from '@api/services/integrations/google-search-console/services/google-search-console.service';
import { GoogleSearchConsoleOAuthService } from '@api/services/integrations/google-search-console/services/google-search-console-oauth.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(GoogleSearchConsoleService, {
  additionalImports: [
    HttpModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsCoreModule),
  ],
  additionalProviders: [GoogleSearchConsoleOAuthService],
});

@Module({
  controllers: [GoogleSearchConsoleController],
  exports: [GoogleSearchConsoleService, GoogleSearchConsoleOAuthService],
  imports: BaseModule.imports ?? [],
  providers: BaseModule.providers ?? [],
})
export class GoogleSearchConsoleModule {}
