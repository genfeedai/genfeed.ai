import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { GoogleAdsAdapter } from '@api/services/ads-gateway/adapters/google-ads.adapter';
import { MetaAdsAdapter } from '@api/services/ads-gateway/adapters/meta-ads.adapter';
import { TikTokAdsAdapter } from '@api/services/ads-gateway/adapters/tiktok-ads.adapter';
import { XAdsAdapter } from '@api/services/ads-gateway/adapters/x-ads.adapter';
import { AdsGatewayController } from '@api/services/ads-gateway/ads-gateway.controller';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import { AdsGatewayRequestContextService } from '@api/services/ads-gateway/ads-gateway-request-context.service';
import { AdsGatewayWriteController } from '@api/services/ads-gateway/ads-gateway-write.controller';
import { GoogleAdsModule } from '@api/services/integrations/google-ads/google-ads.module';
import { MetaAdsModule } from '@api/services/integrations/meta-ads/meta-ads.module';
import { TikTokAdsModule } from '@api/services/integrations/tiktok-ads/tiktok-ads.module';
import { XAdsModule } from '@api/services/integrations/x-ads/x-ads.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AdsGatewayWriteController, AdsGatewayController],
  exports: [AdsGatewayService, AdsGatewayRequestContextService],
  imports: [
    CredentialsCoreModule,
    MetaAdsModule,
    GoogleAdsModule,
    TikTokAdsModule,
    XAdsModule,
    ConfigModule,
    LoggerModule,
  ],
  providers: [
    AdsGatewayService,
    AdsGatewayRequestContextService,
    MetaAdsAdapter,
    GoogleAdsAdapter,
    TikTokAdsAdapter,
    XAdsAdapter,
  ],
})
export class AdsGatewayModule {}
