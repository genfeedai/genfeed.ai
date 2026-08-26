import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { XAdsController } from '@api/services/integrations/x-ads/controllers/x-ads.controller';
import { XAdsService } from '@api/services/integrations/x-ads/services/x-ads.service';
import { XAdsOAuthService } from '@api/services/integrations/x-ads/services/x-ads-oauth.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(XAdsService, {
  additionalImports: [BrandsCoreModule, CredentialsCoreModule],
  additionalProviders: [XAdsOAuthService],
});

@Module({
  controllers: [XAdsController],
  exports: [XAdsService, XAdsOAuthService],
  imports: BaseModule.imports ?? [],
  providers: BaseModule.providers ?? [],
})
export class XAdsModule {}
