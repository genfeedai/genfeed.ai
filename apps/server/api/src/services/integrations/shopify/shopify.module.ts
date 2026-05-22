import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { ShopifyController } from '@api/services/integrations/shopify/controllers/shopify.controller';
import { ShopifyService } from '@api/services/integrations/shopify/services/shopify.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(ShopifyService, {
  additionalImports: [HttpModule, CredentialsCoreModule],
});

@Module({
  controllers: [ShopifyController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class ShopifyModule {}
