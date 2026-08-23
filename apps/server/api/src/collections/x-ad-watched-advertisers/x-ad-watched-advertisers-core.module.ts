import { XAdWatchedAdvertisersService } from '@api/collections/x-ad-watched-advertisers/services/x-ad-watched-advertisers.service';
import { Module } from '@nestjs/common';

/**
 * Watched-advertiser persistence only. Kept separate from
 * `XAdWatchedAdvertisersModule` so the future workflow-backed ingestion
 * processors (#3395 item 3, `apps/server/workers`) can inject the service
 * without pulling in the HTTP controller.
 */
@Module({
  exports: [XAdWatchedAdvertisersService],
  providers: [XAdWatchedAdvertisersService],
})
export class XAdWatchedAdvertisersCoreModule {}
