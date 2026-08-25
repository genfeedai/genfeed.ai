import { AdWatchedAdvertisersCoreModule } from '@api/collections/ad-watched-advertisers/ad-watched-advertisers-core.module';
import { AdWatchedAdvertisersController } from '@api/collections/ad-watched-advertisers/controllers/ad-watched-advertisers.controller';
import { Module } from '@nestjs/common';

/**
 * Org/brand-scoped CRUD for the competitor advertiser watchlist that drives
 * paid-creative research ingestion across every ad platform (#3395, #3537).
 */
@Module({
  controllers: [AdWatchedAdvertisersController],
  exports: [AdWatchedAdvertisersCoreModule],
  imports: [AdWatchedAdvertisersCoreModule],
})
export class AdWatchedAdvertisersModule {}
