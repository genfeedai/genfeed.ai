import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TikTokAdsService } from '@server/services/integrations/tiktok-ads/services/tiktok-ads.service';

const BaseModule = createServiceModule(TikTokAdsService, {
  additionalImports: [HttpModule],
});

@Module({
  exports: BaseModule.exports,
  imports: BaseModule.imports,
  providers: BaseModule.providers,
})
export class TikTokAdsModule {}
