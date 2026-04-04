import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { ConfigModule } from '@api/config/config.module';
import { GoogleAdsAdapter } from '@api/services/ads-gateway/adapters/google-ads.adapter';
import { MetaAdsAdapter } from '@api/services/ads-gateway/adapters/meta-ads.adapter';
import { TikTokAdsAdapter } from '@api/services/ads-gateway/adapters/tiktok-ads.adapter';
import { AdsGatewayController } from '@api/services/ads-gateway/ads-gateway.controller';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import { GoogleAdsModule } from '@api/services/integrations/google-ads/google-ads.module';
import { MetaAdsModule } from '@api/services/integrations/meta-ads/meta-ads.module';
import { TikTokAdsModule } from '@api/services/integrations/tiktok-ads/tiktok-ads.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [AdsGatewayController],
  exports: [AdsGatewayService],
  imports: [
    forwardRef(() => CredentialsModule),
    forwardRef(() => MetaAdsModule),
    forwardRef(() => GoogleAdsModule),
    forwardRef(() => TikTokAdsModule),
    ConfigModule,
    LoggerModule,
  ],
  providers: [
    AdsGatewayService,
    MetaAdsAdapter,
    GoogleAdsAdapter,
    TikTokAdsAdapter,
  ],
})
export class AdsGatewayModule {}
