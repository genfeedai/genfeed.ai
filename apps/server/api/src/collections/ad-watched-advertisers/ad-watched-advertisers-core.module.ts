import { AdWatchedAdvertisersService } from '@api/collections/ad-watched-advertisers/services/ad-watched-advertisers.service';
import { Module } from '@nestjs/common';

/**
 * Watched-advertiser persistence only. Kept separate from
 * `AdWatchedAdvertisersModule` so the workflow-backed ingestion processors
 * (#3395 item 3, `apps/server/workers`) can inject the service without
 * pulling in the HTTP controller.
 */
@Module({
  exports: [AdWatchedAdvertisersService],
  providers: [AdWatchedAdvertisersService],
})
export class AdWatchedAdvertisersCoreModule {}
