import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { GoogleAdsController } from '@api/services/integrations/google-ads/controllers/google-ads.controller';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { GoogleAdsAccountsService } from '@api/services/integrations/google-ads/services/google-ads-accounts.service';
import { GoogleAdsOAuthService } from '@api/services/integrations/google-ads/services/google-ads-oauth.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const BaseModule = createServiceModule(GoogleAdsService, {
  additionalImports: [
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    BrandsCoreModule,
    CredentialsCoreModule,
  ],
  additionalProviders: [GoogleAdsAccountsService, GoogleAdsOAuthService],
});

@Module({
  controllers: [GoogleAdsController],
  exports: [GoogleAdsService, GoogleAdsOAuthService],
  imports: BaseModule.imports ?? [],
  providers: BaseModule.providers ?? [],
})
export class GoogleAdsModule {}
