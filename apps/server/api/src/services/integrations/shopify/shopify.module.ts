import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { ShopifyController } from '@api/services/integrations/shopify/controllers/shopify.controller';
import { ShopifyService } from '@api/services/integrations/shopify/services/shopify.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(ShopifyService, {
  additionalImports: [HttpModule, forwardRef(() => CredentialsModule)],
});

@Module({
  controllers: [ShopifyController],
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class ShopifyModule {}
