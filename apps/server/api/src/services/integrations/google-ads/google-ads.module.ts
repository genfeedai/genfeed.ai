import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { GoogleAdsController } from '@api/services/integrations/google-ads/controllers/google-ads.controller';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { GoogleAdsOAuthService } from '@api/services/integrations/google-ads/services/google-ads-oauth.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(GoogleAdsService, {
  additionalImports: [HttpModule, forwardRef(() => CredentialsModule)],
  additionalProviders: [GoogleAdsOAuthService],
});

@Module({
  controllers: [GoogleAdsController],
  exports: [...(BaseModule.exports as unknown[]), GoogleAdsOAuthService],
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class GoogleAdsModule {}
