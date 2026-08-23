import { XAdWatchedAdvertisersController } from '@api/collections/x-ad-watched-advertisers/controllers/x-ad-watched-advertisers.controller';
import { XAdWatchedAdvertisersCoreModule } from '@api/collections/x-ad-watched-advertisers/x-ad-watched-advertisers-core.module';
import { Module } from '@nestjs/common';

/**
 * Org/brand-scoped CRUD for the X advertiser watchlist that drives the
 * X Ads Repository export ingestion pipeline (#3395).
 */
@Module({
  controllers: [XAdWatchedAdvertisersController],
  exports: [XAdWatchedAdvertisersCoreModule],
  imports: [XAdWatchedAdvertisersCoreModule],
})
export class XAdWatchedAdvertisersModule {}
