import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { WordpressController } from '@api/services/integrations/wordpress/controllers/wordpress.controller';
import { WordpressService } from '@api/services/integrations/wordpress/services/wordpress.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(WordpressService, {
  additionalImports: [
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    BrandsModule,
    CredentialsCoreModule,
  ],
});

@Module({
  controllers: [WordpressController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class WordpressModule {}
