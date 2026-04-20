/**
 * Tracked Links Module
 * Link tracking MVP: generate short links, track clicks, UTM parameters,
link performance analytics, and click attribution.
 */
import {
  RedirectController,
  TrackedLinksController,
} from '@api/collections/tracked-links/controllers/tracked-links.controller';
import { TrackedLinksService } from '@api/collections/tracked-links/services/tracked-links.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [TrackedLinksController, RedirectController],
  exports: [TrackedLinksService],
  imports: [],
  providers: [TrackedLinksService],
})
export class TrackedLinksModule {}
